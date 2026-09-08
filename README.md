# Global Patent & IP Enforcement Actions Monitor

Extracts patent dispute/enforcement proceedings from the USPTO Patent Trial and Appeal Board (PTAB), optionally enriched with EPO legal-status data, normalized to a shared 18-field Unified Master Schema (UMS), with real cross-run change detection including a dedicated signal when a PTAB trial concludes.

## What's live in v1, and what was deferred

| Source | Status | Why |
|---|---|---|
| USPTO PTAB Trials API | **Live — primary, BYOK** | Real endpoint, real rate limits, confirmed live. Requires a USPTO.gov account with mandatory MFA — a heavier registered-access gate than a bare signup, so this is BYOK (`usptoOdpApiKey`), never a bundled key. |
| EPO Open Patent Services (OPS) | **Live — secondary, optional, BYOK** | Free registration + standard OAuth2 client-credentials flow. `epoOpsConsumerKey`/`epoOpsConsumerSecret`, watchlist-driven via `epWatchlist`. |
| USPTO PatentsView | **Deferred** | Confirmed down/mid-migration as of 2026-09-07 — `data.uspto.gov`'s own transition guide states no committed relaunch date, and `search.patentsview.org` doesn't resolve in DNS. Also never covered disputes/enforcement anyway, only grants/applications — so even fully live it would not have served this actor's brief. |
| WIPO PATENTSCOPE | **Not used** | Confirmed live: programmatic/bulk access is a paid commercial data product (CHF-priced), not an open API. |

## USPTO PTAB Trials API — primary source

`POST https://api.uspto.gov/api/v1/patent/trials/proceedings/search`

Real endpoint, real request-body shape (`q`/`filters`/`rangeFilters`/`pagination`/`sort`, per USPTO's own documented "advanced syntax"), confirmed live. Rate limits confirmed live: burst=1, 4–15 req/s, 5,000,000 calls/week shared across all metadata-retrieval endpoints. `src/sources/usptoPtab.ts` pulls proceeding metadata (trial number, type code, status category, filing/decision dates, patent number, patent-owner and petitioner party data) and flattens it via `flattenProceeding()`.

## EPO Open Patent Services — secondary, optional source

Free registration at `developers.epo.org` (standard OAuth2 client-credentials flow). Endpoint constants (`https://ops.epo.org/3.2/auth/accesstoken`, `.../rest-services/legal/publication/epodoc/{number}`) verified against the real `ops.epo.org` service. Used only when `epoOpsConsumerKey`/`Secret` are supplied and a watchlist (`epWatchlist`) is configured — the XML legal-event parsing is flagged as best-effort since the exact schema could not be confirmed without live credentials during this build.

## Unified Master Schema (UMS)

All records are normalized through `src/umsNormalizer.ts` into an 18-field UMS (`src/schemas.ts#UnifiedRecordSchema`), null-honest per field. `value_usd_normalized` is always `null` — neither source carries a monetary amount, an honest null rather than a fabricated figure.

## Delta mode - change detection, including a real "concluded" signal

Enable `onlyNew: true` on a scheduled task and this actor persists a status fingerprint per record (in its own named key-value store) and only delivers what's new or changed:

- **`SANCTION`** - first time this proceeding/event has been seen.
- **`UPDATED`** - status, latest decision date, or (EPO) event code/date changed since last seen.
- **`TERMINATED`** (PTAB only) - a more specific signal than `UPDATED`: this trial's `terminationDate` transitioned from unset to set since it was last seen - the trial genuinely concluded. A trial that's already terminated the very first time it's seen is reported as a normal `SANCTION`, not `TERMINATED` - there's nothing to transition from on a first sighting.
- **`SNAPSHOT_NO_DIFF`** - identical to last time; skipped from delivery when `onlyNew` is on.

EPO opposition events have no equivalent terminal signal in this actor's currently-parsed data - a new `eventCode` on a watched publication IS itself the point of that record, not a status field to diff against.

## Pricing (PPE)

Compute baseline: $0.25/CU-hour at 1GB / 2,000 req-hr => $0.000125/request. Single event: **`result`**, live-confirmed at $0.002/record.

## MCP tool manifest

`mcp/searchPatentEnforcement.ts` — a standalone JSON-RPC tool declaration (zod `inputSchema`, `jsonSchema` via `zodToJsonSchema`, `handler`), not wired into any external registry - a ready-to-register spec.

## Compliance / BYOK note

No CAPTCHA-solving, no fingerprint spoofing, no WAF/OAuth-gate bypass anywhere in this package. Both live sources require registered API access (USPTO ODP account with MFA; EPO OAuth2 client credentials) — these are legitimate, publisher-sanctioned front doors, not gates being defeated, which is exactly why both are implemented as BYOK inputs rather than an embedded operator key.

## Self-verification (run 2026-09-07)

1. `npm install` — succeeded, 437 packages, 0 errors.
2. `npm run build` (`tsc`) — zero errors, including a standalone typecheck of `mcp/searchPatentEnforcement.ts`.
3. `npm test` (`vitest run`) — **12/12 tests passed**, against fixture data, no live network calls inside the test suite.
4. Live-checked this session: `api.uspto.gov/robots.txt` returns `{"message":"Missing Authentication Token"}` (HTTP 403 — a real auth gate, not a bot/WAF challenge); `ops.epo.org/robots.txt` returns EPO's own published Fair Use policy 403 — both matching this build's own documented findings exactly.
5. Grepped for CAPTCHA/fingerprint/WAF-bypass language — all matches are compliance-doctrine documentation, zero actual bypass code.
