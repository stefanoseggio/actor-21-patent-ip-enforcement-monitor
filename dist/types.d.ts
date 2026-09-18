/**
 * Raw, per-source record interfaces. Field names on PtabTrialProceeding
 * mirror the real USPTO ODP PTAB Trials "Search Proceedings" response shape
 * exactly as documented and live-verified 2026-09-07 at
 * https://data.uspto.gov/apis/ptab-trials/search-proceedings (its "Response"
 * -> 200 -> Data Property table) -- see src/http.ts for the full
 * verification record. Field names on EpoLegalEvent are a best-effort,
 * intentionally defensive shape -- see src/sources/epoOpposition.ts's file
 * comment for exactly what could and could not be confirmed live this
 * session for the OPS legal-status XML response.
 */
/** One of patentOwnerData / regularPetitionerData / respondentData / derivationPetitionerData -- all four share this same field set in the real API's Data Property table. */
export interface PtabPartyData {
    patentNumber: string | null;
    applicationNumberText: string | null;
    realPartyInInterestName: string | null;
    grantDate: string | null;
    patentOwnerName: string | null;
    inventorName: string | null;
    counselName: string | null;
    technologyCenterNumber: string | null;
    groupArtUnitNumber: string | null;
}
export interface PtabTrialMetaData {
    trialTypeCode: string | null;
    trialStatusCategory: string | null;
    trialLastModifiedDate: string | null;
    petitionFilingDate: string | null;
    trialLastModifiedDateTime: string | null;
    accordedFilingDate: string | null;
    institutionDecisionDate: string | null;
    latestDecisionDate: string | null;
    terminationDate: string | null;
    fileDownloadURI: string | null;
}
export interface PtabTrialProceeding {
    trialNumber: string;
    trialRecordIdentifier: string | null;
    lastModifiedDateTime: string | null;
    trialMetaData: PtabTrialMetaData;
    patentOwnerData: PtabPartyData | null;
    regularPetitionerData: PtabPartyData | null;
    respondentData: PtabPartyData | null;
    derivationPetitionerData: PtabPartyData | null;
}
export interface PtabSearchResponse {
    patentTrialProceedingDataBag: PtabTrialProceeding[];
}
/**
 * This actor's flattened dataset record for a PTAB proceeding: the raw
 * PtabTrialProceeding fields (denormalized -- the four *Data objects are
 * flattened to their most decision-relevant party, per source module) plus
 * the UMS envelope fields inlined, matching the real fleet convention (e.g.
 * uk-hse-enforcement-monitor's UkHseRawRecord) of one flat record type per
 * dataset row rather than a nested raw/envelope split.
 */
export interface PtabRawRecord {
    source: 'uspto_ptab';
    trialNumber: string;
    trialTypeCode: string | null;
    trialStatusCategory: string | null;
    petitionFilingDate: string | null;
    accordedFilingDate: string | null;
    institutionDecisionDate: string | null;
    latestDecisionDate: string | null;
    terminationDate: string | null;
    trialLastModifiedDateTime: string | null;
    fileDownloadURI: string | null;
    patentNumber: string | null;
    applicationNumberText: string | null;
    patentOwnerName: string | null;
    patentOwnerRealPartyInInterestName: string | null;
    petitionerRealPartyInInterestName: string | null;
    petitionerCounselName: string | null;
    inventorName: string | null;
    technologyCenterNumber: string | null;
    record_id: string;
    event_type: string;
    scraped_at: string;
    is_new: boolean;
    source_url: string | null;
}
/**
 * One INPADOC-family legal-status event for a watched EP publication, as
 * best-effort-parsed from the OPS `legal` service's XML response -- see
 * src/sources/epoOpposition.ts for exactly which fields are read directly
 * off the XML vs. left null because the exact tag/attribute name could not
 * be confirmed live this session.
 */
export interface EpoLegalEvent {
    publicationNumber: string;
    eventCode: string | null;
    eventDescription: string | null;
    eventDate: string | null;
    eventCountry: string | null;
    /** True when eventCode/eventDescription text-matches an opposition-family term ("opposition", "OPPO", "appeal"). A heuristic, not an authoritative INPADOC code-table lookup -- see file comment. */
    isOppositionRelated: boolean;
}
export interface EpoRawRecord {
    source: 'epo_opposition';
    publicationNumber: string;
    eventCode: string | null;
    eventDescription: string | null;
    eventDate: string | null;
    eventCountry: string | null;
    record_id: string;
    event_type: string;
    scraped_at: string;
    is_new: boolean;
    source_url: string | null;
}
export type PatentEnforcementRecord = PtabRawRecord | EpoRawRecord;
//# sourceMappingURL=types.d.ts.map