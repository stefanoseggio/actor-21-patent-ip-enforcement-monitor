/**
 * zod schemas for this actor's input contract and its Unified Master Schema
 * (UMS) output envelope. Mirrors the real fleet pattern of a single zod
 * source-of-truth (see services/mcp-gateway/src/schemas/*.ts, which this
 * actor cannot import from -- it lives entirely under src/actors/actor-21/
 * as its own self-contained package -- so this file is that same pattern
 * re-declared locally rather than shared).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Source selection
// ---------------------------------------------------------------------------

/**
 * Only two sources are wired up for v1, both live-verified 2026-09-07 (see
 * src/http.ts for the full record):
 *  - 'uspto_ptab': USPTO PTAB Trials API via the Open Data Portal (ODP).
 *    Real adversarial proceedings (IPR/PGR/CBM/DER) -- the primary source.
 *  - 'epo_opposition': EPO Open Patent Services (OPS) legal-status lookup,
 *    used to detect opposition-family legal events on a caller-supplied
 *    watchlist of EP publication numbers. Secondary/optional -- OPS has no
 *    documented "search all recent oppositions" endpoint, only per-number
 *    legal-status lookup, so this source is watchlist-driven rather than a
 *    newest-first crawl.
 * PatentsView (mid-migration, no ETA) and WIPO PATENTSCOPE (paid-only
 * programmatic access) were live-verified and excluded -- see src/http.ts.
 */
export const SourceIdSchema = z.enum(['uspto_ptab', 'epo_opposition']);
export type SourceId = z.infer<typeof SourceIdSchema>;

export const PtabTrialTypeCodeSchema = z.enum(['IPR', 'PGR', 'CBM', 'DER']);
export type PtabTrialTypeCode = z.infer<typeof PtabTrialTypeCodeSchema>;

// ---------------------------------------------------------------------------
// Actor input
// ---------------------------------------------------------------------------

export const ActorInputSchema = z
    .object({
        sources: z.array(SourceIdSchema).min(1).default(['uspto_ptab']),

        /**
         * BYOK: an already-issued USPTO Open Data Portal API key. This actor
         * never attempts to create a USPTO.gov account or complete MFA on the
         * operator's behalf (that would be well outside genuine open access) --
         * see src/http.ts's compliance comment block for the live-verified
         * registration requirements.
         */
        usptoOdpApiKey: z.string().min(1).optional(),

        /** BYOK: EPO OPS OAuth2 Consumer Key/Secret, minted from a free developers.epo.org account+App. Both are required together for the epo_opposition source. */
        epoOpsConsumerKey: z.string().min(1).optional(),
        epoOpsConsumerSecret: z.string().min(1).optional(),

        /**
         * EP publication numbers in OPS "epodoc" format (e.g. "EP3000000"),
         * required for the epo_opposition source -- OPS has no bulk "recent
         * oppositions" search, only per-number legal-status lookup, so this
         * actor issues one sequential HTTP call (with its own retry/backoff)
         * per watchlist entry -- see fetchEpoOppositionEvents() in
         * src/sources/epoOpposition.ts.
         *
         * Capped at 100 (timeout-budget fix, 2026-09-19): maxItemsPerSource
         * only caps how many MATCHED opposition events are kept, not how
         * many watchlist entries get walked -- when few/none match, every
         * entry is still fetched. Per src/http.ts's real DEFAULT_RETRY
         * (maxRetries=4, baseDelayMs=1000, minRetryAfter429Ms=5000), a single
         * call that gets rate-limited (429) on every attempt sleeps
         * max(5000,1000*2^0) + max(5000,1000*2^1) + max(5000,1000*2^2) +
         * max(5000,1000*2^3) = 5000+5000+5000+8000 = 23s before it can
         * finally succeed on its 5th (last) attempt. With this actor's real,
         * live-verified defaultRunOptions.timeoutSecs=3600, an uncapped
         * watchlist of ~157 entries (157*23s=3611s) already exceeds the
         * whole run's timeout budget from backoff sleeps alone, before
         * counting any real network latency or the source's own one-time
         * OAuth token fetch (which shares the same retry budget). At the
         * cap of 100: 100*23s=2300s plus the ~23s worst-case token fetch =
         * 2323s, ~64.5% of the 3600s budget -- comfortable, genuine margin
         * for real request latency on top of worst-case backoff.
         */
        epWatchlist: z.array(z.string().min(1)).max(100, 'epWatchlist supports at most 100 entries per run -- see src/sources/epoOpposition.ts for the timeout-budget arithmetic (each entry is one sequential, independently-retried HTTP call).').default([]),

        /** Filters PTAB proceedings by trialMetaData.trialTypeCode. Empty/omitted = all four trial types. */
        trialTypeCodes: z.array(PtabTrialTypeCodeSchema).default([]),

        /** Restricts PTAB proceedings to those with petitionFilingDate inside this window (applied as an ODP rangeFilter, not a client-side filter). */
        dateRange: z.enum(['24h', '7d', '30d', '90d']).optional(),

        maxItemsPerSource: z.number().int().min(1).default(100),

        /** Delta mode: persists seen trial numbers / EP watchlist+event-code pairs between runs (this actor's own key-value store) and marks event_type UPDATED instead of SANCTION when a previously-seen record's status/latest-decision changed. */
        onlyNew: z.boolean().default(false),
    })
    .superRefine((input, ctx) => {
        if (input.sources.includes('uspto_ptab') && !input.usptoOdpApiKey) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'usptoOdpApiKey is required when sources includes "uspto_ptab".',
                path: ['usptoOdpApiKey'],
            });
        }
        if (input.sources.includes('epo_opposition')) {
            if (!input.epoOpsConsumerKey || !input.epoOpsConsumerSecret) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'epoOpsConsumerKey and epoOpsConsumerSecret are both required when sources includes "epo_opposition".',
                    path: ['epoOpsConsumerKey'],
                });
            }
            if (input.epWatchlist.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'epWatchlist must contain at least one EP publication number when sources includes "epo_opposition" (OPS has no bulk opposition search).',
                    path: ['epWatchlist'],
                });
            }
        }
    });

export type ActorInput = z.infer<typeof ActorInputSchema>;

// ---------------------------------------------------------------------------
// Unified Master Schema (UMS) -- 18 fields, EXACT, per
// services/enterprise-sdks/node/src/types.ts's UnifiedRecord contract.
// ---------------------------------------------------------------------------

export const UmsEventTypeSchema = z
    .string()
    .describe(
        "Fleet vocabulary: 'NEW_LISTING' | 'AWARD_VARIATION' | 'UPDATED' | 'SANCTION' | 'SNAPSHOT_NO_DIFF', or any other string (the real SDK types this as a union widened with `string & {}`, i.e. an open string with a preferred vocabulary, not a closed enum). This actor also emits 'TERMINATED' - PTAB-only, a genuine null-to-set transition on terminationDate (a trial concluding), distinct from a generic UPDATED - see src/state.ts's isNewlyTerminated().",
    );

export const UnifiedRecordSchema = z.object({
    record_id: z.string(),
    event_type: UmsEventTypeSchema,
    scraped_at: z.string(),
    is_new: z.boolean().nullable(),
    source_url: z.string().nullable(),
    recipient_or_defendant_name: z.string().nullable(),
    entity_identifier_native: z.string().nullable(),
    value_native: z.string().nullable(),
    value_currency: z.string().nullable(),
    value_usd_normalized: z.number().nullable(),
    effective_date_iso: z.string().nullable(),
    publish_date_iso: z.string().nullable(),
    category_or_type: z.string().nullable(),
    status_or_estado: z.string().nullable(),
    awarding_or_regulating_agency: z.string().nullable(),
    jurisdiction: z.string(),
    source_document_url: z.string().nullable(),
    reference_number: z.string().nullable(),
});

export type UnifiedRecord = z.infer<typeof UnifiedRecordSchema>;
