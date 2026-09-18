/**
 * Normalizes this actor's two raw, source-specific record shapes into the
 * 18-field Unified Master Schema (UMS) envelope -- see schemas.ts's
 * UnifiedRecordSchema, which is byte-for-byte the contract declared in
 * services/enterprise-sdks/node/src/types.ts's UnifiedRecord.
 *
 * Every field-level mapping decision below is documented inline. Anything
 * with no honest source-data equivalent is left null rather than
 * guessed/fabricated (per this fleet's own UnifiedRecord doc comment: "Null
 * any field that doesn't apply").
 */
import type { UnifiedRecord } from './schemas.js';
import type { EpoRawRecord, PtabRawRecord } from './types.js';
/**
 * USPTO PTAB -> UMS.
 *
 *  - record_id / reference_number: trialNumber -- the official PTAB
 *    proceeding identifier (e.g. "IPR2024-00123"), stable across runs.
 *  - recipient_or_defendant_name: the patent owner (patentOwnerName, falling
 *    back to the owner-side realPartyInInterestName) -- i.e. the party
 *    whose patent is under adversarial challenge, the closest analogue to
 *    "defendant" in this administrative-tribunal context (mirrors
 *    uk-hse-enforcement-monitor's convention of putting the sanctioned
 *    party, not the regulator, in this slot).
 *  - entity_identifier_native: the challenged patentNumber (falling back to
 *    applicationNumberText) -- the strongest native identifier this record
 *    carries; note it identifies the patent, not a company registration
 *    number (PTAB data has no such field), same "best-effort, not a
 *    verified corporate ID" caveat the real Entity.entityKey design in
 *    services/knowledge-graph-engine/src/ontology/labels.ts documents.
 *  - value_native / value_currency / value_usd_normalized: null -- PTAB
 *    proceedings carry no monetary amount field (verified against the full
 *    Data Property table at
 *    https://data.uspto.gov/apis/ptab-trials/search-proceedings); unlike a
 *    court fine, an IPR/PGR/CBM/DER decision's stakes are the patent's
 *    validity, not a dollar figure.
 *  - effective_date_iso: institutionDecisionDate (when PTAB formally
 *    instituted the trial -- the date the enforcement action actually took
 *    hold), falling back to accordedFilingDate for not-yet-instituted
 *    proceedings.
 *  - publish_date_iso: petitionFilingDate -- when the petition first became
 *    a public PTAB filing.
 *  - category_or_type: trialTypeCode (IPR / PGR / CBM / DER).
 *  - status_or_estado: trialStatusCategory.
 *  - awarding_or_regulating_agency: constant "USPTO Patent Trial and Appeal
 *    Board (PTAB)" -- PTAB is the issuing/regulating tribunal for every
 *    record from this source.
 *  - jurisdiction: constant "US".
 *  - source_url: null, deliberately -- no public per-proceeding case-viewer
 *    URL pattern was confirmed live this session (see src/http.ts); a
 *    fabricated URL would violate the "no invented endpoints" rule more
 *    than an honest null does.
 *  - source_document_url: fileDownloadURI -- the one genuinely verified
 *    per-record document link in the real response schema.
 */
export declare function normalizePtabRecord(raw: PtabRawRecord, eventType: string, isNew: boolean): UnifiedRecord;
/**
 * EPO OPS opposition-watch -> UMS.
 *
 *  - record_id: `{publicationNumber}:{eventCode}:{eventDate}` -- OPS legal
 *    events have no single issued identifier of their own, so this actor
 *    composes a stable one from the watched number plus the event itself
 *    (mirrors salta/santafe-compras-monitor's convention of a composed
 *    record_id where the native source has none -- see those actors'
 *    fetchListing modules).
 *  - recipient_or_defendant_name: null -- the OPS legal-status response (as
 *    scoped for this actor -- see src/sources/epoOpposition.ts) does not
 *    carry the patent owner's name, only publication number + legal event;
 *    resolving a name would require a second OPS `biblio` call this v1
 *    does not make. Left null rather than guessed.
 *  - entity_identifier_native: publicationNumber -- the EP publication
 *    number, the only stable native identifier this record carries.
 *  - value_*: null -- an opposition legal event carries no monetary amount.
 *  - effective_date_iso / publish_date_iso: both set to eventDate (the one
 *    date OPS's legal-status entry carries) -- there is no separate
 *    filed-vs-effective distinction in this data the way PTAB has
 *    petitionFilingDate vs. institutionDecisionDate.
 *  - category_or_type: eventCode (e.g. an INPADOC opposition-family code).
 *  - status_or_estado: eventDescription.
 *  - awarding_or_regulating_agency: constant "European Patent Office (EPO)
 *    -- Legal/Opposition Division".
 *  - jurisdiction: "EP".
 *  - source_url / source_document_url: null -- OPS is a data API, not a
 *    public case-viewer; no verified per-event public page URL exists.
 */
export declare function normalizeEpoRecord(raw: EpoRawRecord, eventType: string, isNew: boolean): UnifiedRecord;
//# sourceMappingURL=umsNormalizer.d.ts.map