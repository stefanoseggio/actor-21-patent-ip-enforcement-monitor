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
export interface DeltaState {
    seenIds: Record<string, string[]>;
    /** record_id -> a short fingerprint string capturing whatever fields determine "did this record change" (e.g. `${trialStatusCategory}|${latestDecisionDate}`). */
    statusFingerprints: Record<string, Record<string, string>>;
    /** PTAB-only: record_id -> last known terminationDate ('' when not yet terminated). Absent/undefined entries are treated the same as ''. */
    terminationDates: Record<string, Record<string, string>>;
    lastRunAt: Record<string, string>;
}
export declare function createEmptyState(): DeltaState;
export declare function loadState(): Promise<DeltaState>;
export declare function saveSourceState(state: DeltaState, source: string, idsSeenThisRun: string[], fingerprintsThisRun: Record<string, string>, runAt: string, terminationDatesThisRun?: Record<string, string>): Promise<DeltaState>;
export type ClassifyResult = 'first_seen' | 'updated' | 'unchanged';
/** Compares a record_id's current fingerprint against what was persisted last run. */
export declare function classifyRecord(state: DeltaState, source: string, recordId: string, currentFingerprint: string): ClassifyResult;
/**
 * True only on a genuine null-to-set transition: the record was seen
 * before with no termination date recorded, and now has one. A record
 * that's terminated on its very FIRST sighting is NOT reported as this
 * transition (there's nothing to "transition" from) - it's a normal
 * first_seen, whose terminationDate is simply already populated on that
 * initial record.
 */
export declare function isNewlyTerminated(state: DeltaState, source: string, recordId: string, currentTerminationDate: string | null): boolean;
//# sourceMappingURL=state.d.ts.map