/**
 * zod schemas for this actor's input contract and its Unified Master Schema
 * (UMS) output envelope. Mirrors the real fleet pattern of a single zod
 * source-of-truth (see services/mcp-gateway/src/schemas/*.ts, which this
 * actor cannot import from -- it lives entirely under src/actors/actor-21/
 * as its own self-contained package -- so this file is that same pattern
 * re-declared locally rather than shared).
 */
import { z } from 'zod';
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
export declare const SourceIdSchema: z.ZodEnum<["uspto_ptab", "epo_opposition"]>;
export type SourceId = z.infer<typeof SourceIdSchema>;
export declare const PtabTrialTypeCodeSchema: z.ZodEnum<["IPR", "PGR", "CBM", "DER"]>;
export type PtabTrialTypeCode = z.infer<typeof PtabTrialTypeCodeSchema>;
export declare const ActorInputSchema: z.ZodEffects<z.ZodObject<{
    sources: z.ZodDefault<z.ZodArray<z.ZodEnum<["uspto_ptab", "epo_opposition"]>, "many">>;
    /**
     * BYOK: an already-issued USPTO Open Data Portal API key. This actor
     * never attempts to create a USPTO.gov account or complete MFA on the
     * operator's behalf (that would be well outside genuine open access) --
     * see src/http.ts's compliance comment block for the live-verified
     * registration requirements.
     */
    usptoOdpApiKey: z.ZodOptional<z.ZodString>;
    /** BYOK: EPO OPS OAuth2 Consumer Key/Secret, minted from a free developers.epo.org account+App. Both are required together for the epo_opposition source. */
    epoOpsConsumerKey: z.ZodOptional<z.ZodString>;
    epoOpsConsumerSecret: z.ZodOptional<z.ZodString>;
    /** EP publication numbers in OPS "epodoc" format (e.g. "EP3000000"), required for the epo_opposition source -- OPS has no bulk "recent oppositions" search, only per-number legal-status lookup. */
    epWatchlist: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Filters PTAB proceedings by trialMetaData.trialTypeCode. Empty/omitted = all four trial types. */
    trialTypeCodes: z.ZodDefault<z.ZodArray<z.ZodEnum<["IPR", "PGR", "CBM", "DER"]>, "many">>;
    /** Restricts PTAB proceedings to those with petitionFilingDate inside this window (applied as an ODP rangeFilter, not a client-side filter). */
    dateRange: z.ZodOptional<z.ZodEnum<["24h", "7d", "30d", "90d"]>>;
    maxItemsPerSource: z.ZodDefault<z.ZodNumber>;
    /** Delta mode: persists seen trial numbers / EP watchlist+event-code pairs between runs (this actor's own key-value store) and marks event_type UPDATED instead of SANCTION when a previously-seen record's status/latest-decision changed. */
    onlyNew: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    sources: ("uspto_ptab" | "epo_opposition")[];
    epWatchlist: string[];
    trialTypeCodes: ("IPR" | "PGR" | "CBM" | "DER")[];
    maxItemsPerSource: number;
    onlyNew: boolean;
    usptoOdpApiKey?: string | undefined;
    epoOpsConsumerKey?: string | undefined;
    epoOpsConsumerSecret?: string | undefined;
    dateRange?: "24h" | "7d" | "30d" | "90d" | undefined;
}, {
    sources?: ("uspto_ptab" | "epo_opposition")[] | undefined;
    usptoOdpApiKey?: string | undefined;
    epoOpsConsumerKey?: string | undefined;
    epoOpsConsumerSecret?: string | undefined;
    epWatchlist?: string[] | undefined;
    trialTypeCodes?: ("IPR" | "PGR" | "CBM" | "DER")[] | undefined;
    dateRange?: "24h" | "7d" | "30d" | "90d" | undefined;
    maxItemsPerSource?: number | undefined;
    onlyNew?: boolean | undefined;
}>, {
    sources: ("uspto_ptab" | "epo_opposition")[];
    epWatchlist: string[];
    trialTypeCodes: ("IPR" | "PGR" | "CBM" | "DER")[];
    maxItemsPerSource: number;
    onlyNew: boolean;
    usptoOdpApiKey?: string | undefined;
    epoOpsConsumerKey?: string | undefined;
    epoOpsConsumerSecret?: string | undefined;
    dateRange?: "24h" | "7d" | "30d" | "90d" | undefined;
}, {
    sources?: ("uspto_ptab" | "epo_opposition")[] | undefined;
    usptoOdpApiKey?: string | undefined;
    epoOpsConsumerKey?: string | undefined;
    epoOpsConsumerSecret?: string | undefined;
    epWatchlist?: string[] | undefined;
    trialTypeCodes?: ("IPR" | "PGR" | "CBM" | "DER")[] | undefined;
    dateRange?: "24h" | "7d" | "30d" | "90d" | undefined;
    maxItemsPerSource?: number | undefined;
    onlyNew?: boolean | undefined;
}>;
export type ActorInput = z.infer<typeof ActorInputSchema>;
export declare const UmsEventTypeSchema: z.ZodString;
export declare const UnifiedRecordSchema: z.ZodObject<{
    record_id: z.ZodString;
    event_type: z.ZodString;
    scraped_at: z.ZodString;
    is_new: z.ZodNullable<z.ZodBoolean>;
    source_url: z.ZodNullable<z.ZodString>;
    recipient_or_defendant_name: z.ZodNullable<z.ZodString>;
    entity_identifier_native: z.ZodNullable<z.ZodString>;
    value_native: z.ZodNullable<z.ZodString>;
    value_currency: z.ZodNullable<z.ZodString>;
    value_usd_normalized: z.ZodNullable<z.ZodNumber>;
    effective_date_iso: z.ZodNullable<z.ZodString>;
    publish_date_iso: z.ZodNullable<z.ZodString>;
    category_or_type: z.ZodNullable<z.ZodString>;
    status_or_estado: z.ZodNullable<z.ZodString>;
    awarding_or_regulating_agency: z.ZodNullable<z.ZodString>;
    jurisdiction: z.ZodString;
    source_document_url: z.ZodNullable<z.ZodString>;
    reference_number: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    record_id: string;
    event_type: string;
    scraped_at: string;
    is_new: boolean | null;
    source_url: string | null;
    recipient_or_defendant_name: string | null;
    entity_identifier_native: string | null;
    value_native: string | null;
    value_currency: string | null;
    value_usd_normalized: number | null;
    effective_date_iso: string | null;
    publish_date_iso: string | null;
    category_or_type: string | null;
    status_or_estado: string | null;
    awarding_or_regulating_agency: string | null;
    jurisdiction: string;
    source_document_url: string | null;
    reference_number: string | null;
}, {
    record_id: string;
    event_type: string;
    scraped_at: string;
    is_new: boolean | null;
    source_url: string | null;
    recipient_or_defendant_name: string | null;
    entity_identifier_native: string | null;
    value_native: string | null;
    value_currency: string | null;
    value_usd_normalized: number | null;
    effective_date_iso: string | null;
    publish_date_iso: string | null;
    category_or_type: string | null;
    status_or_estado: string | null;
    awarding_or_regulating_agency: string | null;
    jurisdiction: string;
    source_document_url: string | null;
    reference_number: string | null;
}>;
export type UnifiedRecord = z.infer<typeof UnifiedRecordSchema>;
//# sourceMappingURL=schemas.d.ts.map