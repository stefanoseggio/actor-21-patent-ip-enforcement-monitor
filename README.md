# Patent & IP Enforcement Monitor - USPTO PTAB & EPO Opposition Tracker (Global IP Risk)

## Executive Value Proposition

Checking whether a patent is under active adversarial challenge means manually querying the USPTO Patent Trial and Appeal Board's docket search, and separately checking EPO legal-status records, per patent, on a recurring basis - tedious enough that most legal/IP teams either skip it or only do it quarterly. This actor automates that lookup against the real USPTO PTAB Trials API (Inter Partes Review, Post-Grant Review, Covered Business Method, and Derivation proceedings) and, optionally, an EPO Open Patent Services opposition watchlist, normalizes both into one schema, and - in delta mode - tells you specifically what's new, what changed, and which trial just concluded, instead of a full snapshot you have to diff yourself every run.

## Use Cases

- **IP-litigation risk monitoring for legal/IP teams.** Track PTAB proceedings against your own company's patent portfolio (via `patentOwnerName`/patent number) so counsel is alerted the moment a petition is filed or a trial is instituted against a patent you hold, not weeks later.
- **Competitor patent-challenge tracking.** Monitor which of a competitor's patents are being challenged via IPR/PGR/CBM/Derivation, and by whom (`petitionerRealPartyInInterestName`) - a signal for competitive-intelligence and product-roadmap teams watching a rival's IP position erode or hold.
- **Freedom-to-operate (FTO) due diligence.** Before a product launch, acquisition, or investment, check whether patents relevant to the deal are currently under PTAB challenge or carry an active EPO opposition-family legal event on the watchlisted EP publication number.

## Input

```json
{
  "sources": ["uspto_ptab"],
  "usptoOdpApiKey": "YOUR_USPTO_ODP_API_KEY",
  "trialTypeCodes": ["IPR", "PGR"],
  "dateRange": "30d",
  "maxItemsPerSource": 100,
  "onlyNew": true
}
```

| Field | Type | Description |
|---|---|---|
| `sources` | array (select) | `uspto_ptab` (USPTO PTAB Trials, IPR/PGR/CBM/DER) and/or `epo_opposition` (EPO OPS opposition-family watch, watchlist-driven). Default `["uspto_ptab"]`. |
| `usptoOdpApiKey` | string, secret | **Required when `sources` includes `uspto_ptab`.** BYOK - a free API key from a USPTO.gov account (MFA required), obtained at `https://data.uspto.gov/myodp`. Never logged or persisted beyond the run. |
| `epoOpsConsumerKey` | string, secret | **Required when `sources` includes `epo_opposition`.** BYOK - Consumer Key from a free `developers.epo.org` account + registered App (OAuth2 client-credentials flow). |
| `epoOpsConsumerSecret` | string, secret | Paired with `epoOpsConsumerKey`. Never logged or persisted beyond the run. |
| `epWatchlist` | array of strings | **Required when `sources` includes `epo_opposition`.** EP publication numbers in OPS "epodoc" format (e.g. `"EP3000000"`). EPO OPS has no bulk "recent oppositions" endpoint, only a per-publication legal-status lookup, so this source is watchlist-driven. |
| `trialTypeCodes` | array (select) | Filters `uspto_ptab` results by trial type: `IPR`, `PGR`, `CBM`, `DER`. Leave empty for all four. |
| `dateRange` | string (select) | Restricts `uspto_ptab` results to proceedings whose `petitionFilingDate` falls within `24h` / `7d` / `30d` / `90d`, applied server-side. Does not affect `epo_opposition`. |
| `maxItemsPerSource` | integer | Hard cap on records returned per selected source this run. Default `100`. |
| `onlyNew` | boolean | Delta mode: persists seen record IDs and status fingerprints in this actor's own key-value store, and skips records unchanged since the last run. Default `false`. Recommended for recurring monitoring. |

## Output

One dataset record per proceeding/event, combining the source-native fields with the normalized 18-field Unified Master Schema (UMS) envelope. Example for a USPTO PTAB record:

```json
{
  "source": "uspto_ptab",
  "trialNumber": "IPR2024-00123",
  "trialTypeCode": "IPR",
  "trialStatusCategory": "Instituted",
  "petitionFilingDate": "2024-01-15",
  "accordedFilingDate": "2024-01-20",
  "institutionDecisionDate": "2024-07-10",
  "latestDecisionDate": "2024-07-10",
  "terminationDate": null,
  "fileDownloadURI": "https://api.uspto.gov/api/v1/patent/trials/documents/IPR2024-00123/download",
  "patentNumber": "10123456",
  "patentOwnerName": "Acme Widgets Inc.",
  "petitionerRealPartyInInterestName": "Globex Corp",
  "record_id": "IPR2024-00123",
  "event_type": "SANCTION",
  "scraped_at": "2026-09-07T00:00:00.000Z",
  "is_new": true,
  "recipient_or_defendant_name": "Acme Widgets Inc.",
  "entity_identifier_native": "10123456",
  "value_usd_normalized": null,
  "effective_date_iso": "2024-07-10",
  "publish_date_iso": "2024-01-15",
  "category_or_type": "IPR",
  "status_or_estado": "Instituted",
  "awarding_or_regulating_agency": "USPTO Patent Trial and Appeal Board (PTAB)",
  "jurisdiction": "US",
  "source_document_url": "https://api.uspto.gov/api/v1/patent/trials/documents/IPR2024-00123/download",
  "reference_number": "IPR2024-00123"
}
```

`event_type` is one of `SANCTION` (first seen), `UPDATED` (status/decision changed since last run), `TERMINATED` (PTAB-only - `terminationDate` transitioned from unset to set, meaning the trial genuinely concluded), or `SNAPSHOT_NO_DIFF` (unchanged, only emitted when `onlyNew` is off). `value_usd_normalized` and related value fields are always `null` for this actor's two sources - neither PTAB proceedings nor EPO opposition events carry a monetary amount, so this is left an honest null rather than a fabricated figure. EPO records instead populate `publicationNumber`/`eventCode`/`eventDescription`/`eventDate`/`eventCountry` and set `jurisdiction: "EP"`.

## Reliability

Every request goes through a single sequential fetch path (`src/http.ts`) with exponential backoff: HTTP `429` responses honor USPTO ODP's own documented minimum 5-second retry floor, `503` responses back off and respect a real `Retry-After` header when the server sends one, and permanent client errors (401/403/404, etc.) are not retried since retrying an unchanged request can only fail the same way again. Requests are issued one at a time, matching USPTO ODP's documented `burst=1` limit.

In delta mode (`onlyNew: true`), a status fingerprint per record is persisted in this actor's own named key-value store between runs (`src/state.ts`). For PTAB, the `terminationDate` field is tracked separately from the general fingerprint specifically so a null-to-set transition - the trial actually concluding - is reported as its own distinct `TERMINATED` event rather than folded into a generic `UPDATED`. A trial that is already terminated the first time it's seen is reported as a normal `SANCTION`, since there's nothing to transition from on a first sighting.

## Pricing

Pay Per Event (PPE): a single billed event, **`result`**, charged once for each dataset record actually pushed - not for actor start or raw compute time. Price live-confirmed at **$0.002 per record**, against a compute cost basis of roughly $0.000125/request (at the platform's $0.25/CU-hour rate, running at 1 GB memory / ~2,000 requests-per-hour). Check the actor's Apify Store page for the current live per-result price before running at volume, since pricing can be revised independently of this README.

## Support & Enterprise SLA

This is an independently developed and maintained actor, not a vendor product backed by a contractual SLA. Bug reports and feature requests are handled through the Apify Store's built-in issue tracker for this actor; issues are typically triaged within about 48 hours. Both data sources require your own registered API credentials (USPTO ODP key; EPO OPS Consumer Key/Secret) - this actor never attempts to create those accounts on your behalf, and credentials are never logged or persisted beyond the run that used them.
