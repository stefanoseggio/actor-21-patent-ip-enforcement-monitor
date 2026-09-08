import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
        vi.restoreAllMocks();
    });

    it('retries on HTTP 429 honoring the 5-second USPTO floor even with a tiny baseDelayMs', async () => {
        const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
        vi.spyOn(globalThis, 'fetch')
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
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(503, 'Service Unavailable'))
            .mockResolvedValueOnce(jsonResponse(200, '{"ok":true}'));

        const promise = fetchJsonWithRetry('https://ops.epo.org/3.2/rest-services/legal/publication/epodoc/EP1000000', {}, { baseDelayMs: 10 });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('honors a Retry-After header on a 503 when the server sends one', async () => {
        const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(503, 'try later', { 'retry-after': '3' }))
            .mockResolvedValueOnce(jsonResponse(200, '{"ok":true}'));

        const promise = fetchJsonWithRetry('https://ops.epo.org/3.2/rest-services/legal/publication/epodoc/EP1000000', {}, { baseDelayMs: 10 });
        await vi.runAllTimersAsync();
        await promise;

        const delays = sleepSpy.mock.calls.map((call) => call[1]);
        expect(delays).toContain(3000);
    });

    it('gives up after maxRetries on repeated 503s and throws', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(503, 'still down'));

        const promise = fetchJsonWithRetry('https://ops.epo.org/x', {}, { maxRetries: 2, baseDelayMs: 5 });
        const assertion = expect(promise).rejects.toThrow(/503/);
        await vi.runAllTimersAsync();
        await assertion;
    });

    it('does not retry a genuine 4xx client error like 401', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(401, 'Unauthorized'));

        await expect(fetchJsonWithRetry('https://api.uspto.gov/x', {}, { baseDelayMs: 5 })).rejects.toThrow(/401/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
