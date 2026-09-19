/**
 * Delta-tracking state, persisted in a named key-value store so it survives
 * across scheduled runs -- same convention as
 * uk-hse-enforcement-monitor/src/state.ts. Keyed per source (uspto_ptab /
 * epo_opposition) since their record_id spaces are independent.
 *
 * Beyond plain seen/unseen (is_new), this actor also tracks a lightweight
 * "status fingerprint" per record_id so a record seen before but whose
 * status changed (e.g. a PTAB trial moving from "Instituted" to
 * "FWD Entered", or a new legal event appearing for an already-flagged EP
 * publication) is reported as event_type UPDATED rather than silently
 * deduped away -- enforcement status changes are exactly the kind of update
 * a compliance-monitoring consumer needs to see.
 *
 * `terminationDates` (added 2026-09-08) tracks PTAB's `terminationDate`
 * field SEPARATELY from the general status fingerprint - not baked into the
 * same opaque string - specifically so a null-to-set transition (a trial
 * genuinely concluding) can be detected as its own distinct event
 * (TERMINATED in main.ts's classify()), not just folded into a generic
 * UPDATED alongside every other status-fingerprint change. Only the PTAB
 * source uses this map; EPO opposition events have no equivalent
 * "concluded" field in this actor's currently-parsed data.
 */

import { Actor } from 'apify';

const STATE_STORE_NAME = 'actor-21-patent-ip-enforcement-monitor-delta-state';
const MAX_SEEN_IDS_PER_SOURCE = 5000;

export interface DeltaState {
    seenIds: Record<string, string[]>;
    /** record_id -> a short fingerprint string capturing whatever fields determine "did this record change" (e.g. `${trialStatusCategory}|${latestDecisionDate}`). */
    statusFingerprints: Record<string, Record<string, string>>;
    /** PTAB-only: record_id -> last known terminationDate ('' when not yet terminated). Absent/undefined entries are treated the same as ''. */
    terminationDates: Record<string, Record<string, string>>;
    lastRunAt: Record<string, string>;
}

function isValidState(value: unknown): value is DeltaState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.seenIds === 'object' && candidate.seenIds !== null && typeof candidate.statusFingerprints === 'object' && candidate.statusFingerprints !== null;
}

export function createEmptyState(): DeltaState {
    return { seenIds: {}, statusFingerprints: {}, terminationDates: {}, lastRunAt: {} };
}

export async function loadState(): Promise<DeltaState> {
    const store = await Actor.openKeyValueStore(STATE_STORE_NAME);
    const state = await store.getValue<DeltaState>('state');
    // v1 of this state shape (before 2026-09-08) had no terminationDates map
    // at all - rather than reject that shape outright (it's still valid for
    // seenIds/statusFingerprints), backfill an empty map so existing
    // persisted state from before this change keeps working, with
    // terminationDate tracking simply starting fresh from this run onward.
    if (isValidState(state)) {
        return { ...state, terminationDates: state.terminationDates ?? {} };
    }
    return createEmptyState();
}

export async function saveSourceState(
    state: DeltaState,
    source: string,
    idsSeenThisRun: string[],
    fingerprintsThisRun: Record<string, string>,
    runAt: string,
    terminationDatesThisRun: Record<string, string> = {},
): Promise<DeltaState> {
    const previousIds = state.seenIds[source] ?? [];
    const mergedIds = [...idsSeenThisRun, ...previousIds.filter((id) => !idsSeenThisRun.includes(id))];
    const cappedIds = mergedIds.slice(0, MAX_SEEN_IDS_PER_SOURCE);

    // statusFingerprints/terminationDates must be pruned to the same
    // record_id set retained in seenIds after capping - otherwise they grow
    // unboundedly across scheduled runs even after a record_id is evicted
    // from seenIds.
    const mergedFingerprints = { ...state.statusFingerprints[source], ...fingerprintsThisRun };
    const prunedFingerprints: Record<string, string> = {};
    for (const id of cappedIds) {
        if (mergedFingerprints[id] !== undefined) prunedFingerprints[id] = mergedFingerprints[id];
    }

    const mergedTerminationDates = { ...state.terminationDates[source], ...terminationDatesThisRun };
    const prunedTerminationDates: Record<string, string> = {};
    for (const id of cappedIds) {
        if (mergedTerminationDates[id] !== undefined) prunedTerminationDates[id] = mergedTerminationDates[id];
    }

    const next: DeltaState = {
        seenIds: { ...state.seenIds, [source]: cappedIds },
        statusFingerprints: {
            ...state.statusFingerprints,
            [source]: prunedFingerprints,
        },
        terminationDates: {
            ...state.terminationDates,
            [source]: prunedTerminationDates,
        },
        lastRunAt: { ...state.lastRunAt, [source]: runAt },
    };
    const store = await Actor.openKeyValueStore(STATE_STORE_NAME);
    await store.setValue('state', next);
    return next;
}

export type ClassifyResult = 'first_seen' | 'updated' | 'unchanged';

/** Compares a record_id's current fingerprint against what was persisted last run. */
export function classifyRecord(
    state: DeltaState,
    source: string,
    recordId: string,
    currentFingerprint: string,
): ClassifyResult {
    const seenIds = new Set(state.seenIds[source] ?? []);
    if (!seenIds.has(recordId)) return 'first_seen';
    const previousFingerprint = state.statusFingerprints[source]?.[recordId];
    if (previousFingerprint !== undefined && previousFingerprint !== currentFingerprint) return 'updated';
    return 'unchanged';
}

/**
 * True only on a genuine null-to-set transition: the record was seen
 * before with no termination date recorded, and now has one. A record
 * that's terminated on its very FIRST sighting is NOT reported as this
 * transition (there's nothing to "transition" from) - it's a normal
 * first_seen, whose terminationDate is simply already populated on that
 * initial record.
 */
export function isNewlyTerminated(state: DeltaState, source: string, recordId: string, currentTerminationDate: string | null): boolean {
    const wasSeenBefore = (state.seenIds[source] ?? []).includes(recordId);
    if (!wasSeenBefore) return false;
    const previousTerminationDate = state.terminationDates[source]?.[recordId] || '';
    return previousTerminationDate === '' && Boolean(currentTerminationDate);
}
