// run-patent-ip-enforcement-monitor.js
// npm install apify-client
const { ApifyClient } = require('apify-client');

// Reads your Apify API token from the environment — get one from
// https://console.apify.com/account/integrations. Never hardcode it.
const client = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

// Minimal realistic input matching the Actor's real input_schema.json.
// usptoOdpApiKey is required for the uspto_ptab source: this Actor is
// deliberately bring-your-own-key — register your own free USPTO Open Data
// Portal account at https://data.uspto.gov/myodp and use that key here.
const input = {
  sources: ['uspto_ptab'],
  usptoOdpApiKey: process.env.USPTO_ODP_API_KEY,
  trialTypeCodes: ['IPR', 'PGR'],
  dateRange: '30d',
  maxItemsPerSource: 100,
  onlyNew: true,
};

async function main() {
  // Call the Actor by its stable ID and wait for the run to finish.
  const run = await client.actor('fTvz8lwj3F1FrPQfM').call(input);

  console.log(`Run ${run.id} finished with status: ${run.status}`);

  // Pull every record the run wrote to its default dataset.
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  for (const item of items) {
    console.log(
      `[${item.event_type}] ${item.record_id} — ` +
      `${item.recipient_or_defendant_name ?? '(no owner)'} ` +
      `(${item.status_or_estado ?? 'UNKNOWN'}, ${item.jurisdiction})`
    );
  }

  console.log(`Total records: ${items.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
