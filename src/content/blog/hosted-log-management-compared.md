---
title: "Hosted Log Management Compared: Pricing, Retention and EU Data"
description: "Hosted log services compared at 100 GB and 400 GB a month: Better Stack (Logtail), Datadog, Grafana Cloud, New Relic, Axiom, Papertrail and LogTide Cloud."
pubDate: 2026-11-04
author: "LogTide Team"
tags:
  - "logging"
  - "cost-optimization"
  - "comparison"
keywords:
  - "hosted logs"
  - "hosted logging"
  - "hosted log management"
  - "log hosting"
  - "hosted log management pricing"
  - "logtail alternative"
  - "papertrail alternative"
  - "eu hosted log management"
faqs:
  - question: "What is hosted log management?"
    answer: "It is a service that receives, stores and indexes your logs on the vendor's infrastructure, so you get search, live tail and alerts without running a cluster. You send logs with an agent, an SDK or syslog, and you pay by volume, by retention, or with a fixed plan. The trade-off is that your logs live with a third party, which matters for cost at scale and for GDPR."
  - question: "What is the cheapest hosted log management service?"
    answer: "For logs alone at 100 GB to 400 GB a month with about 30 days of retention, Better Stack in its EU region and Axiom have the lowest list prices we found, as of November 2026: roughly $15 to $60 a month on Better Stack and from $25 a month on Axiom. New Relic's 100 GB free tier is hard to beat if you stay inside it. Check your own event size and query habits, because they can change the ranking."
  - question: "Is Logtail the same as Better Stack?"
    answer: "Yes. Logtail is now the logs product inside Better Stack, which also bundles uptime monitoring, status pages and incident management. Pricing is listed by region: in Europe, $0.10 per GB ingested and $0.05 per GB per month retained, with a free tier of 3 GB a month and 3 days of retention."
  - question: "Which hosted log services offer an EU data region?"
    answer: "Better Stack (Europe), Datadog (EU1, Germany), Grafana Cloud (Germany, Ireland, Sweden, Belgium and the Netherlands), Axiom (EU Central 1 on AWS) and New Relic (EU data center, $0.05 per GB extra) all list one. LogTide Cloud stores log data with OVH in Strasbourg, France. Papertrail's documentation does not name the region of its default storage, so ask before you rely on it."
  - question: "Does an EU region make a log service GDPR compliant?"
    answer: "Not by itself. A region answers where the data sits. You also need a data processing agreement, a list of sub-processors, retention that really deletes, and an assessment of which legal entity can be compelled to hand data over. Some parts of a service, such as account management, can run outside the EU even when log data stays inside it."
  - question: "What happens when I exceed my log quota on a hosted service?"
    answer: "It depends on the vendor. Pay-as-you-go services simply bill more. Datadog charges 50% above the annual rate on volume over your commitment. Papertrail can either stop accepting logs or continue at a 30% higher per-GB price, up to 200% extra. LogTide Cloud gives paid plans a 10% margin, then pauses ingestion until the quota resets or you upgrade, and never charges an overage."
  - question: "Should I choose hosted or self-hosted logging?"
    answer: "Choose hosted when nobody on your team wants to own upgrades, backups and capacity for a logging stack, and your volume is low enough that the bill stays reasonable. Self-host when you need the data on your own infrastructure, need long retention at high volume, or are already paying more than a server and a few hours of maintenance would cost."
---

If you search for hosted logs, most results are lists of twenty tools with a paragraph each and no numbers. This guide compares seven services that will take your logs today and works out what each one costs at two real volumes: 100 GB and 400 GB a month.

We sell one of the seven, [LogTide Cloud](/pricing/), so read this with that in mind. It is not the cheapest option in the table below, and we say where the others are a better fit.

All prices are public list prices in USD, excluding tax, taken from each vendor's pricing page in November 2026. They change often, so check the linked pages before you sign anything.

## What you are actually buying

A hosted log service takes three jobs off your plate: accepting logs reliably, storing them, and making them searchable. You point an agent, an SDK or syslog at an endpoint and the rest is the vendor's problem.

That puts it between two other options. The logging built into your cloud (CloudWatch, Google Cloud Logging, Azure Monitor) needs no setup, but it is tied to one provider and meters ingestion, storage and often queries separately. We cover those in [cloud logging pricing](/cloud-logging-pricing/). Running your own stack gives you full control, and the operations work that comes with it. That is the [self-hosted route](/self-hosted-log-management/).

## The options at a glance

| Service | Free tier | Paid model | Retention | EU data region | Users |
|---|---|---|---|---|---|
| [Better Stack](https://betterstack.com/pricing) (Logtail) | 3 GB/month, 3 days | $0.10/GB ingested + $0.05/GB/month retained (Europe) | Billed per GB stored | Europe | Telemetry access free, Responder seats $34/month |
| [Datadog](https://www.datadoghq.com/pricing/?product=log-management) | None listed on the logs pricing | $0.10/GB ingested + $1.70 per million events indexed (annual, 15-day retention) | Priced by retention period; Flex Logs for long retention | EU1, Germany | Not part of the logs list price |
| [Grafana Cloud](https://grafana.com/pricing/) | 50 GB/month, 14 days | $19/month, 50 GB included, then from $0.05/GB processed + $0.40/GB written | 30 days included, each extra 30 days from $0.10/GB | Germany, Ireland, Sweden, Belgium, Netherlands | 3 active users included, more are billed |
| [New Relic](https://newrelic.com/pricing) | 100 GB/month | $0.40/GB beyond the free 100 GB, $0.60/GB with Data Plus | 30 days by default for logs, 120 with Data Plus | EU data center, +$0.05/GB | 1 full user free, $10 for the first paid one, then $99 each (Standard); basic users free |
| [Axiom](https://axiom.co/pricing) | 500 GB/month loaded, 25 GB stored, 30 days | $25/month, includes 1 TB loaded, 100 GB compressed storage, 100 GB-hours of query compute | Configurable, billed on compressed storage | EU Central 1 (AWS) | No per-seat price listed |
| [Papertrail](https://www.papertrail.com/plans/) | Free trial only | Starts at $5/GB per month | Plan setting, typically 1 day to 1 month, plus 1 year of archives | Region of default storage not documented | Unlimited on the current offering |
| [LogTide Cloud](/pricing/) | 10 GB/month, 7 days | $29/month for 100 GB, $99/month for 400 GB, combined across logs, traces and metrics | 30 days on Pro, 90 on Pro Plus | OVH, Strasbourg, France | Unlimited |

## What it costs at 100 GB and 400 GB a month

To compare like with like, we assumed logs only, about 30 days of searchable retention, one engineer who needs full access, and an EU region where the price is public.

| Service | 100 GB/month | 400 GB/month | Notes |
|---|---|---|---|
| Better Stack (Europe) | $15 | $60 | Ingestion plus 30 days of stored volume. US region: $23 and $92 |
| Axiom | From $25 | From $25 | Both volumes fit in the included 1 TB. Query compute over 100 GB-hours, compressed storage over 100 GB and any EU edge add-on are extra |
| New Relic (EU) | $0 to $5 | $145 | 100 GB is inside the free tier; check whether the EU charge applies to it. 400 GB: 300 GB at $0.45 plus a $10 user |
| LogTide Cloud | $29 | $99 | Fixed price. The 400 GB plan keeps 90 days, not 30. Annual billing: $24 and $79 |
| Grafana Cloud (Pro) | About $42 to $44 | About $177 to $179 | $19 fee plus processing and writing above the included 50 GB. The range depends on how the included volume applies to processing |
| Datadog | $180 | $720 | Only 15 days of retention, at the annual rate, assuming 1 KB per event. On demand: $265 and $1,060 |
| Papertrail | About $500 | About $2,000 | At the listed starting rate. Larger plans may be priced differently, so ask for a quote |

Three things stand out. The spread is huge: more than 30 times between the lowest and highest list price at the same volume. The cheapest services are not the big names. And the price per GB says little until you know what the vendor counts as a GB.

## Five things that change the bill

**What is being counted.** Vendors do not measure the same thing. Datadog's largest cost is per event, not per GB, so at 500 bytes per event instead of 1 KB, the indexing part of that $180 doubles. Axiom bills storage on compressed data. LogTide Cloud measures each record as stored JSON before compression. Run a day of your real traffic through a trial before you trust any estimate, including ours.

**Retention.** Moving from 30 to 90 days can be free, cheap or a different product. On Better Stack it means paying for three times the stored volume. On Grafana Cloud, each extra 30-day increment is billed per GB. On Datadog, long retention usually means Flex Logs, which has its own storage and compute pricing. If compliance requires a year of logs, price that scenario first, because it can reorder the whole table.

**Query costs.** Most list prices assume ingestion is the main cost. Axiom bills query compute above its allowance, and Grafana Cloud bills queries above a fair use allowance. Think about the worst case: the bill for a week when several people run wide searches during an incident.

**What happens at the limit.** There are two honest designs, and each one hurts in a different way. Usage-based billing keeps your logs flowing during a traffic spike and surprises you with the invoice. Datadog charges 50% above the annual rate on volume over your commitment. A fixed quota protects the budget but can stop the logs. LogTide Cloud works this way: 10% margin on paid plans, then ingestion pauses until the quota resets or you upgrade. A runaway debug log during an incident can use that margin at the worst possible moment, so alert on usage well before the limit, whichever design you choose. Papertrail lets you pick: stop, or continue at a 30% higher price up to 200% extra.

**Who gets access.** Per-user pricing is easy to miss because it sits outside the logging line. On New Relic, a full platform user is $99 a month after the first on Standard, so giving five engineers full access adds real money at low volume. Better Stack charges for Responder seats if you use its incident management, while plain telemetry access is free.

## EU data: the region is only the first question

Five of these services let you pick a European region, and LogTide Cloud runs in one. Papertrail's documentation says it stores logs and archives in Amazon S3 but does not name the region of its default bucket, so ask before relying on it.

A region tells you where logs sit. It does not settle everything an auditor will ask:

- **What stays outside the region.** Axiom is clear about this in its [edge deployment docs](https://axiom.co/docs/reference/edge-deployments): event data stays in the EU for ingest, storage and queries, while account management runs on US infrastructure. That is a reasonable design, and it is the level of detail you should expect from any vendor.
- **Who the contract is with.** A provider subject to US jurisdiction can receive US legal demands under the CLOUD Act wherever the data is stored. We go through this in our [EU compliance guide](/blog/on-premise-log-management-eu-compliance/).
- **Who the sub-processors are.** Ask for the list. Ours is [public](/legal/subprocessors/): OVH for hosting, and Stripe for billing, which never receives log data.

## Which one fits

**Better Stack** is the one to beat on price for logs alone, and a good fit if you also want uptime monitoring and status pages from the same vendor. If you came here looking for Logtail, this is it now. See [LogTide vs Better Stack](/vs/better-stack/) for a closer look.

**Axiom** suits high volume with few queries, since 1 TB of ingest is included and storage is priced on compressed data. Model your query usage first, and confirm the price of EU storage for your account, because the add-on price is not on the public pricing page.

**Grafana Cloud** makes sense if your team already lives in Grafana and thinks in labels. Loki indexes labels rather than full content, so searching arbitrary text over long ranges is its weak spot. See [LogTide vs Grafana Loki](/vs/grafana-loki/).

**New Relic** is hard to argue with if you fit inside 100 GB a month and one full user, or if you want one platform for APM and logs. The cost shows up when you add people. See [LogTide vs New Relic](/vs/new-relic/).

**Datadog** is rarely the cheap choice for logs alone. It earns its price when you already use it for infrastructure and APM and want everything correlated in one place. See [LogTide vs Datadog](/vs/datadog/).

**Papertrail** remains one of the fastest ways to go from syslog to a live tail. It is expensive per GB, so it works best at small volumes where the bill stays small anyway. See [LogTide vs Papertrail](/vs/papertrail/).

**LogTide Cloud** is for teams that want a fixed monthly number, unlimited users, and detection in the same product: Sigma rules, incidents and MITRE ATT&CK mapping are in every plan, including Free. The same open-source core can be self-hosted if you later want to bring it in-house. The honest limits: it is a younger product with a smaller ecosystem than most of this table, retention above 90 days and volume above 400 GB need a custom plan, per-organization SSO is not available yet, and the quota pause described above is a real trade-off.

## How to test before you commit

A pricing page will not tell you how a service behaves with your data. Before you sign up for a year:

1. Send one full day of production logs to your top two candidates, in parallel if you can.
2. Compare the usage each vendor reports for that same day. The gap between them is often the most useful number you get.
3. Search for something real from your last incident, over the longest range you would need.
4. Trigger an alert and time how long it takes to reach you.
5. Read the overage rules, then check what happens at the limit in practice.
6. Get the data processing agreement and sub-processor list before you send any production data that contains personal information.

## When hosted is the wrong answer

Hosted stops making sense in a few cases: the data must stay on infrastructure you control, you need long retention at high volume, or the invoice has passed what a server and some maintenance time would cost. At that point, look at [running your own log server](/blog/self-hosted-centralized-logging-server/), or at [on-premise options for EU compliance](/blog/on-premise-log-management-eu-compliance/).

If you take one thing from this comparison, make it this: don't choose on price per GB. Work out your volume, your retention and how many people need access, then price all three.

---

**Related guides:**

- [LogTide Cloud pricing](/pricing/) - plans, quotas and what happens at the limit
- [Cloud logging pricing compared](/cloud-logging-pricing/) - CloudWatch, Google Cloud Logging and Azure Monitor side by side
- [How to set up a self-hosted centralized logging server](/blog/self-hosted-centralized-logging-server/) - architecture, sizing and a Docker Compose walkthrough
- [On-premise log management for EU compliance](/blog/on-premise-log-management-eu-compliance/) - GDPR, NIS2 and DORA logging duties
