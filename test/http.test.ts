import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// impit's Impit.fetch() is a native binding, not built on the global `fetch` -
// vi.spyOn(globalThis, 'fetch')/vi.stubGlobal('fetch', ...) never intercepts
// it. Mock the `impit` module itself instead, so `new Impit()` in
// src/http.ts returns an object whose `.fetch` is this mock. vi.hoisted() is
// required because vi.mock() factories run before the top-level `const`
// below would otherwise be initialized.
const { fetchMock } = vi.hoisted(() => ({
    fetchMock: vi.fn<(url: string, init: RequestInit) => Promise<Response>>(),
}));
vi.mock('impit', () => ({
    // Must be a real `function`, not an arrow function - `new Impit(...)`
    // requires a constructible mock implementation.
    Impit: vi.fn().mockImplementation(function ImpitMock() {
        return { fetch: fetchMock };
    }),
}));

import { fetchJsonWithRetry } from '../src/http.js';

function jsonResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
    return new Response(body, { status, headers });
}

describe('fetchJsonWithRetry - 429 and 503 handling', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks(); // restores vi.spyOn(globalThis, 'setTimeout') spies (not fetchMock - see below)
        fetchMock.mockReset(); // fetchMock is a plain vi.fn() from vi.hoisted(), not a vi.spyOn spy, so restoreAllMocks doesn't touch it
    });

    it('retries on HTTP 429 honoring the 5-second USPTO floor even with a tiny baseDelayMs', async () => {
        const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
        fetchMock
            .mockResolvedValueOnce(jsonResponse(429, 'Too Many Requests'))
            .mockResolvedValueOnce(jsonResponse(200, '{"ok":true}'));

        const promise = fetchJsonWithRetry('https://api.uspto.gov/api/v1/patent/trials/proceedings/search', { method: 'POST' }, { baseDelayMs: 10 });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ ok: true });
        const delays = sleepSpy.mock.calls.map((call) => call[1]);
        expect(delays).toContain(5000);
    });

    it('retries on HTTP 503 as an explicit, calibrated branch (not just the generic catch-all)', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(503, 'Service Unavailable')).mockResolvedValueOnce(jsonResponse(200, '{"ok":true}'));

        const promise = fetchJsonWithRetry('https://ops.epo.org/3.2/rest-services/legal/publication/epodoc/EP1000000', {}, { baseDelayMs: 10 });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('honors a Retry-After header on a 503 when the server sends one', async () => {
        const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
        fetchMock
            .mockResolvedValueOnce(jsonResponse(503, 'try later', { 'retry-after': '3' }))
            .mockResolvedValueOnce(jsonResponse(200, '{"ok":true}'));

        const promise = fetchJsonWithRetry('https://ops.epo.org/3.2/rest-services/legal/publication/epodoc/EP1000000', {}, { baseDelayMs: 10 });
        await vi.runAllTimersAsync();
        await promise;

        const delays = sleepSpy.mock.calls.map((call) => call[1]);
        expect(delays).toContain(3000);
    });

    it('gives up after maxRetries on repeated 503s and throws', async () => {
        fetchMock.mockResolvedValue(jsonResponse(503, 'still down'));

        const promise = fetchJsonWithRetry('https://ops.epo.org/x', {}, { maxRetries: 2, baseDelayMs: 5 });
        const assertion = expect(promise).rejects.toThrow(/503/);
        await vi.runAllTimersAsync();
        await assertion;
    });

    it('does not retry a genuine 4xx client error like 401', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(401, 'Unauthorized'));

        await expect(fetchJsonWithRetry('https://api.uspto.gov/x', {}, { baseDelayMs: 5 })).rejects.toThrow(/401/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
