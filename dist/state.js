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
function isValidState(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return typeof candidate.seenIds === 'object' && candidate.seenIds !== null && typeof candidate.statusFingerprints === 'object' && candidate.statusFingerprints !== null;
}
export function createEmptyState() {
    return { seenIds: {}, statusFingerprints: {}, terminationDates: {}, lastRunAt: {} };
}
export async function loadState() {
    const store = await Actor.openKeyValueStore(STATE_STORE_NAME);
    const state = await store.getValue('state');
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
export async function saveSourceState(state, source, idsSeenThisRun, fingerprintsThisRun, runAt, terminationDatesThisRun = {}) {
    const previousIds = state.seenIds[source] ?? [];
    const mergedIds = [...idsSeenThisRun, ...previousIds.filter((id) => !idsSeenThisRun.includes(id))];
    const next = {
        seenIds: { ...state.seenIds, [source]: mergedIds.slice(0, MAX_SEEN_IDS_PER_SOURCE) },
        statusFingerprints: {
            ...state.statusFingerprints,
            [source]: { ...state.statusFingerprints[source], ...fingerprintsThisRun },
        },
        terminationDates: {
            ...state.terminationDates,
            [source]: { ...state.terminationDates[source], ...terminationDatesThisRun },
        },
        lastRunAt: { ...state.lastRunAt, [source]: runAt },
    };
    const store = await Actor.openKeyValueStore(STATE_STORE_NAME);
    await store.setValue('state', next);
    return next;
}
/** Compares a record_id's current fingerprint against what was persisted last run. */
export function classifyRecord(state, source, recordId, currentFingerprint) {
    const seenIds = new Set(state.seenIds[source] ?? []);
    if (!seenIds.has(recordId))
        return 'first_seen';
    const previousFingerprint = state.statusFingerprints[source]?.[recordId];
    if (previousFingerprint !== undefined && previousFingerprint !== currentFingerprint)
        return 'updated';
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
export function isNewlyTerminated(state, source, recordId, currentTerminationDate) {
    const wasSeenBefore = (state.seenIds[source] ?? []).includes(recordId);
    if (!wasSeenBefore)
        return false;
    const previousTerminationDate = state.terminationDates[source]?.[recordId] || '';
    return previousTerminationDate === '' && Boolean(currentTerminationDate);
}
//# sourceMappingURL=state.js.map