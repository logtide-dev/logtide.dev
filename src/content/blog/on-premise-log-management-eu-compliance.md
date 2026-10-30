---
title: "On-Premise Log Management for EU Compliance and Flat Pricing"
description: "Which on-prem log management tools keep EU log data local, and how their pricing behaves. GDPR, NIS2 and DORA logging duties, plus a comparison and checklist."
pubDate: 2026-10-30
author: "LogTide Team"
tags:
  - "compliance"
  - "gdpr"
  - "self-hosted"
keywords:
  - "on-premise log management"
  - "on-prem log management tools"
  - "log management eu data residency"
  - "gdpr log management"
  - "self-hosted log management flat pricing"
  - "nis2 logging requirements"
  - "dora log retention"
faqs:
  - question: "Are server logs personal data under GDPR?"
    answer: "Often yes. Article 4(1) defines personal data as any information relating to an identifiable person, and IP addresses, user IDs, email addresses and session identifiers all qualify when they can be tied to an individual. The CJEU held in Breyer (C-582/14) that even a dynamic IP address can be personal data when the provider has legal means to identify the person. Logs are therefore in scope for storage limitation, minimisation and security of processing."
  - question: "Does storing logs in an EU region of a US cloud provider satisfy data sovereignty?"
    answer: "It satisfies data residency, not necessarily sovereignty. Where the data sits and who can be compelled to hand it over are different questions. A provider that is subject to US jurisdiction can receive US legal demands under the CLOUD Act regardless of the region you pick. The EDPB and EDPS have said a foreign order alone is not a valid GDPR transfer basis, but the legal conflict remains for the provider, and you will need to assess it in your transfer impact assessment."
  - question: "What is the most predictable pricing model for log management?"
    answer: "Self-hosting on infrastructure you size yourself is the most predictable, because cost follows servers and storage, not event volume. Among hosted products, plans with a fixed monthly quota and no overage billing are next. Per-GB ingestion pricing is the least predictable, since one noisy deploy or a debug flag left on can multiply the invoice."
  - question: "How long do NIS2 and DORA require logs to be kept?"
    answer: "Neither sets a single universal number. DORA's RTS on ICT risk management (Delegated Regulation 2024/1774, Article 12) requires financial entities to define a retention period based on business and security objectives and their risk assessment, and to protect logs against tampering, deletion and unauthorised access. NIS2 Article 21 requires risk-management measures including incident handling, and national law and sector rules fill in the details. Set the period from your own risk assessment and document it."
  - question: "Can a self-hosted log tool still be a GDPR problem?"
    answer: "Yes. Self-hosting removes the third-party processor and the transfer question, but you are still the controller. You still need a retention limit, access control, a record of who searched the logs, a way to handle erasure requests, and masking so personal data does not land in logs in the first place."
---

A question we see in search and from teams evaluating tools goes roughly: *we are a European company that needs to store log data locally for compliance - which secure on-prem log management tools have flat-rate or predictable pricing?* It bundles three separate requirements: the data stays under your control, the tool has the controls an auditor will ask about, and the bill does not move with traffic.

This guide takes them in order, then compares the realistic options. It is technical guidance, not legal advice - your DPO or counsel decides what applies to you.

## Why logs are personal data

Application and access logs are the most common place where personal data accumulates unnoticed. Article 4(1) GDPR defines personal data as any information relating to an identified or identifiable person. In a typical log stream that covers:

- IP addresses (the CJEU held in *Breyer*, C-582/14, that even a dynamic IP can qualify when the operator has legal means to identify the person)
- user IDs, session IDs and device identifiers
- email addresses and names inside request bodies, query strings and exception messages
- free-text error messages that quote whatever the user typed

Once logs count as personal data, four GDPR provisions bite:

| Provision | What it asks | What it means for a log platform |
|---|---|---|
| Art. 5(1)(c) data minimisation | Only what is necessary | Don't log request bodies by default; mask at ingest |
| Art. 5(1)(e) storage limitation | Keep no longer than necessary | Enforced retention that actually deletes, per log type |
| Art. 5(1)(f) and Art. 32 security | Appropriate technical and organisational measures | Encryption, access control, auditability of who reads logs |
| Art. 44-49 (Chapter V) transfers | Restrictions on moving data outside the EEA | Know where logs are stored and which entities can access them |

If you use a hosted vendor, Art. 28 also applies: you need a processing agreement with them and with their sub-processors. We covered the implementation side of minimisation, pseudonymisation and erasure in [GDPR-compliant logging](/use-cases/gdpr-compliance/); this article is about choosing the platform.

## What NIS2 and DORA add

GDPR tells you to limit logging. NIS2 and DORA push the other way: you must log enough to detect and investigate incidents. The two fit together if you are deliberate about what you log and for how long.

**NIS2** (Directive (EU) 2022/2555) applies to "essential" and "important" entities in sectors such as energy, transport, health, digital infrastructure and ICT service management. Article 21(2) lists the minimum risk-management measures, including incident handling (point b). The directive does not name log management or a retention period. For certain digital infrastructure and ICT service providers (DNS, cloud, data centres, managed service providers and similar), Commission Implementing Regulation (EU) 2024/2690 is more specific and includes monitoring and logging procedures in its annex. Article 23 sets the reporting clock: an early warning within 24 hours of becoming aware of a significant incident and a notification within 72 hours - which you cannot meet without searchable logs.

On status: NIS2 had to be transposed by 17 October 2024, and member states have moved at different speeds. Trackers published in 2026 disagree on the exact count, with some member states still outstanding. Check your national law, not the directive alone.

**DORA** (Regulation (EU) 2022/2554) has applied to financial entities since 17 January 2025. The logging detail is in the ICT risk management RTS, Commission Delegated Regulation (EU) 2024/1774, Article 12. In short, entities must:

- define which events are logged (access control and identity, capacity, change management, ICT operations, network traffic)
- set a retention period taking into account business and security objectives and their risk assessment - no fixed number is prescribed
- protect logging systems and log data against tampering, deletion and unauthorised access, at rest and in transit
- detect failures of the logging system itself and keep clocks synchronised to a documented reference source

Neither regime tells you "keep logs for X years". Both tell you to decide, document, protect and be able to produce the evidence. That is a platform requirement as much as a policy one.

## Data residency is not data sovereignty

"EU region" on a pricing page answers where the bytes are stored. It does not answer who can be compelled to disclose them.

- **Residency** is physical location: the data sits in Frankfurt, Dublin or Paris.
- **Sovereignty** is legal control: which jurisdictions can require the operator to hand over or process the data.

A US-headquartered provider running an EU region is still subject to US legal process under the CLOUD Act, which can reach data in the provider's possession, custody or control wherever it is stored. The EDPB and EDPS said in their 2019 joint response on the CLOUD Act that a foreign court order alone does not make a transfer lawful under GDPR; an international agreement such as an MLAT is needed. That leaves the provider caught between two legal systems, and it leaves you with a risk to document.

Then there is the transfer mechanism for providers that do process data in the US. The EU-US Data Privacy Framework is currently in force. The General Court upheld it in *Latombe v Commission* (T-553/23, 3 September 2025), and an appeal to the Court of Justice (C-703/25 P) was still pending at the time of writing. Its predecessors, Safe Harbor and Privacy Shield, were both struck down, which is why many compliance teams plan for an exit rather than assume permanence.

Self-hosting on infrastructure operated by an EU entity removes most of this analysis. There is no third-party processor, no transfer, and no foreign parent. It is not magic - you still own the security - but the legal surface is smaller.

## What "secure on-prem log management" means in practice

"Secure" is vague until you map it to what an auditor or DPO will test. Here is the checklist we would use:

1. **Encryption in transit.** TLS on ingestion and on the UI/API, usually terminated at a reverse proxy you control.
2. **Encryption at rest.** Almost always done at the disk or database layer (LUKS, encrypted volumes, database-level encryption). Check whether the tool does it or expects you to.
3. **Role-based access control.** Not everyone who can see error rates should see raw request payloads. Per-project or per-organisation scoping matters in multi-team setups.
4. **An audit trail of who searched the logs.** Logs are sensitive data, so access to them needs its own record. Many tools log admin changes but not reads.
5. **PII masking at ingest.** Redact or hash emails, card numbers and tokens before they are written to storage. Masking after the fact does not undo what is already on disk and in backups.
6. **Enforced retention.** A retention setting that really deletes, with the ability to set different periods for different data.
7. **Integrity.** Append-oriented storage, restricted deletion rights and a log of deletions. True write-once (WORM) storage is a separate infrastructure decision (object lock, immutable snapshots), and few log tools provide it themselves.
8. **Alerting on the logging system itself.** DORA's RTS explicitly expects detection of logging failures.

## Why per-GB pricing is unpredictable

The question asks for "flat-rate or predictable pricing", and the reason it comes up is that the dominant SaaS model makes cost a function of something you don't directly control.

| Model | Cost driver | Failure mode |
|---|---|---|
| Per GB ingested | Log volume | A debug flag, a retry storm or an attack doubles the bill; teams respond by dropping logs, which hurts compliance |
| Per host / per node | Infrastructure count | Autoscaling and ephemeral containers inflate the host count |
| Per user | Seats | People who only need occasional access get left out, or access is shared |
| Per GB scanned (queries) | Search behaviour | Incident investigation is the most expensive time to search |
| Flat licence or self-hosted | Infrastructure you size | Capacity planning is on you; cost is steady until you outgrow the hardware |

The compliance angle makes per-GB worse: retention and volume are linked, so a longer retention period directly raises the cost, and the cheapest way to cut the invoice is to log less. For regulated teams that is the wrong incentive.

With self-hosting, the cost is servers, storage and the engineering time to run them. It scales with disk and CPU, which you can forecast, and not with how chatty a service was last Tuesday. The trade-off is real: you need someone to patch, back up and capacity-plan it.

If you would rather not operate it, the next best option is a hosted plan with a fixed quota and no overage billing. [LogTide Cloud](/pricing/) works that way (Free 10 GB/month, Pro $29/month for 100 GB, Pro Plus $99/month for 400 GB, unlimited users, ingestion pauses at the quota instead of billing extra), but be clear about what it is: a hosted service, not on-prem. If strict local storage is the requirement, self-host.

## Comparing on-prem options

This table covers tools commonly shortlisted for self-hosted log storage. Licences and pricing change; confirm with each vendor before you decide.

| Tool | Runs on-prem | Licence | Pricing model | Compliance-relevant features |
|---|---|---|---|---|
| **LogTide** | Yes (Docker Compose; TimescaleDB or ClickHouse storage) | AGPLv3 | Free self-hosted; cost is your infrastructure | PII masking at ingest (mask, redact, hash), log-access audit trail, RBAC, org retention policy, built-in Sigma-based SIEM |
| **Graylog** | Yes (needs OpenSearch and MongoDB) | Graylog Open: SSPL; Enterprise: commercial | Open edition free; Enterprise and Security tiers licensed, typically by data volume | Pipelines and streams for routing; archiving, audit log and reporting are Enterprise features - check which tier you need |
| **Elasticsearch / Kibana** (ELK) | Yes | SSPL, Elastic License 2.0, or AGPLv3 (added August 2024) | Free self-managed tier; paid subscriptions unlock advanced security (e.g. field-level security, audit logging) | Mature ecosystem; compliance features depend on the subscription |
| **OpenSearch** | Yes | Apache 2.0 | Free; you run it | Security plugin includes RBAC and audit logging; you assemble ingestion and UI |
| **Grafana Loki** | Yes | AGPLv3 | Free self-hosted; Grafana Enterprise is paid | Cheap storage via label-indexed design; masking and access auditing mostly DIY |
| **Wazuh** | Yes | GPLv2 | Free; paid support and cloud | Security-focused (FIM, detection, compliance dashboards); a SIEM/XDR rather than a general application log store |
| **Splunk Enterprise** | Yes | Proprietary | Commercial, quote-based; historically volume-based | Extensive audit and RBAC features; usually the most expensive option |

How to read it:

- **If you need a general-purpose log store with minimal assembly**, LogTide, Graylog or an OpenSearch/Elastic stack are the realistic candidates. LogTide and OpenSearch have no licence fee; the cost differences are in operations. See [LogTide vs Graylog](/vs/graylog/) for a deeper comparison.
- **If your priority is security monitoring on servers and endpoints**, Wazuh is built for that, and many teams run it next to a log store.
- **If budget certainty matters most**, the permissive or copyleft-licensed options with no volume term (LogTide, OpenSearch, Loki, Wazuh) beat anything priced per GB. Splunk's economics are covered in [LogTide vs Splunk](/vs/splunk/).
- **Mind the licence.** SSPL and AGPL both have obligations if you modify the software and offer it as a service to others. Internal use is normally unproblematic, but have your legal team read the text.

On LogTide specifically, so you can check our claims against the code: PII masking supports mask, redact and hash actions, runs on ingest and fails closed (a record that cannot be masked is not stored). The audit log records log searches, log views, streaming and exports as well as configuration and user-management changes. Retention is configured per organisation between 1 and 365 days, with a separate retention setting for the audit log. That 365-day ceiling matters: if your policy requires multi-year retention of certain logs, you need to export to cold storage (see the [compliance audit trail guide](/use-cases/compliance-audit-trail/)). Encryption at rest is a property of the disks and database you deploy on, and TLS is terminated at your reverse proxy. The setup is described on the [self-hosted log management](/self-hosted-log-management/) page.

## Selection checklist

Use this when shortlisting tools or reviewing an existing one:

- [ ] Data stays on infrastructure operated by an entity under EU jurisdiction, and you can say which one
- [ ] No third-party processor or sub-processor receives log content, or each has an Art. 28 agreement
- [ ] You have classified what personal data is in logs and have a documented lawful basis and purpose
- [ ] PII masking or hashing happens at ingest, with rules you control
- [ ] Retention is enforced per log type, and deletion is verified, not just configured
- [ ] Retention periods are written down with a justification (GDPR storage limitation, DORA Art. 12 RTS, sector rules)
- [ ] RBAC limits who can see raw payloads
- [ ] Searches, exports and deletions are recorded in an audit trail
- [ ] TLS in transit and encryption at rest are in place, and the key custody is clear
- [ ] Log integrity is addressed (restricted deletion, backups, optionally immutable storage)
- [ ] You alert when ingestion stops or the logging pipeline fails
- [ ] Pricing does not rise with log volume, or the exposure is capped and understood
- [ ] You can meet the 24-hour and 72-hour NIS2 reporting windows with searchable evidence, if NIS2 applies
- [ ] A named owner will patch, back up and capacity-plan the system

---

**Related guides:**

- [GDPR-compliant logging](/use-cases/gdpr-compliance/) - pseudonymisation, retention and erasure in application code
- [Self-hosted log management](/self-hosted-log-management/) - running LogTide on your own infrastructure
- [Compliance audit trails](/use-cases/compliance-audit-trail/) - audit events, evidence and retention for SOC2 and ISO 27001
- [LogTide vs Graylog](/vs/graylog/) and [LogTide vs Splunk](/vs/splunk/) - feature and cost comparisons
