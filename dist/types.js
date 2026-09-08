/**
 * Raw, per-source record interfaces. Field names on PtabTrialProceeding
 * mirror the real USPTO ODP PTAB Trials "Search Proceedings" response shape
 * exactly as documented and live-verified 2026-09-07 at
 * https://data.uspto.gov/apis/ptab-trials/search-proceedings (its "Response"
 * -> 200 -> Data Property table) -- see src/http.ts for the full
 * verification record. Field names on EpoLegalEvent are a best-effort,
 * intentionally defensive shape -- see src/sources/epoOpposition.ts's file
 * comment for exactly what could and could not be confirmed live this
 * session for the OPS legal-status XML response.
 */
export {};
//# sourceMappingURL=types.js.map