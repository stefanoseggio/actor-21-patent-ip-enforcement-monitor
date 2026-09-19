import { describe, expect, it } from 'vitest';

import { ActorInputSchema } from '../src/schemas.js';

/**
 * Timeout-budget fix (2026-09-19): epWatchlist has no natural upper bound
 * from the caller's side, but each entry costs one sequential,
 * independently-retried HTTP call in fetchEpoOppositionEvents() (see
 * src/sources/epoOpposition.ts), so an uncapped watchlist can walk long
 * enough to exceed this actor's real defaultRunOptions.timeoutSecs (3600)
 * on worst-case retry backoff alone, regardless of maxItemsPerSource (which
 * only caps matched opposition events, not watchlist entries walked).
 */
describe('ActorInputSchema epWatchlist cap (timeout-budget fix)', () => {
    const baseInput = {
        sources: ['epo_opposition'] as const,
        epoOpsConsumerKey: 'key',
        epoOpsConsumerSecret: 'secret',
    };

    it('accepts exactly 100 entries (the documented cap)', () => {
        const result = ActorInputSchema.safeParse({
            ...baseInput,
            epWatchlist: Array.from({ length: 100 }, (_, i) => `EP${3000000 + i}`),
        });
        expect(result.success).toBe(true);
    });

    it('rejects 101 entries (one past the documented cap)', () => {
        const result = ActorInputSchema.safeParse({
            ...baseInput,
            epWatchlist: Array.from({ length: 101 }, (_, i) => `EP${3000000 + i}`),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path.join('.') === 'epWatchlist');
            expect(issue).toBeDefined();
        }
    });

    it('still requires at least one entry for epo_opposition (unrelated pre-existing rule, unaffected by the cap)', () => {
        const result = ActorInputSchema.safeParse({ ...baseInput, epWatchlist: [] });
        expect(result.success).toBe(false);
    });
});
