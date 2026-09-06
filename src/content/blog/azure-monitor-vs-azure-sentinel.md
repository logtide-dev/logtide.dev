---
title: "Azure Monitor vs Azure Sentinel: What's the Difference?"
description: "Azure Monitor and Microsoft Sentinel overlap more than their names suggest. What each one does, how the pricing stacks, and when you actually need both."
pubDate: 2026-06-12
author: "LogTide Team"
tags:
  - "azure"
  - "siem"
  - "observability"
keywords:
  - "azure monitor vs azure sentinel"
  - "azure sentinel vs azure monitor"
  - "difference between azure monitor and sentinel"
  - "microsoft sentinel pricing"
  - "azure log analytics vs sentinel"
faqs:
  - question: "What is the difference between Azure Monitor and Azure Sentinel?"
    answer: "Azure Monitor is Microsoft's observability platform: it collects metrics and logs from Azure resources and applications for operational monitoring, dashboards, and alerts. Microsoft Sentinel is a cloud-native SIEM built on top of the same Log Analytics workspaces - it adds security analytics, detection rules, incident management, and automated response (SOAR). Monitor answers 'is my system healthy?'; Sentinel answers 'is my system under attack?'."
  - question: "Does Azure Sentinel replace Azure Monitor?"
    answer: "No. They are complementary, not alternatives. Sentinel consumes data from the same Log Analytics workspaces that Azure Monitor populates, then layers security detection on top. Most organizations running Sentinel still use Azure Monitor for operational alerting and application performance."
  - question: "How much does Microsoft Sentinel cost on top of Log Analytics?"
    answer: "Sentinel adds roughly $2.46/GB analyzed on top of Log Analytics ingestion (about $2.76/GB pay-as-you-go). Security-relevant data therefore costs around $5.22/GB ingested - before retention fees. Commitment tiers reduce both rates at volume."
  - question: "Is there a cheaper alternative to running Sentinel for log-based detection?"
    answer: "For log-based threat detection, self-hosted platforms like LogTide include SIEM capabilities - Sigma detection rules, MITRE ATT&CK mapping, incident management - without per-GB security surcharges. You pay infrastructure costs only, which at meaningful volume is typically 85-95% less than the Log Analytics + Sentinel combination."
---

Searches for "Azure Monitor vs Azure Sentinel" usually come from a reasonable confusion: both products ingest logs, both live in the Azure portal, both query with KQL, and both can fire alerts. Microsoft's renaming of Azure Sentinel to **Microsoft Sentinel** didn't help.

The short answer: **they're not competitors - Sentinel runs on top of Azure Monitor's data layer.** The real question is whether you need the security layer, and what that layer costs. Let's break it down.

## What Azure Monitor actually is

Azure Monitor is Microsoft's **observability platform** - the umbrella for everything operational:

- **Metrics**: near-real-time numeric telemetry from Azure resources (CPU, memory, request rates)
- **Logs**: resource logs, activity logs, and application logs collected into **Log Analytics workspaces**
- **Application Insights**: APM - distributed traces, dependency maps, performance profiling
- **Alerts & dashboards**: threshold and KQL-based alert rules, workbooks, Grafana integration

Its job is answering operational questions: *Is the service healthy? Why is p95 latency up? What did this pod log before it crashed?*

The data backbone is the **Log Analytics workspace**. This matters because everything else in this article - including Sentinel - sits on that same backbone.

## What Microsoft Sentinel actually is

Sentinel is a **cloud-native SIEM and SOAR** platform. You enable it *on* a Log Analytics workspace, and it adds a security layer over data that's already there (plus security-specific connectors for Microsoft 365, Entra ID, firewalls, and third-party sources):

- **Analytics rules**: scheduled KQL detections and Microsoft-curated threat rules
- **Incidents**: correlation of alerts into cases with owners, severity, and investigation graphs
- **SOAR playbooks**: automated response via Logic Apps (disable a user, isolate a VM, open a ticket)
- **UEBA & threat intelligence**: behavioral baselines and IOC matching
- **Content hub**: prebuilt detections and workbooks per data source

Its job is answering security questions: *Is someone brute-forcing our VPN? Did this service principal just do something it never does? Which machines talked to that C2 domain?*

## The relationship in one picture

```d2
direction: down
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  group: { style: { fill: "#ede9fe"; stroke: "#c4b5fd"; stroke-width: 2; font-color: "#3b0764"; border-radius: 10 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

azure: "Azure resources\napps, agents, App Insights" { class: src }
connectors: "M365 / Entra ID / firewalls\n(connectors)" { class: src }
law: "Log Analytics workspace\nshared data layer" { class: hub }
monitor: "Azure Monitor\nops alerts · dashboards · APM · autoscale" { class: src }
sentinel: "Microsoft Sentinel\ndetections · incidents · hunting · SOAR" { class: src }

azure -> law { class: flow }
connectors -> law { class: flow }
law -> monitor { class: flow }
law -> sentinel { class: flow }
```

Same data, two lenses. Which is exactly why the pricing model stings.

## Pricing: where the overlap gets expensive

Both products bill per GB on the **same ingested data**:

| Component | Cost (pay-as-you-go) |
|-----------|---------------------|
| Log Analytics ingestion | ~$2.76/GB |
| Microsoft Sentinel surcharge | ~$2.46/GB analyzed |
| **Security-relevant data, combined** | **~$5.22/GB** |
| Extra retention (beyond included) | ~$0.10/GB/month |

Commitment tiers discount both meters at volume (e.g. ~$1.96/GB for Log Analytics at 100 GB/day), but the structure stays the same: **security data is billed twice** - once to land in the workspace, once for Sentinel to analyze it.

A concrete example at 50 GB/day of security-relevant logs:

- Log Analytics: 1,500 GB × $1.96 (commitment) ≈ **$2,940/month**
- Sentinel: 1,500 GB × $2.46 ≈ **$3,690/month**
- **Total: ~$6,930/month (~$83,000/year)** before retention

For the full breakdown including the self-hosted comparison, see [LogTide vs Azure Monitor](/vs/azure-monitor/).

## So which one do you need?

**You need Azure Monitor** (or some observability stack) if you run anything on Azure, full stop. Operational telemetry isn't optional.

**You need Sentinel** if:

- You have a SOC team (or an MSSP) that will actually triage incidents and tune detections
- You're deep in the Microsoft security ecosystem (Defender, Entra ID, M365) - the native connectors and curated detections are genuinely good there
- Compliance requires a formal SIEM with incident management and audit trails

**You probably don't need Sentinel** if:

- Nobody would own the incident queue - an unwatched SIEM is an expensive log archive
- Your detection needs are log-based and rule-driven rather than UEBA/ML-driven
- The $2.46/GB surcharge forces you to *exclude* data sources from security analysis to control cost - which defeats the purpose

That last failure mode is common: teams route only a fraction of their logs into the Sentinel-enabled workspace to cap the bill, and attackers live in the logs that didn't make the cut.

## The third option: take log-based detection off the meter

If what you need is **detection on your logs** - failed logins, suspicious process activity, anomalous API usage, firewall events - rather than the full Microsoft security suite, a self-hosted platform changes the economics entirely.

[LogTide](/) includes SIEM capabilities in the box: [Sigma detection rules](https://sigmahq.io/) (the portable, community-driven detection standard), MITRE ATT&CK mapping, real-time alerting, and incident management - with **no per-GB surcharge**, because you run it on your own infrastructure. The same 50 GB/day scenario above runs on roughly **$400/month** of VM and storage, versus ~$6,930 for the Log Analytics + Sentinel pair - and you can afford to analyze *all* your logs, not just the ones that fit the budget.

It's not a full Sentinel replacement - there's no UEBA, no Logic Apps SOAR, no M365-native connectors. But for log-based detection with data sovereignty (your security telemetry never leaves your infrastructure), it covers what most teams outside a dedicated SOC actually use.

## Bottom line

| | Azure Monitor | Microsoft Sentinel | LogTide (self-hosted) |
|---|---|---|---|
| Category | Observability | SIEM / SOAR | Log management + SIEM |
| Primary question | Is it healthy? | Is it under attack? | Both, log-based |
| Data layer | Log Analytics | Log Analytics (same) | Your TimescaleDB/ClickHouse |
| Detection rules | KQL alerts (ops) | Analytics rules, UEBA, TI | Sigma rules, MITRE ATT&CK |
| Pricing | ~$2.76/GB | +$2.46/GB on top | Infrastructure only |
| Best for | Every Azure workload | Microsoft-centric SOCs | Cost-conscious, sovereignty-first teams |

Azure Monitor and Sentinel aren't an either/or - one is the data and ops layer, the other a security product on top of it. The decision that actually affects your budget is whether per-GB security pricing fits how much log data you want eyes on. If it doesn't, [self-hosted log management with built-in SIEM](/self-hosted-log-management/) is the lever that changes the equation.

---

**Related reading:**

- [LogTide vs Azure Monitor](/vs/azure-monitor/) - full feature and cost comparison
- [Cloud logging pricing breakdown](/cloud-logging-pricing/) - CloudWatch, GCP and Azure compared
- [Security monitoring use case](/use-cases/security-monitoring/) - Sigma rules and ATT&CK mapping in practice
