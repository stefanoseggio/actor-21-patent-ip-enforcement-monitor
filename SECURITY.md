# Security Policy

## Supported versions

This Actor follows [semantic versioning](https://semver.org/) via automated release tagging (see [`.github/workflows/release.yml`](.github/workflows/release.yml)). Only the latest published major version receives security fixes — there is no long-term-support branch for older majors, consistent with this being a single-maintainer, independently-operated Actor rather than an enterprise product with a formal support matrix.

## Reporting a vulnerability

**Preferred: GitHub Private Vulnerability Reporting.** This repository has private vulnerability reporting enabled — go to the **Security** tab → **Report a vulnerability** to open a private advisory visible only to the maintainer until a fix is ready. This is the correct channel for anything that shouldn't be disclosed in a public issue (credential handling, injection risks, dependency CVEs affecting this Actor's real usage, etc.).

**Do not** open a public GitHub issue for a suspected security vulnerability — use private reporting instead so the disclosure stays coordinated.

## What's actually in scope

This Actor's real attack surface, honestly assessed:

- **Real, required BYOK credentials.** Unlike several sibling Delta Registry Actors, this one has genuine credential handling: `usptoOdpApiKey` is required to use the `uspto_ptab` source, and `epoOpsConsumerKey`/`epoOpsConsumerSecret` are required for `epo_opposition`. All three are marked as secret input fields in `.actor/input_schema.json`, are used only to call that office's own official API, and are never logged or persisted beyond the run that used them (see README's BYOK Disclosure and Support & Enterprise SLA sections). A leak or mishandling of any of these three fields would be a real, in-scope vulnerability.
- **No user-supplied code execution.** Input is a fixed JSON schema (`sources`, `trialTypeCodes`, `dateRange`, `maxItemsPerSource`, `onlyNew`, `epWatchlist`, plus the three credential fields above) validated against a real Zod schema (`src/schemas.ts`) — there is no arbitrary-code or arbitrary-URL execution surface.
- **Dependency vulnerabilities** in `package.json`'s real dependency tree (`apify`, `cheerio`, `zod`, `zod-to-json-schema`, and dev dependencies) are a real, ongoing concern. Live-verified 2026-09-18: weekly Dependabot version-update PRs (`.github/dependabot.yml`) are active, and GitHub secret scanning plus push protection are enabled on this repository. GitHub's separate Dependabot security-alert scanning (vulnerability alerts on known CVEs) is **not currently enabled** here — that's a real gap, not something this file should claim is already covered; enabling it is a one-click Settings → Security change Stefano can make directly.
- **Source-feed integrity** (a compromised or spoofed USPTO ODP or EPO OPS endpoint) is outside this Actor's control — it fetches from each office's own official, publicly documented URLs over HTTPS/OAuth2 and does not implement independent content-signing verification beyond standard TLS.

## Response expectations

This is an independently developed and maintained Actor with no contractual security SLA. In practice, security reports are typically triaged within 48 hours — the same disclosed norm as this Actor's general support triage (see the README's Support & Enterprise SLA section) — though there is no guaranteed fix timeline. Reports that turn out to be genuine, exploitable vulnerabilities will be credited in the fix's release notes unless the reporter requests otherwise.

## Enterprise / institutional customers

If your organization requires a signed security addendum, a formal disclosure SLA, or a security questionnaire completed as part of procurement, open an issue against this Actor's [Store page](https://apify.com/stefano_seggio/actor-21-patent-ip-enforcement-monitor) or connect via [LinkedIn](https://www.linkedin.com/in/stefanoseggio-deltaregistry) — these are handled case-by-case, not something this file can commit to on Stefano's behalf.
