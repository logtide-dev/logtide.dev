---
title: "Google Cloud Logging Pricing Explained: What You Actually Pay"
description: "Google Cloud Logging pricing in plain numbers - ingestion, the 50 GiB free tier, retention, Log Analytics, sinks, live tail limits and worked cost examples."
pubDate: 2026-10-30
author: "LogTide Team"
tags:
  - "gcp"
  - "logging"
  - "cost-optimization"
keywords:
  - "google cloud logging pricing"
  - "gcp cloud logging pricing"
  - "gcp logging pricing"
  - "gcp log pricing"
  - "cloud logging real-time streaming tail logs api"
  - "reduce cloud logging costs"
faqs:
  - question: "How much does Google Cloud Logging cost?"
    answer: "Ingestion costs $0.50 per GiB, and the first 50 GiB per project per month is free. That price includes 30 days of storage in a log bucket. Retention beyond 30 days costs $0.01 per GiB per month. Log Router and Log Analytics have no additional charge. Prices as of October 2026, from the official Google Cloud Observability pricing page."
  - question: "Is Google Cloud Logging free?"
    answer: "Partly. The first 50 GiB of ingestion per project per month is free, and logs in the _Required bucket (Admin Activity and System Event audit logs) are never charged for ingestion or retention. Everything above 50 GiB in the _Default bucket and in custom buckets is billed at $0.50 per GiB. The free allotment is per project, not per billing account."
  - question: "How long does Cloud Logging keep logs, and what does longer retention cost?"
    answer: "The _Default bucket keeps logs for 30 days unless you change it, and the _Required bucket keeps audit logs for a fixed 400 days. Custom retention on other buckets is billed at $0.01 per GiB per month for data held longer than 30 days. Logs kept for the default retention period carry no retention charge."
  - question: "How do I tail logs in real time with the Cloud Logging API?"
    answer: "Use live tailing: the entries.tail API method, or gcloud beta logging tail from the CLI. Google documents two fixed limits that cannot be raised: 10 open live-tailing sessions per project and 60,000 entries returned per minute. If your filter matches more than that, the tail cannot keep up, so narrow the filter by resource and severity."
  - question: "Do log sinks and the Log Router cost extra?"
    answer: "Routing itself is free, but the destination bills you normally: BigQuery storage, Cloud Storage storage, Pub/Sub throughput. Entries are also still ingested into _Default (and billed) unless you add an exclusion filter to that sink. A sink does not remove the ingestion charge on its own."
---

Cloud Logging pricing looks simple: $0.50 per GiB after a free tier. The bill gets surprising because of what counts as a GiB (every GKE container line, every load balancer request, Data Access audit logs) and because several things that sound free are only free at the Google end - the destination you route to still charges.

This guide lays out exactly what Google bills, shows the math at three volumes, and lists the levers that cut the number. All prices are as of October 2026 and come from the official [Google Cloud Observability pricing page](https://cloud.google.com/stackdriver/pricing). Check it before budgeting, since rates change.

## What Cloud Logging bills

| Item | Price | Notes |
|---|---|---|
| Log ingestion | $0.50 per GiB | One-time charge when logs are stored in a log bucket. Includes 30 days of storage and unlimited querying |
| Free allotment | First 50 GiB per project per month | Per project, resets monthly |
| Retention beyond 30 days | $0.01 per GiB per month | Billed monthly according to retention. Default retention costs nothing extra |
| Vended network logs | $0.25 per GiB | Network telemetry logs (VPC flow-style), since October 2024 |
| Log Router (sinks) | No additional charge | Destination storage charges still apply |
| Log Analytics | No additional charge | No cost to upgrade a bucket or run SQL from the Log Analytics page |
| `_Required` bucket | Free | Admin Activity and System Event audit logs, fixed 400-day retention |
| User-defined logs-based metrics | Billed as Cloud Monitoring custom metrics | System-defined logs-based metrics are free |

The key mental model: **you pay once, at ingestion, per GiB written into a log bucket.** Queries in Logs Explorer are not metered per scan the way CloudWatch Logs Insights is. The main cost is volume.

### Buckets and retention

Every project starts with two buckets:

- **`_Required`**: Admin Activity, System Event and Access Transparency audit logs. 400 days, not configurable, not charged.
- **`_Default`**: everything else. 30 days by default, configurable. This is where your application, GKE and load balancer logs land, and where the $0.50 per GiB applies.

You can create custom buckets with their own retention, in a chosen region. Retention under 30 days saves nothing on ingestion (you already paid it); retention over 30 days adds $0.01 per GiB per month.

### Log Analytics

Log Analytics upgrades a bucket so you can query it with SQL and optionally link it to BigQuery. Google lists no additional charge for the upgrade or for SQL queries issued from the Log Analytics page. Costs appear when you query the linked dataset from BigQuery itself, where normal BigQuery pricing applies.

### Logs-based metrics

System-defined logs-based metrics are free. User-defined ones are Cloud Monitoring custom metrics and are billed there, by bytes ingested. A handful of counter metrics is negligible. A distribution metric with high-cardinality labels is not.

## How routing affects the bill

```d2
direction: right
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

app: "GKE, Cloud Run,\nLB, audit" { class: src }
api: "Logging API\n(write quota applies)" { class: hub }
req: "_Required bucket\nfree, 400 days" { class: dest }
def: "_Default bucket\n0.50 USD/GiB after 50 free" { class: src }
bq: "BigQuery / GCS / Pub/Sub\ndestination rates" { class: dest }

app -> api { class: flow }
api -> req { class: flow }
api -> def { class: flow }
api -> bq: "sink, no router fee" { class: flow }
```

Three details trip people up:

1. **Exclusion filters apply after the Logging API receives the entry.** They stop the entry from being stored and billed in that bucket, but they do not reduce your Logging API write quota usage.
2. **A sink does not replace ingestion.** If you add a sink to BigQuery and leave `_Default` alone, the same entry is stored in both and you pay both. To export without paying `$0.50` for the copy in `_Default`, add an exclusion filter to the `_Default` sink.
3. **Destination charges are real.** BigQuery storage and queries, Cloud Storage data storage and Pub/Sub throughput all bill at their own rates. Exports to Cloud Storage skip Class A operation charges, but you still pay for storage.

## Worked examples

Assumptions: one project, all logs go to `_Default`, 30-day retention, ingestion price $0.50 per GiB, 50 GiB free. One TiB is 1,024 GiB.

| Monthly volume | Billable GiB | Math | Ingestion cost |
|---|---|---|---|
| 50 GiB | 0 | 50 - 50 = 0 | **$0** |
| 500 GiB | 450 | 450 x $0.50 | **$225** |
| 5 TiB (5,120 GiB) | 5,070 | 5,070 x $0.50 | **$2,535** |

Now add 90-day retention on the same data. Roughly two extra months of data sit beyond the free 30 days, so extra storage is about 2 x monthly volume per month:

| Monthly volume | Extra stored GiB (about) | Math | Retention add-on |
|---|---|---|---|
| 500 GiB | 1,000 | 1,000 x $0.01 | about $10 per month |
| 5 TiB | 10,240 | 10,240 x $0.01 | about $102 per month |

Two conclusions. First, **retention is cheap compared to ingestion**: ninety days of storage costs 4% of the ingestion bill at 500 GiB. Second, **volume is the lever**. Cutting 40% of noisy volume saves far more than shortening retention.

Multiple projects change the picture in your favor: each project gets its own 50 GiB. A company running 20 small projects can have a lot of free ingestion, which also hides which projects are expensive. Look at the per-project breakdown in Billing before assuming one number.

## Live tail and the streaming API

If you searched for "cloud logging real-time streaming tail logs api": Cloud Logging has live tailing through the `entries.tail` API method, `gcloud beta logging tail`, and the Logs Explorer "Stream logs" button. Google documents two limits for it, and both are fixed:

- **10 open live-tailing sessions per Google Cloud project.**
- **60,000 entries returned per minute.**

Live tailing has no separate fee, but at 60,000 entries per minute (1,000 per second) a busy GKE cluster can exceed the cap with a broad filter, and the tail cannot show everything. Filter by `resource.type`, `resource.labels` and `severity` before you tail. For a firehose of everything, route to Pub/Sub and consume from there instead of tailing the API.

## Cutting the bill

In rough order of impact:

1. **Exclusion filters on `_Default`.** Drop what you never read: load balancer health checks, GKE system namespaces you do not debug, `DEBUG` severity in production. Exclusion is the only lever that stops the per-GiB charge for those entries.

   ```
   resource.type="k8s_container"
   severity<WARNING
   resource.labels.namespace_name=("kube-system" OR "gke-managed-system")
   ```

2. **Sample high-volume info logs.** Exclusion filters accept `sample(insertId, 0.1)`, which keeps roughly 10% of matching entries. Good for access logs where you want trends, not every line.
3. **Fix log levels at the source.** A service logging `INFO` per request at 2,000 requests per second produces gigabytes a day. Make level a runtime setting, and stop logging full request and response bodies.
4. **Route cold data elsewhere.** If you keep logs for compliance rather than search, send them to Cloud Storage through a sink and exclude them from `_Default`. Storage rates beat the $0.50 per GiB ingestion rate for data nobody queries.
5. **Right-size retention.** Keep 30 days for most buckets, and extend only the bucket that needs it (for example, security logs in a custom bucket).
6. **Split buckets by value.** One bucket for production app logs, one for noisy infrastructure logs. This lets you apply different retention and different exclusions.

## Common surprises

- **Load balancer request logs.** Enabled per backend service, one entry per request. A service at 300 requests per second produces about 26 million entries a day. Check the sampling rate on each backend service and lower it (for example to 0.05) where full fidelity is not needed.
- **GKE.** Container stdout/stderr is collected by default for every namespace, including system ones. A single verbose sidecar can account for most of a project's ingestion.
- **Data Access audit logs.** Disabled by default for almost every service, except BigQuery, where they cannot be disabled. When enabled they can be very large, and Google warns that enabling them may result in additional charges. Admin Activity logs are the free ones.
- **Vended network logs.** They have their own $0.25 per GiB rate and can quietly dwarf application logs on busy VPCs.
- **Debug logging left on after an incident.** The classic. Alert on ingestion bytes per project with a Cloud Monitoring alert on `logging.googleapis.com/billing/bytes_ingested`.
- **Per-project free tier looks like it covers you** until one project, usually the shared GKE one, holds all the volume.

To find the offenders, open Logs Explorer's "Log Analytics" view or the Logs Storage page and group by `resource.type`, `log_name` and namespace. Usually three sources make up 80% of volume.

## When self-hosting makes sense

Cloud Logging is the right default when you run on GCP, stay near the free tier, and want zero setup: GKE, Cloud Run and audit logs arrive without an agent, and the Log Router is genuinely useful. Do not self-host to save $225 a month.

The picture changes when:

- Volume is in the multi-TiB range and the per-GiB rate is the largest log-related line on your bill.
- You run across several clouds or on-premises and want one place to search.
- You need data residency or retention beyond what you want to pay for per GiB.
- You need security detection (Sigma rules, MITRE ATT&CK mapping) alongside logs, which Cloud Logging does not include.
- You want to keep Cloud Logging as the collector but own the data: a Pub/Sub sink can feed a self-hosted store, and an exclusion filter on `_Default` removes the per-GiB charge for what you forward.

Self-hosting is not free: you pay for compute, disk, upgrades and on-call. [LogTide](/vs/gcp-cloud-logging/) is open-source (AGPLv3) and self-hostable, with no per-GiB ingestion fee, and there is a managed [LogTide Cloud](/pricing/) option with fixed plans if you want to skip running it. The [cloud logging pricing comparison](/cloud-logging-pricing/) puts Google, AWS and Azure rates side by side, and the [cost optimization use case](/use-cases/cost-optimization/) covers the self-hosted side in more detail. For Cloud Run specifically, see the [Cloud Run integration](/integrations/gcp-cloud-run/).

## Checklist

- [ ] Per-project ingestion reviewed in Billing, grouped by project and log name
- [ ] Exclusion filters on `_Default` for health checks, system namespaces and `DEBUG`
- [ ] Load balancer log sampling set deliberately
- [ ] Data Access audit logs enabled only where needed
- [ ] Retention set per bucket, with extended retention only where required
- [ ] Sinks to BigQuery, GCS or Pub/Sub paired with an exclusion on `_Default`
- [ ] Alert on `bytes_ingested` per project
- [ ] Live tail filters narrow enough to stay under 60,000 entries per minute

---

**Related guides:**

- [LogTide vs Google Cloud Logging](/vs/gcp-cloud-logging/) - feature and cost comparison
- [Cloud logging pricing compared](/cloud-logging-pricing/) - CloudWatch, Google Cloud Logging and Azure Monitor side by side
- [Cost optimization with LogTide](/use-cases/cost-optimization/) - self-hosted cost model
- [Google Cloud Run logging integration](/integrations/gcp-cloud-run/) - SDK and Fluent Bit setup
