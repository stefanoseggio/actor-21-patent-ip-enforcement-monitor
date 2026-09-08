/**
 * ============================================================================
 * LIVE SOURCE VERIFICATION -- performed 2026-09-07 for "Global Patent & IP
 * Enforcement Actions Monitor" (USPTO/EPO/WIPO), before any source code
 * below was written against it. No endpoint, field name, or access
 * requirement in this actor is invented -- everything is traceable to one
 * of the live fetches/browses recorded here.
 * ============================================================================
 *
 * 1. USPTO PatentsView PatentSearch API (search.patentsview.org/api /
 *    api.patentsview.org) -- CONFIRMED NOT USABLE as of this date, and
 *    excluded for v1.
 *    Live-browsed https://data.uspto.gov/support/transition-guide/patentsview
 *    2026-09-07 (patentsview.org itself now 301-redirects there): "As part
 *    of the ODP transition, temporary interruptions are expected to affect
 *    the PatentsView PatentSearch API (previously available at
 *    search.patentsview.org/api)... There is currently no estimate for the
 *    launch date of these API functions on ODP" and "Previously-issued API
 *    keys for the PatentSearch API will not be compatible with ODP APIs."
 *    A direct DNS lookup for search.patentsview.org failed during this
 *    session (ENOTFOUND), corroborating the outage. Also note: PatentsView
 *    only ever covered patent grants/applications, not enforcement actions
 *    -- so even when it returns, it would not fit this actor's brief
 *    (ordinary grants are not a dispute/enforcement event).
 *
 * 2. USPTO PTAB (Patent Trial and Appeal Board) Trials API, served from the
 *    USPTO Open Data Portal (ODP) -- CONFIRMED real and live, and the
 *    strongest genuine match to "enforcement actions": Inter Partes Review
 *    (IPR), Post-Grant Review (PGR), Covered Business Method (CBM) and
 *    Derivation (DER) proceedings are real adversarial disputes over
 *    patent validity, not ordinary grants. THIS ACTOR'S PRIMARY SOURCE.
 *
 *    Endpoint, live-verified by browsing
 *    https://data.uspto.gov/apis/ptab-trials/search-proceedings 2026-09-07:
 *      GET/POST https://api.uspto.gov/api/v1/patent/trials/proceedings/search
 *    Auth header: x-api-key: <ODP API key> ("API Key is required.", same
 *    page). Request body shape (q / filters / rangeFilters / pagination /
 *    sort) confirmed against the worked Python example on
 *    https://data.uspto.gov/apis/api-syntax-examples (same JSON shape used
 *    across every ODP metadata-retrieval endpoint, PTAB included). Response
 *    field set (trialNumber, trialMetaData.{trialTypeCode,
 *    trialStatusCategory, petitionFilingDate, accordedFilingDate,
 *    institutionDecisionDate, latestDecisionDate, terminationDate,
 *    fileDownloadURI}, patentOwnerData/regularPetitionerData/
 *    respondentData/derivationPetitionerData each with {patentNumber,
 *    applicationNumberText, realPartyInInterestName, grantDate,
 *    patentOwnerName, inventorName, counselName, technologyCenterNumber,
 *    groupArtUnitNumber}) read directly off that page's "Response -> 200 ->
 *    Data Property" table -- see src/types.ts's PtabTrialProceeding, which
 *    mirrors it field-for-field.
 *
 *    Not a bot-detection gate: `curl -s https://api.uspto.gov/robots.txt`
 *    (bare, unauthenticated) returned HTTP 403 with body
 *    `{"message":"Missing Authentication Token"}` -- an API-gateway auth
 *    check, not a CAPTCHA/WAF challenge.
 *
 *    Rate limits, live-verified at https://data.uspto.gov/apis/api-rate-limits
 *    2026-09-07: burst = 1 (no concurrent calls per key -- this file never
 *    issues parallel requests), rate 4-15 requests/second depending on
 *    endpoint, 5,000,000 calls/week shared across all "metadata retrieval"
 *    endpoints (PTAB search included), weekly reset Sunday 00:00 UTC, HTTP
 *    429 on excess with the page's own explicit guidance: "we strongly
 *    discourage automatic retries...without at least 5 second delay" --
 *    this file's retry backoff honors that floor.
 *
 *    ACCESS MODEL (why this is BYOK, not a bundled key): live-verified via
 *    the in-app registration banner at https://data.uspto.gov 2026-09-07:
 *    "starting on June 18, 2026, you'll need to sign in with a valid
 *    USPTO.gov account... your USPTO.gov account requires multi-factor
 *    authentication (MFA)", plus "effective August 18, 2026, we will be
 *    requiring users to provide four additional fields of information on
 *    their USPTO profile [or lose] access to ODP products and API key."
 *    That is a heavier registered-access gate than a bare email signup, but
 *    it is still a legitimate free front door (account creation + MFA, no
 *    CAPTCHA-solving or WAF bypass involved) -- so, per the compliance
 *    doctrine's SAM.gov-style carve-out for genuine registered access, this
 *    actor never attempts to automate that registration; the operator
 *    supplies their own already-issued key via input.usptoOdpApiKey.
 *
 * 3. EPO (European Patent Office) Open Patent Services (OPS) v3.2 --
 *    CONFIRMED real and documented. SECONDARY/OPTIONAL source for v1.
 *    Live-browsed https://developers.epo.org/ 2026-09-07: "Register to get
 *    access credentials" (free), then "define a test app" and authenticate
 *    "using OAuth" -- a standard OAuth2 client-credentials flow keyed by a
 *    per-app Consumer Key/Secret.
 *
 *    Base URL and the OAuth token endpoint were cross-checked against the
 *    literal URL constants in an open-source OPS client library's source
 *    (ip-tools/python-epo-ops-client, epo_ops/api.py, fetched 2026-09-07),
 *    since the OPS Reference Guide PDF itself is gated behind the same
 *    login this actor is designed not to automate:
 *      Auth:  POST https://ops.epo.org/3.2/auth/accesstoken
 *             (HTTP Basic base64(consumerKey:consumerSecret),
 *             body grant_type=client_credentials, form-encoded)
 *      Base:  https://ops.epo.org/3.2/rest-services
 *      Legal: GET  {base}/legal/publication/epodoc/{number}
 *    A bare unauthenticated `curl -s https://ops.epo.org/robots.txt`
 *    returned HTTP 403 with body `{"code":403,"message":"This request has
 *    been rejected due to the violation of Fair Use policy",
 *    "moreInfo":"https://www.epo.org/service-support/ordering/fair-use.html"}`
 *    -- EPO's own published Fair Use policy is the access gate, applied
 *    uniformly to every unregistered caller, not a targeted bot challenge.
 *    Free-tier allowance found via search: 4 GB/week.
 *
 *    IMPORTANT HONESTY NOTE: the exact XML element/attribute names inside a
 *    real OPS `legal` response (e.g. whether a legal event's code lives on
 *    an attribute called `code`, `event-code`, or something else) could NOT
 *    be confirmed against a live authenticated response this session --
 *    this actor was built without a live OPS Consumer Key/Secret (BYOK,
 *    never held by this codebase). src/sources/epoOpposition.ts's parser is
 *    therefore deliberately defensive/best-effort (namespace-agnostic tag
 *    matching, several plausible attribute-name fallbacks) rather than
 *    asserting a schema this session could not verify -- flagged again in
 *    that file's own comment, and MUST be validated against a real response
 *    before production use.
 *
 * 4. WIPO PATENTSCOPE -- live-browsed
 *    https://www.wipo.int/en/web/patentscope/data/index 2026-09-07: every
 *    structured/bulk data product is a PAID subscription priced in Swiss
 *    francs (e.g. "XML ... Price: 1,600 Swiss francs per copy", PCT
 *    backfiles up to 38,000 CHF); the separately-documented SOAP web
 *    service is likewise a paid product (2,000 CHF/year per prior
 *    research). Only the human PATENTSCOPE web search UI is free -- there
 *    is no genuinely free programmatic path. EXCLUDED for v1, not
 *    force-fit against a paid gate.
 *
 * No CAPTCHA-solving, fingerprint spoofing, or WAF/OAuth-gate bypass is
 * used anywhere in this actor. Every credential this file sends is a
 * legitimately registered, operator-supplied key obtained through each
 * source's own standard free sign-up flow (BYOK) -- never hardcoded, never
 * captured beyond the run that used it.
 */

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** Thrown for a genuine permanent HTTP error (any non-ok status other than 429/503, which have their own retry branches below) - distinguished by TYPE from a network-level failure (fetch() itself throwing - DNS, connection reset), which is a plain Error and IS worth retrying. */
export class HttpError extends Error {
    constructor(
        message: string,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

export interface RetryOptions {
    maxRetries?: number;
    /** Floor for the backoff after an HTTP 429, per USPTO ODP's own published guidance ("at least 5 second delay") -- also used as a sane default against EPO OPS, which publishes no equivalent number. */
    minRetryAfter429Ms?: number;
    baseDelayMs?: number;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
    maxRetries: 4,
    minRetryAfter429Ms: 5000,
    baseDelayMs: 1000,
};

/** `Retry-After` per RFC 9110: either a delay in seconds or an HTTP-date. Returns null (fall back to computed backoff) if absent/unparseable. Neither USPTO ODP nor EPO OPS documents sending this on a 503, but RFC 9110 permits it on any 503 response, so it's honored when present rather than assumed absent. */
function parseRetryAfterMs(headerValue: string | null): number | null {
    if (!headerValue) return null;
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateMs = Date.parse(headerValue);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
    return null;
}

/**
 * Plain fetch() with exponential backoff, no proxy (per this fleet's
 * standing convention -- see uk-hse-enforcement-monitor/src/http.ts). Every
 * source in this actor requires a real, registered API credential anyway,
 * so there is nothing a proxy or fingerprint change would legitimately
 * accomplish here.
 *
 * This actor issues requests sequentially, one in flight at a time, by
 * construction (no Promise.all/fan-out over pages) -- matching ODP's
 * documented burst=1 requirement and being a reasonable default against
 * EPO's fair-use policy too.
 *
 * 429 and 503 are both explicit, calibrated branches (not folded into the
 * generic `!response.ok` catch-all): 429 honors USPTO's documented 5-second
 * floor; 503 (service temporarily unavailable) gets the same exponential
 * backoff as any other retry, plus a real `Retry-After` header when the
 * server sends one, rather than relying on the generic outer catch to
 * eventually retry it with no status-specific handling at all.
 */
async function doFetchWithRetry(url: string, init: RequestInit, options: RetryOptions, parseResponse: (r: Response) => Promise<unknown>): Promise<unknown> {
    const { maxRetries, minRetryAfter429Ms, baseDelayMs } = { ...DEFAULT_RETRY, ...options };
    let lastError: Error = new Error('unreachable');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, init);

            if (response.status === 429) {
                if (attempt < maxRetries) {
                    await sleep(Math.max(minRetryAfter429Ms, baseDelayMs * 2 ** attempt));
                    continue;
                }
                throw new Error(`HTTP 429 (rate limited) for ${url} after ${maxRetries} retries`);
            }

            if (response.status === 503) {
                if (attempt < maxRetries) {
                    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
                    await sleep(retryAfterMs ?? baseDelayMs * 2 ** attempt);
                    continue;
                }
                throw new Error(`HTTP 503 (service unavailable) for ${url} after ${maxRetries} retries`);
            }

            if (!response.ok) {
                const body = await response.text().catch(() => '');
                // A genuine permanent client error (401/403/404/etc) is not
                // worth retrying - identical to the request that produced
                // it, it can only fail the same way again. Only reached
                // here since 429/503 are already handled as their own
                // explicit branches above; every other non-ok status was
                // previously retried via the generic catch below (this
                // actor's original behavior, before this fix), wasting
                // retry budget on an error retrying can never resolve.
                throw new HttpError(`HTTP ${response.status} for ${url}${body ? `: ${body.slice(0, 500)}` : ''}`, response.status);
            }
            return await parseResponse(response);
        } catch (error) {
            if (error instanceof HttpError) throw error;
            // Only network-level failures (fetch() itself threw - DNS,
            // connection reset, etc) reach here - genuinely worth retrying,
            // unlike the permanent HTTP error re-thrown immediately above.
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
                await sleep(baseDelayMs * 2 ** attempt);
            }
        }
    }
    throw lastError;
}

export async function fetchJsonWithRetry<T>(url: string, init: RequestInit, options: RetryOptions = {}): Promise<T> {
    return (await doFetchWithRetry(url, init, options, async (r) => r.json())) as T;
}

/** Same retry contract as fetchJsonWithRetry but returns raw text -- used for the OPS legal-status XML response and the OPS OAuth token response (form-encoded body in, JSON out, but the underlying transport shape differs enough to keep this separate). */
export async function fetchTextWithRetry(url: string, init: RequestInit, options: RetryOptions = {}): Promise<string> {
    return (await doFetchWithRetry(url, init, options, async (r) => r.text())) as string;
}
