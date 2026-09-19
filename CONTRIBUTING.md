# Contributing

This repository ships the real, buildable TypeScript source for the **Patent & IP Enforcement Monitor - USPTO PTAB & EPO Opposition Tracker (Global IP Risk)** Apify Actor. It is independently maintained by Stefano Seggio as part of the [Delta Registry](https://github.com/stefanoseggio) fleet — there is no separate contributor team, but external bug reports, source-coverage proposals, and documentation fixes are welcome.

## Local setup

```bash
git clone https://github.com/stefanoseggio/actor-21-patent-ip-enforcement-monitor.git
cd actor-21-patent-ip-enforcement-monitor
npm install
apify login              # once per machine, needed only for `apify run`
```

Both sources are BYOK, and at least one is required to exercise real logic locally:

- `usptoOdpApiKey` — required for the `uspto_ptab` source. Free key from a USPTO.gov account (MFA required), obtained at [data.uspto.gov/apikey](https://data.uspto.gov/apikey).
- `epoOpsConsumerKey` + `epoOpsConsumerSecret` — required for the `epo_opposition` source. Free Consumer Key/Secret pair from a `developers.epo.org` account + registered App (OAuth2 client-credentials flow), plus an `epWatchlist` of EP publication numbers.

Set these as local environment variables or in your local Actor input — never commit a real key to the repo.

## Development workflow

```bash
npm run start:dev     # tsx src/main.ts, reads ./storage/key_value_stores/default/INPUT.json
npm run lint           # eslint
npm run lint:fix       # eslint --fix
npm run format         # prettier --write .
npm run build          # tsc
npm test               # vitest run
```

Local runs against `uspto_ptab` hit USPTO ODP's real API, which enforces a documented `burst=1` (one request at a time) limit and a minimum 5-second retry floor on 429s — keep `maxItemsPerSource` small while developing.

## Branch naming

- `fix/<short-description>` — bug fixes
- `feat/<short-description>` — new input fields, new output fields, new source coverage
- `docs/<short-description>` — README/documentation-only changes
- `chore/<short-description>` — dependency bumps, tooling, CI changes

## Commit convention

This repository follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short summary>

<optional body>
```

Types used here: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`. The `type` prefix drives automated changelog generation via `release-please` (see [`.github/workflows/release.yml`](.github/workflows/release.yml)) — a `feat:` commit triggers a minor version bump, `fix:` triggers a patch bump, and `feat!:`/a `BREAKING CHANGE:` footer triggers a major bump. Non-conventional commit messages are still accepted but won't be reflected in the auto-generated changelog entry for that change.

## Pull requests

1. Fork or branch, make your change, and ensure `npm run lint`, `npm run build`, and `npm test` all pass locally.
2. Open a PR against `main` using the repository's [PR template](.github/PULL_REQUEST_TEMPLATE.md).
3. CI (`.github/workflows/test.yaml`) runs automatically and must pass before merge.
4. Behavioral changes to the Actor's input/output schema should also update `.actor/input_schema.json` / `.actor/dataset_schema.json` and the corresponding README sections in the same PR — schema and documentation drift is treated as a real bug, not a follow-up.
5. Never commit a real `usptoOdpApiKey`, `epoOpsConsumerKey`, or `epoOpsConsumerSecret` value — use a placeholder in any example input committed to the repo.

## Questions or non-code issues

For questions that aren't a code change (pricing, licensing, enterprise inquiries), use the Apify Store's Issues tab on the [live Actor page](https://apify.com/stefano_seggio/actor-21-patent-ip-enforcement-monitor) rather than a GitHub issue.
