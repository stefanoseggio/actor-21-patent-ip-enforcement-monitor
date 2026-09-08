import { describe, expect, it } from 'vitest';

import { normalizeEpoRecord, normalizePtabRecord } from '../src/umsNormalizer.js';
import { UnifiedRecordSchema } from '../src/schemas.js';
import type { EpoRawRecord, PtabRawRecord } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures -- shaped exactly like flattenProceeding()/toRawRecord() output,
// no live network calls anywhere in this file.
// ---------------------------------------------------------------------------

function ptabFixture(overrides: Partial<PtabRawRecord> = {}): PtabRawRecord {
    return {
        source: 'uspto_ptab',
        trialNumber: 'IPR2024-00123',
        trialTypeCode: 'IPR',
        trialStatusCategory: 'Instituted',
        petitionFilingDate: '2024-01-15',
        accordedFilingDate: '2024-01-20',
        institutionDecisionDate: '2024-07-10',
        latestDecisionDate: '2024-07-10',
        terminationDate: null,
        trialLastModifiedDateTime: '2024-07-10T12:00:00Z',
        fileDownloadURI: 'https://api.uspto.gov/api/v1/patent/trials/documents/IPR2024-00123/download',
        patentNumber: '10123456',
        applicationNumberText: '15123456',
        patentOwnerName: 'Acme Widgets Inc.',
        patentOwnerRealPartyInInterestName: 'Acme Widgets Inc.',
        petitionerRealPartyInInterestName: 'Globex Corp',
        petitionerCounselName: 'Jane Counsel',
        inventorName: 'John Inventor',
        technologyCenterNumber: '2600',
        record_id: 'IPR2024-00123',
        event_type: 'SANCTION',
        scraped_at: '2026-09-07T00:00:00.000Z',
        is_new: true,
        source_url: null,
        ...overrides,
    };
}

function epoFixture(overrides: Partial<EpoRawRecord> = {}): EpoRawRecord {
    return {
        source: 'epo_opposition',
        publicationNumber: 'EP3000000',
        eventCode: 'OPPO',
        eventDescription: 'Opposition filed against patent',
        eventDate: '2026-03-01',
        eventCountry: 'EP',
        record_id: 'EP3000000:OPPO:2026-03-01',
        event_type: 'SANCTION',
        scraped_at: '2026-09-07T00:00:00.000Z',
        is_new: true,
        source_url: null,
        ...overrides,
    };
}

describe('normalizePtabRecord', () => {
    it('maps a first-seen PTAB proceeding to a valid UnifiedRecord', () => {
        const raw = ptabFixture();
        const ums = normalizePtabRecord(raw, 'SANCTION', true);

        expect(() => UnifiedRecordSchema.parse(ums)).not.toThrow();
        expect(ums.record_id).toBe('IPR2024-00123');
        expect(ums.reference_number).toBe('IPR2024-00123');
        expect(ums.event_type).toBe('SANCTION');
        expect(ums.is_new).toBe(true);
        expect(ums.jurisdiction).toBe('US');
        expect(ums.awarding_or_regulating_agency).toBe('USPTO Patent Trial and Appeal Board (PTAB)');
    });

    it('puts the patent owner (not the petitioner) in recipient_or_defendant_name', () => {
        const ums = normalizePtabRecord(ptabFixture(), 'SANCTION', true);
        expect(ums.recipient_or_defendant_name).toBe('Acme Widgets Inc.');
        expect(ums.recipient_or_defendant_name).not.toBe('Globex Corp');
    });

    it('uses the challenged patent number as entity_identifier_native', () => {
        const ums = normalizePtabRecord(ptabFixture(), 'SANCTION', true);
        expect(ums.entity_identifier_native).toBe('10123456');
    });

    it('prefers institutionDecisionDate for effective_date_iso, falling back to accordedFilingDate', () => {
        const withInstitution = normalizePtabRecord(ptabFixture(), 'SANCTION', true);
        expect(withInstitution.effective_date_iso).toBe('2024-07-10');

        const withoutInstitution = normalizePtabRecord(
            ptabFixture({ institutionDecisionDate: null }),
            'SANCTION',
            true,
        );
        expect(withoutInstitution.effective_date_iso).toBe('2024-01-20');
    });

    it('never fabricates a monetary value -- PTAB proceedings carry none', () => {
        const ums = normalizePtabRecord(ptabFixture(), 'SANCTION', true);
        expect(ums.value_native).toBeNull();
        expect(ums.value_currency).toBeNull();
        expect(ums.value_usd_normalized).toBeNull();
    });

    it('never fabricates source_url (no verified per-record public URL) but keeps source_document_url', () => {
        const ums = normalizePtabRecord(ptabFixture(), 'SANCTION', true);
        expect(ums.source_url).toBeNull();
        expect(ums.source_document_url).toBe('https://api.uspto.gov/api/v1/patent/trials/documents/IPR2024-00123/download');
    });

    it('reflects UPDATED event_type and is_new=false for a previously-seen record whose status changed', () => {
        const ums = normalizePtabRecord(ptabFixture({ trialStatusCategory: 'FWD Entered' }), 'UPDATED', false);
        expect(ums.event_type).toBe('UPDATED');
        expect(ums.is_new).toBe(false);
        expect(ums.status_or_estado).toBe('FWD Entered');
    });

    it('nulls out entity_identifier_native and recipient_or_defendant_name when the source data has neither', () => {
        const ums = normalizePtabRecord(
            ptabFixture({ patentNumber: null, applicationNumberText: null, patentOwnerName: null, patentOwnerRealPartyInInterestName: null }),
            'SANCTION',
            true,
        );
        expect(ums.entity_identifier_native).toBeNull();
        expect(ums.recipient_or_defendant_name).toBeNull();
    });
});

describe('normalizeEpoRecord', () => {
    it('maps an EPO opposition legal event to a valid UnifiedRecord', () => {
        const raw = epoFixture();
        const ums = normalizeEpoRecord(raw, 'SANCTION', true);

        expect(() => UnifiedRecordSchema.parse(ums)).not.toThrow();
        expect(ums.record_id).toBe('EP3000000:OPPO:2026-03-01');
        expect(ums.jurisdiction).toBe('EP');
        expect(ums.awarding_or_regulating_agency).toBe('European Patent Office (EPO) -- Legal/Opposition Division');
        expect(ums.entity_identifier_native).toBe('EP3000000');
        expect(ums.category_or_type).toBe('OPPO');
        expect(ums.status_or_estado).toBe('Opposition filed against patent');
    });

    it('leaves recipient_or_defendant_name null -- OPS legal-status responses carry no owner name in this actor\'s scope', () => {
        const ums = normalizeEpoRecord(epoFixture(), 'SANCTION', true);
        expect(ums.recipient_or_defendant_name).toBeNull();
    });

    it('never fabricates a monetary value or a public source URL', () => {
        const ums = normalizeEpoRecord(epoFixture(), 'SANCTION', true);
        expect(ums.value_native).toBeNull();
        expect(ums.value_currency).toBeNull();
        expect(ums.value_usd_normalized).toBeNull();
        expect(ums.source_url).toBeNull();
        expect(ums.source_document_url).toBeNull();
    });

    it('uses eventDate for both effective_date_iso and publish_date_iso', () => {
        const ums = normalizeEpoRecord(epoFixture(), 'SANCTION', true);
        expect(ums.effective_date_iso).toBe('2026-03-01');
        expect(ums.publish_date_iso).toBe('2026-03-01');
    });
});
