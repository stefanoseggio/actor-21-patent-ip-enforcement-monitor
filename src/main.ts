import { Actor, log } from 'apify';

import { type ActorInput,ActorInputSchema } from './schemas.js';
import { fetchEpoOppositionEvents } from './sources/epoOpposition.js';
import { fetchPtabProceedings } from './sources/usptoPtab.js';
import { classifyRecord, type DeltaState,isNewlyTerminated, loadState, saveSourceState } from './state.js';
import type { EpoRawRecord, PtabRawRecord } from './types.js';
import { normalizeEpoRecord, normalizePtabRecord } from './umsNormalizer.js';

const RESULT_EVENT_NAME = 'result';

/** Thrown for a top-level, run-fatal configuration/validation problem (e.g. a missing BYOK credential for a requested source) - distinguished by TYPE from a genuine per-fetch/per-record error during normal operation, so the catch block in run() can fail the whole run for this case while still tolerating the other. */
class FatalConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FatalConfigError';
    }
}

await Actor.init();
await run();
await Actor.exit();

function ptabFingerprint(raw: PtabRawRecord): string {
    // fileDownloadURI is included because it's the one genuinely verified
    // per-record document link this source carries (emitted as
    // source_document_url via umsNormalizer.ts) - a trial whose
    // status/decision/termination dates are unchanged but whose decision
    // document only became linked in the interim is a real UMS-surfaced
    // change and must not classify as SNAPSHOT_NO_DIFF.
    return `${raw.trialStatusCategory ?? ''}|${raw.latestDecisionDate ?? ''}|${raw.terminationDate ?? ''}|${raw.fileDownloadURI ?? ''}`;
}

function epoFingerprint(raw: EpoRawRecord): string {
    return `${raw.eventCode ?? ''}|${raw.eventDate ?? ''}|${raw.eventDescription ?? ''}|${raw.eventCountry ?? ''}`;
}

/** Resolves (event_type, is_new) from delta state, per this actor's documented UMS vocabulary usage: SANCTION on first sight, UPDATED when a previously-seen record's status fingerprint changed, SNAPSHOT_NO_DIFF when re-emitting an unchanged record (only reachable when onlyNew=false, since onlyNew mode skips unchanged records entirely before this is ever called for them). */
function classify(
    state: DeltaState,
    source: string,
    recordId: string,
    fingerprint: string,
): { eventType: string; isNew: boolean; result: ReturnType<typeof classifyRecord> } {
    const result = classifyRecord(state, source, recordId, fingerprint);
    if (result === 'first_seen') return { eventType: 'SANCTION', isNew: true, result };
    if (result === 'updated') return { eventType: 'UPDATED', isNew: false, result };
    return { eventType: 'SNAPSHOT_NO_DIFF', isNew: false, result };
}

async function run(): Promise<void> {
    const rawInput = (await Actor.getInput<Partial<ActorInput>>()) ?? {};
    const parsed = ActorInputSchema.safeParse(rawInput);
    if (!parsed.success) {
        const message = `Invalid actor input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
        log.error(message);
        await Actor.fail(message);
        return;
    }
    const input = parsed.data;

    let state = await loadState();
    let pushed = 0;
    let chargeLimitReached = false;

    try {
        if (input.sources.includes('uspto_ptab')) {
            if (!input.usptoOdpApiKey) throw new FatalConfigError('usptoOdpApiKey is required for source uspto_ptab.');

            const filingDateFrom = dateRangeToFrom(input.dateRange);
            const ptabRecords = await fetchPtabProceedings({
                apiKey: input.usptoOdpApiKey,
                trialTypeCodes: input.trialTypeCodes,
                filingDateFrom,
                maxItems: input.maxItemsPerSource,
            });
            log.info(`USPTO PTAB: fetched ${ptabRecords.length} trial proceedings.`);

            const seenIdsThisRun: string[] = [];
            const fingerprintsThisRun: Record<string, string> = {};
            const terminationDatesThisRun: Record<string, string> = {};

            for (const raw of ptabRecords) {
                const fingerprint = ptabFingerprint(raw);
                const { eventType, isNew, result } = classify(state, 'uspto_ptab', raw.record_id, fingerprint);
                // A genuine null-to-set transition on terminationDate is a
                // distinct, more specific signal than a generic UPDATED -
                // this trial just concluded, not just "some field changed".
                // Only overrides an 'updated' classification (a trial
                // that's already terminated on its very first sighting is a
                // normal first_seen/SANCTION, not a "transition").
                const finalEventType = isNewlyTerminated(state, 'uspto_ptab', raw.record_id, raw.terminationDate) ? 'TERMINATED' : eventType;
                seenIdsThisRun.push(raw.record_id);
                fingerprintsThisRun[raw.record_id] = fingerprint;
                terminationDatesThisRun[raw.record_id] = raw.terminationDate ?? '';

                if (input.onlyNew && result === 'unchanged') continue;

                const ums = normalizePtabRecord(raw, finalEventType, isNew);
                if (!(await pushRecord({ ...raw, ...ums }))) {
                    chargeLimitReached = true;
                    break;
                }
                pushed += 1;
            }

            state = await saveSourceState(state, 'uspto_ptab', seenIdsThisRun, fingerprintsThisRun, new Date().toISOString(), terminationDatesThisRun);
        }

        if (!chargeLimitReached && input.sources.includes('epo_opposition')) {
            if (!input.epoOpsConsumerKey || !input.epoOpsConsumerSecret) {
                throw new FatalConfigError('epoOpsConsumerKey and epoOpsConsumerSecret are both required for source epo_opposition.');
            }

            const epoRecords = await fetchEpoOppositionEvents({
                consumerKey: input.epoOpsConsumerKey,
                consumerSecret: input.epoOpsConsumerSecret,
                watchlist: input.epWatchlist,
                maxItems: input.maxItemsPerSource,
            });
            log.info(`EPO OPS: fetched ${epoRecords.length} opposition-related legal events across ${input.epWatchlist.length} watched publications.`);

            const seenIdsThisRun: string[] = [];
            const fingerprintsThisRun: Record<string, string> = {};

            for (const raw of epoRecords) {
                const fingerprint = epoFingerprint(raw);
                const { eventType, isNew, result } = classify(state, 'epo_opposition', raw.record_id, fingerprint);
                seenIdsThisRun.push(raw.record_id);
                fingerprintsThisRun[raw.record_id] = fingerprint;

                if (input.onlyNew && result === 'unchanged') continue;

                const ums = normalizeEpoRecord(raw, eventType, isNew);
                if (!(await pushRecord({ ...raw, ...ums }))) {
                    chargeLimitReached = true;
                    break;
                }
                pushed += 1;
            }

            state = await saveSourceState(state, 'epo_opposition', seenIdsThisRun, fingerprintsThisRun, new Date().toISOString());
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Extraction failed: ${message}`);
        if (error instanceof FatalConfigError) {
            // Top-level configuration/validation problem (e.g. a missing BYOK
            // credential for a requested source) - the run genuinely did
            // nothing useful, so it must end FAILED and surface the real
            // message via the API, not just as a dataset row on a
            // SUCCEEDED run that a status-only caller would never see.
            await Actor.fail(message);
            return;
        }
        // Genuine per-fetch/per-record error during normal operation (e.g. a
        // transient upstream failure). Failing the whole run over this would
        // discard any real records already pushed from other sources, so
        // this keeps the existing behavior: record the error and exit
        // normally.
        await Actor.pushData({ error: message, scraped_at: new Date().toISOString() });
        return;
    }

    log.info(`Pushed ${pushed} record(s) to the dataset.`);
}

/** Pushes one dataset record and charges the 'result' event. Returns false when the run's charge limit has been reached, signalling the caller to stop pulling more pages. */
async function pushRecord(record: Record<string, unknown>): Promise<boolean> {
    await Actor.pushData(record);
    const { eventChargeLimitReached } = await Actor.charge({ eventName: RESULT_EVENT_NAME, count: 1 });
    if (eventChargeLimitReached) {
        log.info('Charge limit reached - stopping.');
        return false;
    }
    return true;
}

function dateRangeToFrom(dateRange: ActorInput['dateRange']): string | undefined {
    if (!dateRange) return undefined;
    const days = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 }[dateRange];
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return from.toISOString().slice(0, 10);
}
