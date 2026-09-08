# Changelog

## 1.1.0 - 2026-09-08

This actor was already the closest of the 5 non-mandate actors to full V2 fidelity - a correctly-NAMED key-value store and real fingerprint-based classification (`first_seen`/`updated`/`unchanged`, mapped to `SANCTION`/`UPDATED`/`SNAPSHOT_NO_DIFF`) were both already in place before this release. This is a narrower, targeted release closing the three specific gaps found: no terminal event, zero test coverage on the delta logic itself, and 503 folded into a generic non-calibrated retry path.

### Added

- **New `TERMINATED` event type (`uspto_ptab` only).** A PTAB trial's `terminationDate` field transitioning from unset to set - the trial genuinely concluding - is now reported as its own distinct event, not folded into a generic `UPDATED` alongside every other status-fingerprint change. `src/state.ts`'s `terminationDates` map tracks this field separately from the existing opaque status fingerprint (added as a new, backward-compatible field on `DeltaState` - `loadState()` backfills an empty map for state persisted before this change, rather than rejecting it), and the new `isNewlyTerminated()` pure function detects the transition. Deliberately only fires on a genuine transition: a trial that's already terminated on its very first sighting is a normal `first_seen`/`SANCTION`, not a "transition" - there's nothing to transition from.
- `test/state.test.ts`: full unit coverage of `classifyRecord()` and `isNewlyTerminated()` (12 tests) - previously the actual delta/classification logic had zero dedicated tests, only the pure UMS-mapping layer was tested. Also covers state persistence, including a legacy-shape backfill test.
- Explicit, calibrated HTTP 503 handling in `src/http.ts`, matching the existing 429 branch's structure (a dedicated branch, not folded into the generic non-ok catch-all) - honors a real `Retry-After` header when present (RFC 9110 permits one on a 503, though neither USPTO ODP nor EPO OPS documents sending one), falling back to exponential backoff otherwise. 5 new tests in `test/http.test.ts` mock real 429/503/401 scenarios, including Retry-After handling on both.
- `LICENSE` (Apache-2.0, matching the fleet standard), `eslint.config.mjs` (missing before - `npm run lint` was defined but could not run), `.github/workflows/test.yaml` (this actor had no CI pipeline), this `CHANGELOG.md`, `AGENTS.md`.

### Fixed

- **Real (if minor) inefficiency found while adding the 503 test:** the pre-existing `!response.ok` fallback path retried ANY non-ok status via the generic catch block - including a genuine permanent client error like 401/403/404, which can only ever fail the same way again. Not a correctness bug (unlike the 429-exclusion bug found the same day on `actor-22-drug-safety-recalls-monitor` - this actor's issue was the opposite: retrying something that should NOT be retried, wasting retry budget rather than giving up too early), but fixed for consistency: a new `HttpError` class distinguishes a genuine HTTP-status failure (never retried, except the explicit 429/503 branches) from a network-level failure (DNS, connection reset - still retried, since those genuinely can succeed on a later attempt).

### Not added (and why)

- **No `TERMINATED`-equivalent for `epo_opposition`.** This actor's currently-parsed EPO fields have no analogous "the opposition process concluded" signal the way PTAB's `terminationDate` does - a new `eventCode` on an EP publication IS itself the point of that record (a new legal event occurring), not a status field to diff against a prior state. Forcing a symmetric terminal event here without a real underlying field would be inventing a signal the source doesn't provide.
- **No pricing/monetization change.** Confirmed live via `GET acts/{id}`: single-tier `result` at $0.002/record - untouched by this release.
