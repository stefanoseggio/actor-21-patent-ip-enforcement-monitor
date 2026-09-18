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
import type { EpoLegalEvent, EpoRawRecord } from '../types.js';
/** OAuth2 client-credentials flow -- HTTP Basic base64(key:secret), form body grant_type=client_credentials. Tokens are short-lived (third-party client libraries document ~20 minutes); this actor fetches one token per run rather than caching across runs. */
export declare function getOpsAccessToken(consumerKey: string, consumerSecret: string): Promise<string>;
/**
 * Defensive/best-effort XML parse -- see file header. Uses cheerio in XML
 * mode (this actor's existing cheerio dependency, already used elsewhere in
 * this fleet for HTML; xmlMode handles namespaced tags by exposing the
 * local name, e.g. `ops:legal-event` is selectable as `legal-event`).
 */
export declare function parseLegalEvents(xml: string, publicationNumber: string): EpoLegalEvent[];
export declare function fetchLegalEvents(publicationNumber: string, accessToken: string): Promise<EpoLegalEvent[]>;
export interface FetchEpoOppositionParams {
    consumerKey: string;
    consumerSecret: string;
    watchlist: string[];
    maxItems: number;
}
/** Fetches legal-status events for every watchlisted publication, sequentially (one token, one call at a time -- see src/http.ts), and returns only opposition-related events, capped at maxItems. */
export declare function fetchEpoOppositionEvents(params: FetchEpoOppositionParams): Promise<EpoRawRecord[]>;
//# sourceMappingURL=epoOpposition.d.ts.map