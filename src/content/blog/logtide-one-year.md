---
title: "Logtide: 1 Year After the First Commit (The Real Numbers)"
description: "One year of Logtide: 2,000 commits, 50 releases, 1.0 shipped, three storage engines, a forced rebrand and a security audit. What worked and what didn't."
pubDate: 2026-11-02
author: "Giuseppe Pollio"
tags:
  - "open-source"
  - "build-in-public"
  - "logtide"
keywords:
  - "logtide one year"
  - "open source log management"
  - "open source datadog alternative"
  - "building in public"
  - "self hosted observability"
---

On November 26, 2025 I pushed a commit called "Initial Commit - LogWard v0.1.0 alpha". Four days later I published a post on dev.to titled *I built an Open Source Datadog alternative because ELK was eating my RAM*. It had a Docker Compose file, a SvelteKit 5 frontend, TimescaleDB instead of Elasticsearch, and Redis with BullMQ for the job queue.

That was a year ago. In January I wrote a 2-months post with every number I had, good and bad. This is the same exercise at twelve months. Same rule as last time: no bullshit, just numbers.

---

## The numbers

| | Launch (Nov 2025) | 2 months (Jan 2026) | 1 year (Nov 2026) |
| --- | --- | --- | --- |
| GitHub stars | 0 | 223 | 457 |
| Docker pulls (backend image) | 0 | 3,000+ | 47,000+ |
| Commits | 1 | n/a | 2,020 |
| Releases | 0.1.0 | 0.4.x | 50+, latest 1.6.0 |
| Issues opened | 0 | 27 | 103 |
| Merged PRs from other people | 0 | 1 | 17 |
| Storage engines | 1 | 1 | 3 |
| Official SDKs | 3 | 5 | 7 |

The stars curve flattened after the virtualizationhowto.com spike. The Docker pulls curve did not. Fifteen times more pulls with only twice the stars tells me what I suspected at two months: the people running Logtide are mostly not the people starring repos. They are self-hosters who pull an image, put it behind a reverse proxy, and never open an issue unless something breaks.

The commit count is mostly me. 1,982 of the 2,020 commits have my name on them. The remaining ones are small, but they are the ones I remember.

---

## The year in releases

A quick timeline, because a year of changelogs is long and nobody should read it.

- **January**: forced rebrand from LogWard to Logtide after a trademark conflict. 0.4.0 shipped the same week.
- **January / February**: 0.5.0 made Redis optional. 0.6.0 added PII masking at ingestion, and ClickHouse as a second storage engine.
- **February**: 0.7.0 added OTLP metrics, service maps and audit logs. Logs, traces and metrics in one place.
- **March**: 0.8.0 added MongoDB as a third storage engine, plus browser observability.
- **April**: 0.9.0 replaced the fixed dashboard with custom dashboards, added uptime monitoring with public status pages, and log parsing pipelines.
- **June**: 1.0.0. More on what that release actually was below.
- **July / August**: inbound webhook receivers, digest emails, error regression detection, geo map panels.
- **October**: 1.6.0, the biggest release of the year. A rebuilt UI, one query language that works on every storage engine, an incidents inbox, Slack, Teams and PagerDuty destinations, and an extension system.

---

## What I got wrong in the 2-months post

Re-reading the January post is a bit uncomfortable. A few things I wrote with confidence turned out to be wrong.

**"OpenTelemetry metrics: postponed indefinitely."** Only two users had asked for it, and I wrote that most people use Prometheus anyway. Six weeks later 0.7.0 shipped OTLP metrics. Logs, traces and metrics in one place turned out to matter more than a vote count in an issue tracker. The lesson I wrote at the time was "build what users request". It still holds, but it is not the whole picture.

**"TimescaleDB was the right choice."** It still is, as the default. But by March Logtide also ran on ClickHouse (0.6) and MongoDB (0.8), through a storage layer called reservoir. The cost was real: every query, every filter and every panel now has to behave identically on three engines. Getting that right took until 1.6.0, where the same search syntax finally parses to the same results everywhere.

**"Redis might be unnecessary. Next version might remove it."** This one I got right, mostly. Since 0.5.0 Redis is optional: without it, the job queue runs on PostgreSQL through graphile-worker. It is not removed: if you already run Redis, BullMQ is still there. Making a dependency optional turned out to be more useful than deleting it.

---

## What 1.0 actually was

At 0.9.0 I wrote that we were not jumping straight to a 1.0 declaration, because we wanted the announcement to mean something.

What it ended up meaning was a security audit. Before cutting 1.0, I went through every data access path in the backend looking for one specific thing: a query that could read another organization's data. I found some. The logs and traces query APIs accepted a `projectId` parameter and trusted it without checking that it belonged to the API key making the request. There were also tenant-table queries missing an organization filter, protected only by the route above them.

All of it was fixed in 1.0, along with a dedicated isolation test suite and CI checks so the same pattern fails the build if it comes back. PII masking also became fail-closed: before 1.0, if a masking rule threw, the batch was stored unmasked with a warning in the console. For a product whose whole pitch is GDPR, that was the worst possible failure mode.

Then, right after 1.0, a batch of issues was reported privately through coordinated disclosure by KIberblick.de, including a cross-tenant read on the dashboard endpoints and a stored XSS. Fixed in 1.0.3. I am genuinely grateful for that report. It is humbling to run an audit and then have someone else find what you missed a week later, but that is the system working.

The lesson I'd give anyone building a multi-tenant product solo: the hard part is not the features. It is making sure every single query is scoped, and keeping it that way while you ship features fast.

---

## What worked

**Shipping small and often.** 53 tags in a year is roughly one a week. Most were boring patch releases. Boring patch releases are what make people trust a project enough to upgrade it.

**Docker Compose as the main install path.** I said at two months that Docker Compose working in five minutes got more stars than any feature. That is still true. There is a Helm chart now, but the Compose file is what most people use.

**Writing about the technical decisions, not the product.** The most read posts I wrote this year were not the release announcements. *I Replaced Redis with PostgreSQL* got 340 reactions, the microservices math got 154. The average release post got around 15. People came for the Postgres opinions, and some of them found the log management along the way.

**SDKs in the languages people actually use.** Node.js, Python, PHP, Kotlin/Java, C#, Go and Ruby, plus Laravel, Symfony, Slim and WordPress integrations. The Kotlin SDK was a community contribution in the first two months, and I still think about that every time someone asks for a new language.

---

## What didn't

**The rebrand.** I covered it in January, but it is worth repeating because it is the cheapest lesson on this page: check the trademark before you name anything.

**Doing everything alone.** 98% of the commits are mine. That is fast, but it means every architectural mistake is mine too, and there is nobody to say "this is a bad idea" before it ships. The extension system in 1.6.0 is partly an answer to that: a way for people to build on Logtide without having to get a PR through me.

---

## Thank you

To everyone who opened an issue, especially the ones that started with "this is probably a dumb question" and were not. To the 17 merged pull requests that did not come from me. To the people who reported security issues privately instead of on Twitter. And to the self-hosters running Logtide somewhere I will never see, who never open an issue because nothing is broken. You are the reason the Docker pull counter keeps moving.

---

If you're using Logtide, I'd love to hear how. Open a discussion, open an issue, or drop a ⭐ if it has been useful.

- 🌐 **Cloud**: [logtide.dev](https://logtide.dev)
- 💻 **GitHub**: [logtide-dev/logtide](https://github.com/logtide-dev/logtide)
- 📖 **Docs**: [logtide.dev/docs](https://logtide.dev/docs)

*Here's to year two. 🌊*
