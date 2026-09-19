"""
run_patent_ip_enforcement_monitor.py
pip install apify-client
"""

import os

from apify_client import ApifyClient

# Reads your Apify API token from the environment — get one from
# https://console.apify.com/account/integrations. Never hardcode it.
client = ApifyClient(os.environ["APIFY_API_TOKEN"])

# Minimal realistic input matching the Actor's real input_schema.json.
# usptoOdpApiKey is required for the uspto_ptab source: this Actor is
# deliberately bring-your-own-key — register your own free USPTO Open Data
# Portal account at https://data.uspto.gov/apikey and use that key here.
run_input = {
    "sources": ["uspto_ptab"],
    "usptoOdpApiKey": os.environ["USPTO_ODP_API_KEY"],
    "trialTypeCodes": ["IPR", "PGR"],
    "dateRange": "30d",
    "maxItemsPerSource": 100,
    "onlyNew": True,
}


def main() -> None:
    # Call the Actor by its stable ID and wait for the run to finish.
    run = client.actor("fTvz8lwj3F1FrPQfM").call(run_input=run_input)

    print(f"Run {run['id']} finished with status: {run['status']}")

    # Pull every record the run wrote to its default dataset.
    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())

    for item in items:
        owner = item.get("recipient_or_defendant_name") or "(no owner)"
        status = item.get("status_or_estado") or "UNKNOWN"
        print(
            f"[{item.get('event_type')}] {item.get('record_id')} — "
            f"{owner} ({status}, {item.get('jurisdiction')})"
        )

    print(f"Total records: {len(items)}")


if __name__ == "__main__":
    main()
