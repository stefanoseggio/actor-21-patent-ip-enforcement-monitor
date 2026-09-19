# actor-21-patent-ip-enforcement-monitor - AI agent notes

Global Patent & IP Enforcement Actions Monitor. Two sources normalized to a shared 18-field UMS: **USPTO PTAB** (Patent Trial and Appeal Board Trials API, `api.uspto.gov`, real adversarial patent-validity disputes - IPR/PGR/CBM/Derivation - BYOK via a free-but-MFA-gated USPTO.gov account) and, optionally, **EPO Open Patent Services** (`ops.epo.org`, legal-status events for a watchlist of EP publications, BYOK OAuth2 client credentials). PatentsView (confirmed down/ENOTFOUND, and wouldn't fit this brief even if it returned - grants aren't enforcement events) and WIPO PATENTSCOPE (every structured data product is a paid CHF subscription) were live-researched and excluded, not silently omitted - see `src/http.ts`'s header comment for the full verification record.

## HTTP transport: `impit`, not the native `fetch`

`src/http.ts`'s `doFetchWithRetry` calls a module-level `Impit` instance
(`new Impit({ browser: 'chrome' })`, from the `impit` package) instead of
the global `fetch` - added 2026-09-19 as a fleet-wide TLS-fingerprint-
hardening pilot (proactive hardening, not a bug fix - Node's `fetch` isn't
deprecated). Things to know if you touch this file again:

- **Unlike the scraped-HTML actors this pilot started on, both of this
  actor's sources (USPTO ODP, EPO OPS) are BYOK credentialed APIs, not sites
  behind a TLS/JA3-inspecting WAF** - `curl -s https://api.uspto.gov/robots.txt`
  returns a plain API-gateway 401 ("Missing Authentication Token"), not a
  bot challenge (see `src/http.ts`'s header comment). The fingerprint swap
  was still applied here for fleet-wide consistency, but it is not solving
  a known problem for this actor the way it is for e.g.
  `florida-tenders-monitor` or `australia-grantconnect-monitor`. A manual,
  unauthenticated smoke request to both `api.uspto.gov` and `ops.epo.org`
  after the swap got back a normal application-level 401 from each (not a
  network/TLS-level failure), confirming the handshake itself is unaffected.
- **`impit`'s own `RequestInit` type is narrower than the DOM's** - its
  `method` field is a fixed `HttpMethod` union, not `string`.
  `doFetchWithRetry`/`fetchJsonWithRetry`/`fetchTextWithRetry` are typed
  against `RequestInit as ImpitRequestInit` from `'impit'` for this reason;
  don't revert that import to the global DOM type without re-checking `tsc`
  passes. The `parseResponse` callback parameter was also loosened from the
  DOM `Response` to a minimal `{ json(): Promise<unknown>; text():
  Promise<string> }` structural type, since `ImpitResponse` doesn't
  structurally satisfy `Response` (e.g. no `blob()`/`formData()`).
- **`Impit.fetch()` is a native binding, not built on the global `fetch`.**
  `vi.spyOn(globalThis, 'fetch')` - the pattern both `test/http.test.ts` and
  `test/usptoPtab.test.ts` used before this change - will NOT intercept it;
  it silently does nothing and the real network call goes out. Both files
  now mock the `impit` module itself instead (`vi.mock('impit', ...)`, with
  `vi.hoisted()` for the mock function reference, and a real `function` -
  not an arrow function - as the mock's `Impit` implementation, since `new
  Impit(...)` requires a constructible mock). Keep that pattern if these
  files' tests are extended.
- **No `test:live` suite exists for this actor**, unlike the two sibling
  actors this pilot started on - both sources need an operator-supplied
  BYOK credential this codebase never holds (see "Known footguns" below), so
  there is no way to exercise the real endpoints end-to-end from CI or this
  repo alone. Verification for this change was therefore: the full unit
  suite green post-swap with no timing regression (proving the `impit` mock
  actually intercepts rather than a live-network leak), plus the manual
  unauthenticated smoke request described above.

## V2 status (this actor was already close - 2026-09-08 pass was narrow)

Unlike the other 4 actors found outside the original 9-actor V2 migration mandate, this one already had, BEFORE this pass: a correctly-NAMED key-value store (no run-scoped `Actor.getValue()`/`setValue()` bug), and real fingerprint-based classification (`first_seen`/`updated`/`unchanged` in `src/state.ts`'s `classifyRecord()`, mapped to `SANCTION`/`UPDATED`/`SNAPSHOT_NO_DIFF` in `main.ts`'s `classify()`). This pass closed three specific, narrower gaps instead of a full rewrite:

- **`TERMINATED` event (uspto_ptab only).** `src/state.ts`'s `terminationDates` map (a NEW field on `DeltaState`, backward-compatible - `loadState()` backfills it for state persisted before this change) tracks a PTAB trial's `terminationDate` separately from the general status fingerprint. `isNewlyTerminated()` fires only on a genuine null-to-set transition, wired in `main.ts`'s PTAB loop to override `eventType` to `'TERMINATED'` instead of the generic `'UPDATED'` `classify()` would otherwise produce. No EPO equivalent - that source has no analogous "concluded" field in its currently-parsed data (see CHANGELOG.md).
- **`classifyRecord()`/`isNewlyTerminated()` test coverage** - previously zero, now 12 dedicated tests in `test/state.test.ts` (the actual delta logic; separate from the pre-existing `test/umsNormalizer.test.ts`, which only covers pure UMS-mapping).
- **Explicit 503 handling in `src/http.ts`**, matching 429's existing calibrated-branch structure (was: folded into the generic non-ok catch-all, which DID eventually retry it but with no status-specific handling or `Retry-After` support). While fixing this, also found and fixed a related but distinct issue: that same generic catch-all retried genuine permanent errors (401/403/404) too, which can never succeed on retry - now distinguished via a new `HttpError` class from a genuinely-retryable network-level failure.

## Known footguns

- No local `Dockerfile` - Apify's implicit build for this template does `COPY . ./` then `npm install --only=prod` ONLY, confirmed against a real build-failure + build log on a sibling actor the same day. **`dist/` MUST be committed, not gitignored.** This repo's `.gitignore` already correctly omits `dist` - verify that stays true before every push.
- **Run `rm -f tsconfig.tsbuildinfo` before every `npm run build`** when `dist/` was just deleted - `tsc`'s incremental cache doesn't verify its own output files still exist on disk, and can silently no-op a build that looks successful (exit 0, zero files written) if the cache thinks nothing changed. This exact failure mode hit a sibling actor (`actor-18-b2b-lead-magnet`) the same day.
- `src/sources/epoOpposition.ts`'s XML parser is deliberately defensive/best-effort (namespace-agnostic tag matching, several plausible attribute-name fallbacks) - the exact element/attribute names in a real OPS `legal` response could NOT be confirmed live (this actor was built without a live OPS Consumer Key/Secret, BYOK, never held by this codebase). MUST be validated against a real authenticated response before treating EPO output as production-reliable, independent of anything in this V2 pass.
- `mcp/searchPatentEnforcement.ts` is outside `tsconfig.json`'s `include` and outside `eslint.config.mjs`'s lint scope - a standalone MCP-tool entry point, not part of the `dist/main.js` build.
- USPTO ODP's own documented guidance is "at least 5 second delay" before retrying a 429 - `src/http.ts`'s `minRetryAfter429Ms: 5000` default enforces this floor even if a caller passes a much smaller `baseDelayMs`. Don't lower it without re-reading `https://data.uspto.gov/apis/api-rate-limits` first.
- Test isolation note (found while adding `test/state.test.ts`): this repo's local `storage/` is NOT purged between separate `npm test` invocations - the new state-persistence tests explicitly reset their own named KV store key in `beforeAll` rather than assuming a clean slate, since two consecutive local `npm test` runs otherwise see stale state from the first run.
