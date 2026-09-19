import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchPtabProceedings } from '../src/sources/usptoPtab.js';
import type { PtabSearchResponse, PtabTrialProceeding } from '../src/types.js';

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function makeProceeding(trialNumber: string, petitionFilingDate: string): PtabTrialProceeding {
    return {
        trialNumber,
        trialRecordIdentifier: null,
        lastModifiedDateTime: null,
        trialMetaData: {
            trialTypeCode: 'IPR',
            trialStatusCategory: 'Instituted',
            trialLastModifiedDate: null,
            petitionFilingDate,
            trialLastModifiedDateTime: null,
            accordedFilingDate: null,
            institutionDecisionDate: null,
            latestDecisionDate: null,
            terminationDate: null,
            fileDownloadURI: null,
        },
        patentOwnerData: null,
        regularPetitionerData: null,
        respondentData: null,
        derivationPetitionerData: null,
    };
}

describe('fetchPtabProceedings - pagination sort and de-duplication', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('sends trialNumber as a secondary/tie-breaking sort field alongside petitionFilingDate', async () => {
        const page: PtabSearchResponse = { patentTrialProceedingDataBag: [makeProceeding('IPR2026-00001', '2026-01-01')] };
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(page));

        await fetchPtabProceedings({ apiKey: 'k', trialTypeCodes: [], maxItems: 10 });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0];
        const body = JSON.parse(init!.body as string);
        expect(body.sort).toEqual([
            { field: 'trialMetaData.petitionFilingDate', order: 'Desc' },
            { field: 'trialNumber', order: 'Asc' },
        ]);
    });

    it('de-duplicates by trialNumber when the same record is returned again across a real page boundary', async () => {
        // The internal page size is capped at min(maxItems, 100), so a
        // maxItems above 100 is what forces a genuine second HTTP page
        // fetch. Page 1 returns a full 100-item page (T0001..T0100); page 2
        // re-returns T0100 (simulating a tie-break/offset-boundary re-fetch)
        // plus 4 genuinely new records. This is exactly the structural
        // pattern the audit flagged: no secondary sort/de-dup risks a
        // record being skipped or double-pushed at a page boundary.
        const page1Items = Array.from({ length: 100 }, (_, i) => makeProceeding(`T${String(i + 1).padStart(4, '0')}`, '2026-01-01'));
        const page2Items = [makeProceeding('T0100', '2026-01-01'), ...Array.from({ length: 4 }, (_, i) => makeProceeding(`T${String(i + 101).padStart(4, '0')}`, '2026-01-01'))];

        const page1: PtabSearchResponse = { patentTrialProceedingDataBag: page1Items };
        const page2: PtabSearchResponse = { patentTrialProceedingDataBag: page2Items };
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(page1)).mockResolvedValueOnce(jsonResponse(page2));

        const records = await fetchPtabProceedings({ apiKey: 'k', trialTypeCodes: [], maxItems: 105 });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const trialNumbers = records.map((r) => r.trialNumber);
        expect(new Set(trialNumbers).size).toBe(trialNumbers.length);
        expect(trialNumbers.filter((t) => t === 'T0100')).toHaveLength(1);
        expect(records).toHaveLength(104); // 100 + 5 - 1 duplicate
    });
});
