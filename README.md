[![Built for Apify](https://img.shields.io/badge/Built%20for-Apify-00C0A3?logo=apify&logoColor=white)](https://apify.com)
[![Pay Per Event](https://img.shields.io/badge/Pay%20Per%20Event-%240.002%2Fresult-blue)](#cost--byok-disclosure)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-green.svg)](./LICENSE)

### [▶ Run on Apify](https://apify.com/stefano_seggio/actor-21-patent-ip-enforcement-monitor)

# Patent & IP Enforcement Monitor - USPTO PTAB & EPO Opposition Tracker (Global IP Risk)

> This Actor monitors USPTO PTAB patent-trial proceedings (US) plus an optional EPO opposition-family watch (EU, BYOK) - jurisdiction US core + optional EU coverage - and runs whenever you trigger it or schedule it on your own Apify Scheduler; there is no fixed operator-side cadence.

## Executive Value Proposition

Checking whether a patent is under active adversarial challenge means manually querying the USPTO Patent Trial and Appeal Board's docket search, and separately checking EPO legal-status records, per patent, on a recurring basis - tedious enough that most legal/IP teams either skip it or only do it quarterly. This actor automates that lookup against the real USPTO PTAB Trials API (Inter Partes Review, Post-Grant Review, Covered Business Method, and Derivation proceedings) and, optionally, an EPO Open Patent Services opposition watchlist, normalizes both into one schema, and - in delta mode - tells you specifically what's new, what changed, and which trial just concluded, instead of a full snapshot you have to diff yourself every run.

## Use Cases

- **IP-litigation risk monitoring for legal/IP teams.** Track PTAB proceedings against your own company's patent portfolio (via `patentOwnerName`/patent number) so counsel is alerted the moment a petition is filed or a trial is instituted against a patent you hold, not weeks later.
- **Competitor patent-challenge tracking.** Monitor which of a competitor's patents are being challenged via IPR/PGR/CBM/Derivation, and by whom (`petitionerRealPartyInInterestName`) - a signal for competitive-intelligence and product-roadmap teams watching a rival's IP position erode or hold.
- **Freedom-to-operate (FTO) due diligence.** Before a product launch, acquisition, or investment, check whether patents relevant to the deal are currently under PTAB challenge or carry an active EPO opposition-family legal event on the watchlisted EP publication number.

## Cost & BYOK Disclosure

### Pricing (Pay-Per-Event)

This actor bills via Apify's Pay-Per-Event (PPE) model:

| Event | Name | What triggers it | Price |
|---|---|---|---|
| `result` | Patent Enforcement Proceeding | Charged by this Actor's own code every time a dataset record is pushed (PTAB or EPO) | **$0.002** per event |
| `compute` | Compute unit | Apify's standard automatic compute-unit billing component of this Actor's hybrid PPE pricing model, metered by the platform itself rather than called explicitly in this Actor's source | **$0.25** per CU-hour |

There is no charge for actor start or for a run that finds nothing new (when `onlyNew` skips unchanged records - see below). Check the [Actor's Apify Store page](https://apify.com/stefano_seggio/actor-21-patent-ip-enforcement-monitor) for the current live pricing before running at volume, since pricing can be revised independently of this README.

### How unchanged-record suppression actually works

Unlike some sibling Delta Registry Actors, this Actor's delta state is **not** a cryptographic hash - `src/main.ts` builds a plain pipe-joined status string per record (`ptabFingerprint`: `trialStatusCategory|latestDecisionDate|terminationDate`; `epoFingerprint`: `eventCode|eventDate`) and persists it in this Actor's own key-value store between runs. Comparing that string against the previous run's value classifies each record as `SANCTION` (first seen), `UPDATED` (the tracked fields changed), `TERMINATED` (PTAB only - `terminationDate` transitioned from unset to set), or `SNAPSHOT_NO_DIFF` (identical to last time).

- **`onlyNew: true` (recommended for recurring monitoring):** a `SNAPSHOT_NO_DIFF` record is skipped before it is ever pushed to the dataset - no `result` event fires, so it is genuinely **$0.00**, not billed, and not a refund applied after the fact.
- **`onlyNew: false` (the default):** every record fetched this run is pushed and billed, including unchanged ones marked `SNAPSHOT_NO_DIFF`.

### BYOK (Bring Your Own Key)

Per Delta Registry's fleet-wide pricing page: *"Optional EPO opposition-data key unlocks EU coverage — USPTO PTAB coverage needs no key."* To be precise about this Actor's actual, live-verified requirements (per its own `.actor/input_schema.json` and `src/main.ts`), that summary understates the USPTO side: **both sources are independently BYOK, and at least one is required to get any real results at all.**

- `usptoOdpApiKey` is **required** whenever `sources` includes `uspto_ptab` (the default source) - a free USPTO Open Data Portal key from a USPTO.gov account (MFA required), obtained at [data.uspto.gov/myodp](https://data.uspto.gov/myodp). Calling this Actor with `uspto_ptab` selected and no key throws immediately - it is not optional for that source.
- `epoOpsConsumerKey` + `epoOpsConsumerSecret` are **required** whenever `sources` includes `epo_opposition` - a free Consumer Key/Secret pair from a `developers.epo.org` account + registered App (OAuth2 client-credentials flow), plus an `epWatchlist` of EP publication numbers (EPO OPS has no bulk "recent oppositions" endpoint).

What "optional" correctly describes: which of the two sources you choose to enable, and whether you add the EPO watchlist on top of PTAB coverage for EU reach. What it does not mean: that USPTO PTAB tracking works with zero key. In every case, the key belongs to you, is billed (if at all - both tiers used here are free registrations) directly by USPTO/EPO to your own account, and is never logged, pooled, or persisted by this Actor beyond the run that used it.

## Quickstart

The Actor's real slug is `stefano_seggio/actor-21-patent-ip-enforcement-monitor` (Actor ID `fTvz8lwj3F1FrPQfM`, works interchangeably in all three clients below). Requires a free USPTO Open Data Portal API key (`https://data.uspto.gov/myodp`) for `uspto_ptab`, and/or a free EPO OPS Consumer Key/Secret (`developers.epo.org`) for `epo_opposition` - see Input below. Both are bring-your-own-key; this actor never creates those accounts on your behalf.

### cURL (instant, synchronous)

Runs synchronously and returns the resulting dataset items directly in the response - no polling needed. Get your token from [console.apify.com/settings/integrations](https://console.apify.com/settings/integrations).

```bash
curl -X POST "https://api.apify.com/v2/acts/fTvz8lwj3F1FrPQfM/run-sync-get-dataset-items?token=<YOUR_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
  "maxItemsPerSource": 30,
  "onlyNew": true
}'
```

### Python (`apify-client`)

```python
"""
pip install apify-client
"""

import os

from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_API_TOKEN"])

run_input = {
    "sources": ["uspto_ptab"],
    "usptoOdpApiKey": os.environ["USPTO_ODP_API_KEY"],
    "trialTypeCodes": ["IPR", "PGR"],
    "dateRange": "30d",
    "maxItemsPerSource": 100,
    "onlyNew": True,
}

run = client.actor("stefano_seggio/actor-21-patent-ip-enforcement-monitor").call(run_input=run_input)
items = list(client.dataset(run["defaultDatasetId"]).iterate_items())

for item in items:
    owner = item.get("recipient_or_defendant_name") or "(no owner)"
    print(f"[{item.get('event_type')}] {item.get('record_id')} - {owner}")
```

A full runnable copy lives at [`examples/run_patent_ip_enforcement_monitor.py`](./examples/run_patent_ip_enforcement_monitor.py).

### Node.js (`apify-client`)

```javascript
// npm install apify-client
const { ApifyClient } = require('apify-client');

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

const input = {
  sources: ['uspto_ptab'],
  usptoOdpApiKey: process.env.USPTO_ODP_API_KEY,
  trialTypeCodes: ['IPR', 'PGR'],
  dateRange: '30d',
  maxItemsPerSource: 100,
  onlyNew: true,
};

async function main() {
  const run = await client.actor('stefano_seggio/actor-21-patent-ip-enforcement-monitor').call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  for (const item of items) {
    console.log(`[${item.event_type}] ${item.record_id} - ${item.recipient_or_defendant_name ?? '(no owner)'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

A full runnable copy lives at [`examples/run-patent-ip-enforcement-monitor.js`](./examples/run-patent-ip-enforcement-monitor.js).

### Apify CLI

```bash
apify call stefano_seggio/actor-21-patent-ip-enforcement-monitor --input '{
  "sources": ["uspto_ptab"],
  "usptoOdpApiKey": "YOUR_USPTO_ODP_API_KEY",
  "trialTypeCodes": ["IPR", "PGR"],
  "dateRange": "30d",
  "maxItemsPerSource": 100,
  "onlyNew": true
}'
```

## Use this from Claude Desktop, Cursor, or Windsurf (via MCP)

This Actor is also reachable through Apify's own hosted `@apify/actors-mcp-server` at `https://mcp.apify.com`, scoped to just this one Actor via a `?tools=stefano_seggio/actor-21-patent-ip-enforcement-monitor` query string - your MCP client gets tool access to this Actor alone, not the rest of the fleet. Get your own token from [Apify Console → Settings → Integrations](https://console.apify.com/settings/integrations) first.

**Claude Desktop** (`claude_desktop_config.json`) - uses the `mcp-remote` stdio bridge, not a direct URL. Note: `mcp-remote` does not expand shell environment variables inside this JSON string, so paste your real token literally in place of `${APIFY_TOKEN}` below, and keep this file out of version control:

```json
{
  "mcpServers": {
    "delta-registry-actor-21-patent-ip-enforcement-monitor": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.apify.com/?tools=stefano_seggio/actor-21-patent-ip-enforcement-monitor",
        "--header",
        "Authorization: Bearer ${APIFY_TOKEN}"
      ]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json` or `~/.cursor/mcp.json`) - native HTTP transport:

```json
{
  "mcpServers": {
    "delta-registry-actor-21-patent-ip-enforcement-monitor": {
      "url": "https://mcp.apify.com/?tools=stefano_seggio/actor-21-patent-ip-enforcement-monitor",
      "headers": {
        "Authorization": "Bearer ${APIFY_TOKEN}"
      }
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`) - uses `serverUrl`, not `url`. Unlike Claude Desktop's `mcp-remote` bridge, Windsurf's `${env:...}` syntax genuinely resolves from your environment at runtime:

```json
{
  "mcpServers": {
    "delta-registry-actor-21-patent-ip-enforcement-monitor": {
      "serverUrl": "https://mcp.apify.com/?tools=stefano_seggio/actor-21-patent-ip-enforcement-monitor",
      "headers": {
        "Authorization": "Bearer ${env:APIFY_TOKEN}"
      }
    }
  }
}
```

Want every actor in the fleet available to one MCP client instead of just this one? See [`delta-registry-website/MCP_INTEGRATION.md`](https://github.com/stefanoseggio/delta-registry-website/blob/main/MCP_INTEGRATION.md) for the full 28-actor closed-scope config.

## Input & Output Schema

### Input

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

Full machine-readable definition: [`.actor/input_schema.json`](./.actor/input_schema.json).

### Sample Extracted Dataset (JSON)

One real record from this Actor's own dataset, matching [`.actor/dataset_schema.json`](./.actor/dataset_schema.json):

```json
{
  "source": "uspto_ptab",
  "trialNumber": "IPR2024-00123",
  "trialTypeCode": "IPR",
  "trialStatusCategory": "Instituted",
  "petitionFilingDate": "2024-01-15",
  "institutionDecisionDate": "2024-07-10",
  "patentNumber": "10123456",
  "patentOwnerName": "Acme Widgets Inc.",
  "petitionerRealPartyInInterestName": "Globex Corp",
  "record_id": "IPR2024-00123",
  "event_type": "SANCTION",
  "scraped_at": "2026-09-07T00:00:00.000Z",
  "is_new": true,
  "jurisdiction": "US"
}
```

### Output field reference

| Field | Type | Description |
|---|---|---|
| `source` | string | `uspto_ptab` or `epo_opposition`. |
| `trialNumber` | string \| null | PTAB trial docket number, e.g. `IPR2024-00123`. `uspto_ptab` only. |
| `trialTypeCode` | string \| null | `IPR` / `PGR` / `CBM` / `DER`. `uspto_ptab` only. |
| `trialStatusCategory` | string \| null | PTAB's own status category (e.g. `Instituted`). `uspto_ptab` only. |
| `petitionFilingDate` | string \| null | Date the petition was filed. `uspto_ptab` only. |
| `institutionDecisionDate` | string \| null | Date the trial was instituted, if applicable. `uspto_ptab` only. |
| `patentNumber` | string \| null | The challenged US patent number. `uspto_ptab` only. |
| `patentOwnerName` | string \| null | The patent owner named in the proceeding. `uspto_ptab` only. |
| `petitionerRealPartyInInterestName` | string \| null | The real party in interest bringing the petition. `uspto_ptab` only. |
| `record_id` | string | The `trialNumber` (`uspto_ptab`) or a composed `publicationNumber:eventCode:eventDate` key (`epo_opposition`) - stable across runs. |
| `event_type` | string | `SANCTION` (first seen), `UPDATED` (status/decision changed), `TERMINATED` (PTAB only - `terminationDate` newly set), or `SNAPSHOT_NO_DIFF` (unchanged, only emitted when `onlyNew` is off). |
| `scraped_at` | string | ISO-8601 timestamp of this extraction. |
| `is_new` | boolean | `true` if this record was not seen in a prior run. |
| `recipient_or_defendant_name` | string \| null | Fleet-standard envelope alias for the named party - mirrors `patentOwnerName` (`uspto_ptab`) or the equivalent EPO party where available. Used directly in the Python/Node.js examples above (`item.get('recipient_or_defendant_name')` / `item.recipient_or_defendant_name`). |
| `jurisdiction` | string | `US` (PTAB) or `EP` (EPO). |

`value_usd_normalized` and related value fields are always `null` for this actor's two sources - neither PTAB proceedings nor EPO opposition events carry a monetary amount, so this is left an honest null rather than a fabricated figure. EPO records instead populate `publicationNumber`/`eventCode`/`eventDescription`/`eventDate`/`eventCountry`. The full field list (all `uspto_ptab`-only and `epo_opposition`-only columns, plus the fleet-standard normalized envelope) is in [`.actor/dataset_schema.json`](./.actor/dataset_schema.json).

## Reliability

Every request goes through a single sequential fetch path (`src/http.ts`) with exponential backoff: HTTP `429` responses honor USPTO ODP's own documented minimum 5-second retry floor, `503` responses back off and respect a real `Retry-After` header when the server sends one, and permanent client errors (401/403/404, etc.) are not retried since retrying an unchanged request can only fail the same way again. Requests are issued one at a time, matching USPTO ODP's documented `burst=1` limit.

In delta mode (`onlyNew: true`), a status fingerprint per record is persisted in this actor's own named key-value store between runs (`src/state.ts`). For PTAB, the `terminationDate` field is tracked separately from the general fingerprint specifically so a null-to-set transition - the trial actually concluding - is reported as its own distinct `TERMINATED` event rather than folded into a generic `UPDATED`. A trial that is already terminated the first time it's seen is reported as a normal `SANCTION`, since there's nothing to transition from on a first sighting.

## Contributing & Local Setup

This repository ships the Actor's real, buildable TypeScript source (`src/`, `package.json`, `test/`) - local development against real logic is fully possible here:

```bash
git clone https://github.com/stefanoseggio/actor-21-patent-ip-enforcement-monitor.git
cd actor-21-patent-ip-enforcement-monitor
npm install
apify login              # once per machine
apify run                 # full local Actor run via the Apify CLI
```

You will need your own free USPTO ODP key and/or EPO OPS Consumer Key/Secret to exercise either source locally (see BYOK above) - set them as local environment variables or in your local Actor input, never committed to the repo.

Bugs, source-coverage requests, or proposed schema extensions are welcome via GitHub issues/PRs on this repository, or through the Apify Store's Issues tab on the [live Actor page](https://apify.com/stefano_seggio/actor-21-patent-ip-enforcement-monitor) for non-code questions.

## Support & Enterprise SLA

This is an independently developed and maintained actor, not a vendor product backed by a contractual SLA. Bug reports and feature requests are handled through the Apify Store's built-in issue tracker for this actor; issues are typically triaged within about 48 hours. Both data sources require your own registered API credentials (USPTO ODP key; EPO OPS Consumer Key/Secret) - this actor never attempts to create those accounts on your behalf, and credentials are never logged or persisted beyond the run that used them.

---

This Actor is part of **Delta Registry** — pay-per-event regulatory & compliance data infrastructure built and operated by Stefano Seggio. For professional inquiries or enterprise licensing, connect on [LinkedIn](https://www.linkedin.com/in/stefanoseggio-deltaregistry); for the rest of the fleet, see [github.com/stefanoseggio](https://github.com/stefanoseggio).
