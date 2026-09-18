/**
 * USPTO PTAB Trials API client -- see src/http.ts for the live verification
 * record (endpoint, auth, rate limits, access model). Real endpoint:
 *   POST https://api.uspto.gov/api/v1/patent/trials/proceedings/search
 */
import type { PtabTrialTypeCode } from '../schemas.js';
import type { PtabRawRecord } from '../types.js';
export interface FetchPtabProceedingsParams {
    apiKey: string;
    trialTypeCodes: PtabTrialTypeCode[];
    /** ISO date (YYYY-MM-DD), inclusive. Applied to trialMetaData.petitionFilingDate as a rangeFilter, exactly like the worked example on https://data.uspto.gov/apis/api-syntax-examples. */
    filingDateFrom?: string;
    maxItems: number;
}
/**
 * Pages through the PTAB proceedings/search endpoint, newest-filed-first,
 * up to maxItems. Sequential requests only (burst=1 -- see src/http.ts).
 */
export declare function fetchPtabProceedings(params: FetchPtabProceedingsParams): Promise<PtabRawRecord[]>;
//# sourceMappingURL=usptoPtab.d.ts.map