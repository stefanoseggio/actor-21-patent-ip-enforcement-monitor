import { Actor } from 'apify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { classifyRecord, createEmptyState, isNewlyTerminated, loadState, saveSourceState } from '../src/state.js';
import type { DeltaState } from '../src/state.js';

describe('classifyRecord (pure)', () => {
    it('classifies a record_id never seen before as first_seen', () => {
        const state = createEmptyState();
        expect(classifyRecord(state, 'uspto_ptab', 'IPR2026-00001', 'fp1')).toBe('first_seen');
    });

    it('classifies a previously-seen record with a changed fingerprint as updated', () => {
        const state: DeltaState = {
            seenIds: { uspto_ptab: ['IPR2026-00001'] },
            statusFingerprints: { uspto_ptab: { 'IPR2026-00001': 'Instituted|2026-01-01|' } },
            terminationDates: {},
            lastRunAt: {},
        };
        expect(classifyRecord(state, 'uspto_ptab', 'IPR2026-00001', 'FWD Entered|2026-06-01|')).toBe('updated');
    });

    it('classifies a previously-seen record with an identical fingerprint as unchanged', () => {
        const state: DeltaState = {
            seenIds: { uspto_ptab: ['IPR2026-00001'] },
            statusFingerprints: { uspto_ptab: { 'IPR2026-00001': 'Instituted|2026-01-01|' } },
            terminationDates: {},
            lastRunAt: {},
        };
        expect(classifyRecord(state, 'uspto_ptab', 'IPR2026-00001', 'Instituted|2026-01-01|')).toBe('unchanged');
    });

    it('does not confuse two different sources sharing a record_id', () => {
        const state: DeltaState = {
            seenIds: { uspto_ptab: ['SAME-ID'] },
            statusFingerprints: { uspto_ptab: { 'SAME-ID': 'fp1' } },
            terminationDates: {},
            lastRunAt: {},
        };
        expect(classifyRecord(state, 'epo_opposition', 'SAME-ID', 'anything')).toBe('first_seen');
    });
});

describe('isNewlyTerminated (pure)', () => {
    it('is false for a record never seen before, even if it is already terminated on first sight', () => {
        const state = createEmptyState();
        expect(isNewlyTerminated(state, 'uspto_ptab', 'IPR2026-00001', '2026-08-01')).toBe(false);
    });

    it('is true when a previously-seen record with no termination date now has one', () => {
        const state: DeltaState = {
            seenIds: { uspto_ptab: ['IPR2026-00001'] },
            statusFingerprints: {},
            terminationDates: { uspto_ptab: { 'IPR2026-00001': '' } },
            lastRunAt: {},
        };
        expect(isNewlyTerminated(state, 'uspto_ptab', 'IPR2026-00001', '2026-08-01')).toBe(true);
    });

    it('is true when a previously-seen record has no terminationDates entry at all yet (treated as empty)', () => {
        const state: DeltaState = {
            seenIds: { uspto_ptab: ['IPR2026-00001'] },
            statusFingerprints: {},
            terminationDates: {},
            lastRunAt: {},
        };
        expect(isNewlyTerminated(state, 'uspto_ptab', 'IPR2026-00001', '2026-08-01')).toBe(true);
    });

    it('is false when the current terminationDate is still null (no transition)', () => {
        const state: DeltaState = {
            seenIds: { uspto_ptab: ['IPR2026-00001'] },
            statusFingerprints: {},
            terminationDates: { uspto_ptab: { 'IPR2026-00001': '' } },
            lastRunAt: {},
        };
        expect(isNewlyTerminated(state, 'uspto_ptab', 'IPR2026-00001', null)).toBe(false);
    });

    it('is false when the record was already terminated last run too (no new transition)', () => {
        const state: DeltaState = {
            seenIds: { uspto_ptab: ['IPR2026-00001'] },
            statusFingerprints: {},
            terminationDates: { uspto_ptab: { 'IPR2026-00001': '2026-07-01' } },
            lastRunAt: {},
        };
        expect(isNewlyTerminated(state, 'uspto_ptab', 'IPR2026-00001', '2026-08-01')).toBe(false);
    });
});

describe('state persistence (loadState/saveSourceState)', () => {
    beforeAll(async () => {
        await Actor.init();
        // Local storage is NOT purged between separate `npm test`
        // invocations (unlike a fresh CI run) - explicitly reset this
        // suite's own key so repeated local runs don't see stale state
        // left over from a previous invocation.
        const store = await Actor.openKeyValueStore('actor-21-patent-ip-enforcement-monitor-delta-state');
        await store.setValue('state', null);
    });

    afterAll(async () => {
        await Actor.exit({ exit: false });
    });

    it('returns an empty state when nothing has been saved yet', async () => {
        const state = await loadState();
        expect(state.seenIds).toEqual({});
        expect(state.terminationDates).toEqual({});
    });

    it('round-trips seenIds, statusFingerprints, and terminationDates together', async () => {
        const state = await saveSourceState(
            createEmptyState(),
            'uspto_ptab',
            ['IPR2026-00001'],
            { 'IPR2026-00001': 'Instituted|2026-01-01|' },
            '2026-09-08T00:00:00.000Z',
            { 'IPR2026-00001': '' },
        );
        expect(state.seenIds.uspto_ptab).toContain('IPR2026-00001');
        expect(state.terminationDates.uspto_ptab['IPR2026-00001']).toBe('');

        const loaded = await loadState();
        expect(loaded.terminationDates.uspto_ptab['IPR2026-00001']).toBe('');
    });

    it('prunes statusFingerprints/terminationDates to the same key set retained in seenIds after capping at MAX_SEEN_IDS_PER_SOURCE (no unbounded growth)', async () => {
        // Seed 5000 previously-seen ids (the real cap) each with a
        // fingerprint/terminationDate entry, so this run's one new id pushes
        // the merged list to 5001 and the cap evicts exactly one id
        // (the last one in merge order, 'P5000').
        const previousIds = Array.from({ length: 5000 }, (_, i) => `P${String(i + 1).padStart(4, '0')}`);
        const seededFingerprints: Record<string, string> = {};
        const seededTerminationDates: Record<string, string> = {};
        for (const id of previousIds) {
            seededFingerprints[id] = `fp-${id}`;
            seededTerminationDates[id] = '';
        }
        const seeded: DeltaState = {
            seenIds: { uspto_ptab: previousIds },
            statusFingerprints: { uspto_ptab: seededFingerprints },
            terminationDates: { uspto_ptab: seededTerminationDates },
            lastRunAt: {},
        };

        const next = await saveSourceState(seeded, 'uspto_ptab', ['NEW-1'], { 'NEW-1': 'fp-new' }, '2026-09-19T00:00:00.000Z', { 'NEW-1': '' });

        expect(next.seenIds.uspto_ptab).toHaveLength(5000);
        expect(next.seenIds.uspto_ptab).not.toContain('P5000');
        expect(next.seenIds.uspto_ptab).toContain('P4999');
        expect(next.seenIds.uspto_ptab).toContain('NEW-1');

        // The evicted id's fingerprint/terminationDate entries must be
        // pruned along with it, not merged in and left to grow unboundedly
        // across scheduled runs.
        expect(next.statusFingerprints.uspto_ptab).not.toHaveProperty('P5000');
        expect(next.terminationDates.uspto_ptab).not.toHaveProperty('P5000');
        expect(Object.keys(next.statusFingerprints.uspto_ptab)).toHaveLength(5000);
        expect(Object.keys(next.terminationDates.uspto_ptab)).toHaveLength(5000);
        expect(next.statusFingerprints.uspto_ptab['NEW-1']).toBe('fp-new');
    });

    it('backfills a missing terminationDates map from a legacy (pre-2026-09-08) persisted shape without throwing', async () => {
        const store = await Actor.openKeyValueStore('actor-21-patent-ip-enforcement-monitor-delta-state');
        await store.setValue('state', {
            seenIds: { uspto_ptab: ['LEGACY-1'] },
            statusFingerprints: { uspto_ptab: { 'LEGACY-1': 'fp' } },
            lastRunAt: { uspto_ptab: '2026-09-01T00:00:00.000Z' },
            // no terminationDates key at all - the pre-2026-09-08 shape
        });
        const loaded = await loadState();
        expect(loaded.seenIds.uspto_ptab).toContain('LEGACY-1');
        expect(loaded.terminationDates).toEqual({});
    });
});
