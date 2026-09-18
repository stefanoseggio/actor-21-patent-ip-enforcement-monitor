/**
 * EPO Open Patent Services (OPS) legal-status client -- see src/http.ts for
 * the live verification record. Real, live-verified endpoints:
 *   Auth:  POST https://ops.epo.org/3.2/auth/accesstoken
 *   Legal: GET  https://ops.epo.org/3.2/rest-services/legal/publication/epodoc/{number}
 *
 * SCOPE NOTE: OPS has no documented "search all recently-opposed patents"
 * endpoint -- `legal` is a per-publication-number lookup. So unlike the
 * PTAB source (a newest-first crawl), this source is watchlist-driven: the
 * operator supplies EP publication numbers (input.epWatchlist) they care
 * about, and this module reports which of those numbers currently show an
 * opposition-family legal event.
 *
 * HONESTY NOTE (repeated from src/http.ts): the exact XML tag/attribute
 * names for a real OPS `legal` response were not confirmed against a live
 * authenticated response this session (no OPS Consumer Key/Secret is held
 * by this codebase -- BYOK). parseLegalEvents() below is therefore
 * deliberately defensive: it looks for any element whose local tag name
 * (namespace prefix stripped) is "legal-event", then reads its event
 * code/date/description off several plausible attribute/child-element
 * names rather than asserting one exact schema. This is documented as a
 * known limitation, not silently passed off as verified.
 */
import * as cheerio from 'cheerio';
import { fetchJsonWithRetry, fetchTextWithRetry } from '../http.js';
const AUTH_URL = 'https://ops.epo.org/3.2/auth/accesstoken';
const LEGAL_URL_BASE = 'https://ops.epo.org/3.2/rest-services/legal/publication/epodoc';
/** OAuth2 client-credentials flow -- HTTP Basic base64(key:secret), form body grant_type=client_credentials. Tokens are short-lived (third-party client libraries document ~20 minutes); this actor fetches one token per run rather than caching across runs. */
export async function getOpsAccessToken(consumerKey, consumerSecret) {
    const basicAuth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const response = await fetchJsonWithRetry(AUTH_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    return response.access_token;
}
const OPPOSITION_TERMS = ['opposition', 'oppo', 'appeal filed', 'board of appeal'];
function isOppositionRelated(code, description) {
    const haystack = `${code ?? ''} ${description ?? ''}`.toLowerCase();
    return OPPOSITION_TERMS.some((term) => haystack.includes(term));
}
/**
 * Defensive/best-effort XML parse -- see file header. Uses cheerio in XML
 * mode (this actor's existing cheerio dependency, already used elsewhere in
 * this fleet for HTML; xmlMode handles namespaced tags by exposing the
 * local name, e.g. `ops:legal-event` is selectable as `legal-event`).
 */
export function parseLegalEvents(xml, publicationNumber) {
    const $ = cheerio.load(xml, { xmlMode: true });
    const events = [];
    $('legal-event, event').each((_, el) => {
        const node = $(el);
        const code = node.attr('code') ?? node.attr('event-code') ?? (node.find('code, event-code').first().text().trim() || null);
        const date = node.attr('date') ?? node.attr('event-date') ?? (node.find('date, event-date').first().text().trim() || null);
        const description = node.find('text, event-desc, description').first().text().trim() ||
            node.attr('desc') ||
            null;
        const country = node.attr('country') ?? (node.find('country').first().text().trim() || null);
        events.push({
            publicationNumber,
            eventCode: code,
            eventDescription: description,
            eventDate: date,
            eventCountry: country,
            isOppositionRelated: isOppositionRelated(code, description),
        });
    });
    return events;
}
export async function fetchLegalEvents(publicationNumber, accessToken) {
    const url = `${LEGAL_URL_BASE}/${encodeURIComponent(publicationNumber)}`;
    const xml = await fetchTextWithRetry(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/xml',
        },
    });
    return parseLegalEvents(xml, publicationNumber);
}
function toRawRecord(event, now) {
    return {
        source: 'epo_opposition',
        publicationNumber: event.publicationNumber,
        eventCode: event.eventCode,
        eventDescription: event.eventDescription,
        eventDate: event.eventDate,
        eventCountry: event.eventCountry,
        record_id: `${event.publicationNumber}:${event.eventCode ?? 'unknown'}:${event.eventDate ?? 'unknown'}`,
        event_type: 'SANCTION',
        scraped_at: now,
        is_new: true,
        source_url: null,
    };
}
/** Fetches legal-status events for every watchlisted publication, sequentially (one token, one call at a time -- see src/http.ts), and returns only opposition-related events, capped at maxItems. */
export async function fetchEpoOppositionEvents(params) {
    const now = new Date().toISOString();
    const accessToken = await getOpsAccessToken(params.consumerKey, params.consumerSecret);
    const records = [];
    for (const publicationNumber of params.watchlist) {
        if (records.length >= params.maxItems)
            break;
        const events = await fetchLegalEvents(publicationNumber, accessToken);
        for (const event of events) {
            if (!event.isOppositionRelated)
                continue;
            records.push(toRawRecord(event, now));
            if (records.length >= params.maxItems)
                break;
        }
    }
    return records;
}
//# sourceMappingURL=epoOpposition.js.map