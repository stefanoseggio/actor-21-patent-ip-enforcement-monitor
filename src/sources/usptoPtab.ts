/**
 * USPTO PTAB Trials API client -- see src/http.ts for the live verification
 * record (endpoint, auth, rate limits, access model). Real endpoint:
 *   POST https://api.uspto.gov/api/v1/patent/trials/proceedings/search
 */

import { fetchJsonWithRetry } from '../http.js';
import type { PtabTrialTypeCode } from '../schemas.js';
import type { PtabRawRecord, PtabSearchResponse, PtabTrialProceeding } from '../types.js';

const SEARCH_URL = 'https://api.uspto.gov/api/v1/patent/trials/proceedings/search';

export interface FetchPtabProceedingsParams {
    apiKey: string;
    trialTypeCodes: PtabTrialTypeCode[];
    /** ISO date (YYYY-MM-DD), inclusive. Applied to trialMetaData.petitionFilingDate as a rangeFilter, exactly like the worked example on https://data.uspto.gov/apis/api-syntax-examples. */
    filingDateFrom?: string;
    maxItems: number;
}

/**
 * Builds the real ODP "advanced syntax" request body -- q / filters /
 * rangeFilters / pagination / sort -- per
 * https://data.uspto.gov/apis/api-syntax-examples, applied to the PTAB
 * proceedings/search endpoint.
 */
function buildRequestBody(params: FetchPtabProceedingsParams, offset: number, limit: number) {
    const filters: { name: string; value: string[] }[] = [];
    if (params.trialTypeCodes.length > 0) {
        filters.push({ name: 'trialMetaData.trialTypeCode', value: params.trialTypeCodes });
    }

    const rangeFilters: { field: string; valueFrom: string; valueTo: string }[] = [];
    if (params.filingDateFrom) {
        rangeFilters.push({
            field: 'trialMetaData.petitionFilingDate',
            valueFrom: params.filingDateFrom,
            valueTo: new Date().toISOString().slice(0, 10),
        });
    }

    return {
        q: '*',
        filters,
        rangeFilters,
        pagination: { offset, limit },
        sort: [{ field: 'trialMetaData.petitionFilingDate', order: 'Desc' }],
    };
}

/** Pulls the highest-value single party name out of the 4 possible party-data objects for a "who is being challenged" and "who is challenging" view -- see graphMapping.ts for why patentOwner is treated as the enforcement target (Entity) and petitioner as the challenger. */
function flattenProceeding(proceeding: PtabTrialProceeding, now: string): PtabRawRecord {
    const { trialMetaData } = proceeding;
    const owner = proceeding.patentOwnerData ?? proceeding.respondentData;
    const petitioner = proceeding.regularPetitionerData ?? proceeding.derivationPetitionerData;

    return {
        source: 'uspto_ptab',
        trialNumber: proceeding.trialNumber,
        trialTypeCode: trialMetaData.trialTypeCode,
        trialStatusCategory: trialMetaData.trialStatusCategory,
        petitionFilingDate: trialMetaData.petitionFilingDate,
        accordedFilingDate: trialMetaData.accordedFilingDate,
        institutionDecisionDate: trialMetaData.institutionDecisionDate,
        latestDecisionDate: trialMetaData.latestDecisionDate,
        terminationDate: trialMetaData.terminationDate,
        trialLastModifiedDateTime: trialMetaData.trialLastModifiedDateTime ?? proceeding.lastModifiedDateTime,
        fileDownloadURI: trialMetaData.fileDownloadURI,
        patentNumber: owner?.patentNumber ?? petitioner?.patentNumber ?? null,
        applicationNumberText: owner?.applicationNumberText ?? petitioner?.applicationNumberText ?? null,
        patentOwnerName: owner?.patentOwnerName ?? null,
        patentOwnerRealPartyInInterestName: owner?.realPartyInInterestName ?? null,
        petitionerRealPartyInInterestName: petitioner?.realPartyInInterestName ?? null,
        petitionerCounselName: petitioner?.counselName ?? null,
        inventorName: owner?.inventorName ?? petitioner?.inventorName ?? null,
        technologyCenterNumber: owner?.technologyCenterNumber ?? petitioner?.technologyCenterNumber ?? null,

        // Envelope fields filled in by main.ts once delta state (is_new / event_type) is known -- placeholders here, always overwritten.
        record_id: proceeding.trialNumber,
        event_type: 'SANCTION',
        scraped_at: now,
        is_new: true,
        source_url: null,
    };
}

/**
 * Pages through the PTAB proceedings/search endpoint, newest-filed-first,
 * up to maxItems. Sequential requests only (burst=1 -- see src/http.ts).
 */
export async function fetchPtabProceedings(params: FetchPtabProceedingsParams): Promise<PtabRawRecord[]> {
    const now = new Date().toISOString();
    const limit = Math.min(params.maxItems, 100);
    const records: PtabRawRecord[] = [];
    let offset = 0;

    while (records.length < params.maxItems) {
        const remaining = params.maxItems - records.length;
        const body = buildRequestBody(params, offset, Math.min(limit, remaining));
        const page = await fetchJsonWithRetry<PtabSearchResponse>(SEARCH_URL, {
            method: 'POST',
            headers: {
                'x-api-key': params.apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const proceedings = page.patentTrialProceedingDataBag ?? [];
        if (proceedings.length === 0) break;

        for (const proceeding of proceedings) {
            records.push(flattenProceeding(proceeding, now));
            if (records.length >= params.maxItems) break;
        }

        if (proceedings.length < Math.min(limit, remaining)) break; // last page
        offset += proceedings.length;
    }

    return records;
}
