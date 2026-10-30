---
title: "How to Set Up a Self-Hosted Centralized Logging Server"
description: "Set up a self-hosted centralized logging server: architecture, collectors, backends compared, disk sizing, TLS, and a Docker Compose walkthrough."
pubDate: 2026-10-30
author: "LogTide Team"
tags:
  - "self-hosted"
  - "logging"
  - "infrastructure"
keywords:
  - "self hosted logging server"
  - "self hosted centralized logging"
  - "self hosted log aggregation"
  - "open source log collector"
  - "log server open source"
  - "self hosted onprem logging"
faqs:
  - question: "What do I need to run a self-hosted centralized logging server?"
    answer: "Four pieces: a collector or shipper on every host (Fluent Bit, Vector, the OpenTelemetry Collector, or rsyslog), an ingestion endpoint that authenticates and buffers incoming events, a storage backend that indexes or compresses them, and a search and alerting layer. Some products bundle the last three into one service; others make you assemble them. Add a reverse proxy for TLS and a disk budget based on daily volume times retention."
  - question: "What is the best open source log collector?"
    answer: "There is no single best one. Fluent Bit (Apache 2.0, C) has the smallest footprint and suits per-host agents and Kubernetes DaemonSets. Vector (MPL 2.0, Rust) has the most expressive transform language (VRL) and handles heavy parsing well. The OpenTelemetry Collector (Apache 2.0, Go) is the right choice if you also collect traces and metrics. rsyslog and syslog-ng are already installed on most Linux hosts and are fine when you only need to forward syslog."
  - question: "How much disk space does a log server need?"
    answer: "Multiply average event size by events per second by 86,400 to get raw GB per day, multiply by retention days, then divide by the compression ratio of your storage engine (columnar or compressed stores often reach 5-10x on text logs; Lucene-based indexes are usually close to 1x of raw size or more). Add 20-30% headroom for ingestion spikes and background merges. Measure with a week of real traffic before buying disks."
  - question: "Should I use UDP or TCP for syslog?"
    answer: "Use TCP, ideally with TLS, for anything you cannot afford to lose. UDP syslog is fire-and-forget: packets are silently dropped under load or network congestion, and a single message is limited by the datagram size. UDP is acceptable only for devices that cannot do anything else, such as some network gear, on a trusted local segment."
  - question: "Is a self-hosted logging server cheaper than SaaS?"
    answer: "Past a few GB a day, usually yes, because you pay for disks and a VM instead of per-GB ingestion and per-query scans. The trade is operations: you own upgrades, backups, capacity, and the on-call for the logging system itself. Run the numbers for your volume before deciding; our cloud logging pricing page has the per-GB rates of the main vendors."
---

Application logs written to local files are fine until you run more than a few hosts. Then an incident needs a grep across twelve machines, one of which has already rotated the file you need, and nobody can say who has access to what.

A centralized logging server fixes that by moving every log to one place with one query interface, one retention policy, and one access model. This guide covers how to build one on your own infrastructure: the moving parts, how to choose a collector and a backend, how to size disks, how to lock it down, and a working Docker Compose walkthrough. For the broader case for owning your log data, see our [self-hosted log management overview](/self-hosted-log-management/).

## The architecture: four stages

Every centralized logging setup, from a homelab to a datacenter, has the same four stages. Products differ in how many of them they bundle.

```d2
direction: right
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

hosts: "Hosts, containers, devices\nfiles / journald / syslog / OTLP" { class: src }
agent: "Collector / shipper\nparse, enrich, buffer to disk" { class: hub }
proxy: "Reverse proxy\nTLS termination" { class: dest }
ingest: "Ingestion endpoint\nauth, validate, queue" { class: hub }
store: "Storage\nindex or compress, retention" { class: src }
ui: "Search, live tail, alerts" { class: dest }

hosts -> agent { class: flow }
agent -> proxy: "HTTPS" { class: flow }
proxy -> ingest { class: flow }
ingest -> store { class: flow }
store -> ui { class: flow }
```

1. **Collection.** A small agent on each host reads files, journald, container output, or receives syslog and OTLP, then forwards. Its important jobs are not losing data when the network or backend is down (disk buffering) and attaching metadata (hostname, service, environment).
2. **Ingestion.** An endpoint that authenticates senders, validates payloads, and absorbs bursts. In Elasticsearch this is the HTTP API or Logstash; in Loki the distributor; in LogTide a Fastify API plus a Redis-backed queue and a worker.
3. **Storage.** Where the cost and the operational pain live. Full-text indexes (Lucene) are fast to search and expensive to store. Label-only indexes (Loki) are cheap to store and slower to search by content. Columnar or time-series stores (ClickHouse, TimescaleDB) compress well and query fields quickly.
4. **Search and alerting.** Querying, live tail, dashboards, and rules that notify you. Do not treat this as optional; a log server nobody can query at 3 a.m. is an archive.

## Choosing a collector

You can usually mix and match: the collector is not tied to the backend. All four options below speak HTTP, and most speak syslog.

| Collector | License | Language | Strengths | Weak spots |
|---|---|---|---|---|
| [Fluent Bit](https://fluentbit.io) | Apache 2.0 | C | Very small memory footprint, filesystem buffering, good Kubernetes support | Transform logic is limited (filters plus Lua), config is easy to get subtly wrong |
| [Vector](https://vector.dev) | MPL 2.0 | Rust | Powerful VRL transforms, strong performance, good unit-test tooling for pipelines | Larger binary and more memory than Fluent Bit, YAML/TOML pipelines grow quickly |
| [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) | Apache 2.0 | Go | One agent for logs, metrics and traces; vendor-neutral OTLP | Log pipelines are less mature than its trace pipelines; filelog parsing is more verbose |
| rsyslog / syslog-ng | GPL / LGPL (rsyslog, syslog-ng OSE) | C | Already installed on most Linux hosts, battle-tested for syslog | Awkward for JSON-first or containerized workloads; HTTP output modules are not always packaged |

Practical guidance:

- **Per-host agent on Linux or Kubernetes:** Fluent Bit.
- **Heavy parsing, redaction, routing to several destinations:** Vector.
- **You already instrument apps with OpenTelemetry:** run the OTel Collector as a gateway and send OTLP from the SDKs.
- **Legacy hosts and network gear that only emit syslog:** keep rsyslog on the host, or put one Fluent Bit or Vector instance in front as a syslog receiver. This is what [LogTide's syslog guide](/docs/syslog/) does.

## Choosing a backend

This is the decision that matters most, because it sets your hardware bill and your query model. The table below is a fair summary, not a benchmark; footprints are rules of thumb and depend heavily on volume and retention.

| Backend | Query model | Typical footprint | License |
|---|---|---|---|
| Elasticsearch + Kibana (ELK) | Full-text inverted index, KQL, Lucene syntax, or ESQL | Heavy: JVM heap per node, multiple nodes for HA, shard management | Elastic License 2.0, SSPL, or AGPLv3 (AGPL option added in 2024) |
| OpenSearch + Dashboards | Same family as ES, DQL / PPL | Heavy, same JVM profile | Apache 2.0 |
| Grafana Loki | Index on labels only, LogQL greps the content | Light on index, object storage friendly; slower for ad-hoc content search | AGPLv3 |
| Graylog | Lucene-style queries on OpenSearch (via its Data Node) plus MongoDB for config | Heavy: Graylog server, MongoDB, and a search backend | Graylog Open is SSPL since 5.1 (Apache 2.0 before that) |
| LogTide | Field and full-text search over SQL stores (TimescaleDB by default, ClickHouse or MongoDB optional) | Light: backend, worker, frontend, Postgres, Redis | AGPLv3 |

How to read it:

- **Need petabyte-scale full-text search or an existing Beats and Logstash estate?** Elasticsearch or OpenSearch is still the proven answer. Budget for the cluster. See [ELK alternatives](/elk-alternatives/) if the footprint is the problem.
- **Already live in Grafana and mostly filter by service and pod?** Loki fits well, and the cost model is hard to beat. Searching arbitrary text across a long time range is where it hurts. Details in [LogTide vs Loki](/vs/grafana-loki/).
- **Want a UI-first product with pipelines and streams?** Graylog. Note the SSPL if you plan to offer it as a service; for internal use it rarely matters. See [LogTide vs Graylog](/vs/graylog/).
- **Want one small stack with search, live tail, alerting and detection rules, on a database you already know how to back up?** That is the gap LogTide targets. It is younger than the others, with a smaller ecosystem, so check that the integrations you need exist.

Whatever you pick, check two things before committing: how a query behaves on a week of your real data, and what restoring from backup looks like.

## Sizing: disk, memory and retention math

Disk is the part people get wrong, so do the arithmetic.

```
raw_GB_per_day = avg_event_bytes * events_per_second * 86400 / 1e9
disk_GB        = raw_GB_per_day * retention_days / compression_ratio * 1.3
```

Example: 500 events/s at 250 bytes average is 125 KB/s, or about 10.8 GB/day raw. With 30 days of retention:

| Storage | Assumed ratio | Disk for 30 days (with 30% headroom) |
|---|---|---|
| Lucene index (ES / OpenSearch) | ~1x | ~420 GB, before replicas |
| Compressed columnar / time-series | ~5-10x | ~42-84 GB |

Treat these ratios as starting points. JSON logs with many repeated keys compress very well; high-cardinality random strings (UUIDs, hashes) compress poorly. Ingest one real week and read the actual on-disk size.

Other rules that save pain:

- **Retention per source.** Debug logs from a staging service do not deserve 90 days. Keep audit and auth logs longer, keep noisy ones shorter. In LogTide, retention is configured per organization.
- **Keep the disk off the root volume.** A full log disk should not take the host with it. Alert at 70-80% usage.
- **Memory.** Database-backed stores want RAM for page cache; JVM stores want heap of about half of RAM, capped near 31 GB. A small LogTide stack runs on a few GB of RAM; check the [deployment guide](/docs/deployment/) for the current guidance rather than relying on a number here.
- **Plan for bursts.** An incident produces 10x the logs exactly when you need the system most. Collector-side disk buffering and a queue in front of storage are what keep you from dropping data.

## Securing the logging server

Logs contain tokens, emails, and stack traces with internal paths. Treat the server as sensitive infrastructure.

- **TLS everywhere between collectors and the server.** Terminate at a reverse proxy (Caddy, Traefik, nginx) with a real certificate. Do not ship logs over plain HTTP across networks you do not own.
- **Authenticate senders.** Use per-project or per-source API keys so one leaked key can be revoked without touching the rest. Never put a key in a shared image.
- **Do not publish database ports.** Many example compose files map Postgres or Redis to the host. In production remove those `ports:` entries and let services talk on the internal Docker network.
- **Restrict who can read.** Separate organizations or projects per team where the tool supports it, and put the UI behind SSO or a VPN when possible.
- **Firewall the syslog port.** Port 514 accepts anything from anyone who can reach it. Allow only known device subnets.
- **Scrub at the edge.** Redact secrets and PII in the collector before they reach storage. Both Vector (VRL) and Fluent Bit (Lua, `modify`) can do it.
- **Back up the store, and test the restore.** Logs under audit or legal hold are only retained if you can get them back.

## Walkthrough: LogTide plus Fluent Bit

This sets up a central server running LogTide, then ships a host's logs to it over HTTPS. The same pattern works for any HTTP-based backend; only the output block changes.

### 1. Start the server

LogTide runs as a Docker Compose stack: Postgres with TimescaleDB, Redis, the backend API, a worker, and the frontend. Fetch the compose file and env template from the repository:

```bash
mkdir logtide && cd logtide
curl -O https://raw.githubusercontent.com/logtide-dev/logtide/main/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/logtide-dev/logtide/main/docker/.env.example
mv .env.example .env
```

Edit `.env` and set real values for the required secrets:

```bash
DB_PASSWORD=<long random string>
REDIS_PASSWORD=<long random string>
API_KEY_SECRET=<at least 32 characters>
```

Before starting, open `docker-compose.yml` and remove the `ports:` mappings for `postgres` (5432) and `redis` (6379), since only the backend needs them, on the internal network. Then:

```bash
docker compose up -d
```

Open the frontend on port 3000, create an account and an organization, create a project, and generate an API key under Project > Settings > API Keys. Keys start with `lp_` and are shown once.

For high volume, the compose file also has a `clickhouse` profile (set `STORAGE_ENGINE=clickhouse` in `.env`); see the [storage engines](/docs/storage-engines/) page for when that is worth it.

### 2. Put TLS in front

The backend listens on port 8080 without TLS. Put a reverse proxy in front and expose only 443. A minimal Caddy example, assuming Caddy runs on the same host:

```
logs.example.com {
    handle /api/* {
        reverse_proxy localhost:8080
    }
    handle /v1/* {
        reverse_proxy localhost:8080
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

The repository also ships a `docker-compose.traefik.yml` if you prefer Traefik. When running behind a proxy, set `TRUST_PROXY=true` and `FRONTEND_URL=https://logs.example.com` in `.env`.

### 3. Configure the collector on each host

Fluent Bit tails files and posts JSON lines to LogTide's `/api/v1/ingest/single` endpoint, which expects fields such as `message`, `level`, `service` and `time`. This is the same output block LogTide's bundled `fluent-bit.conf` uses, with TLS on and a disk buffer added.

```ini
# /etc/fluent-bit/fluent-bit.conf  (Fluent Bit 4.x, classic format)
[SERVICE]
    Flush         5
    Log_Level     info
    storage.path  /var/lib/fluent-bit/buffer
    storage.sync  normal

[INPUT]
    Name          tail
    Path          /var/log/myapp/*.log
    Tag           app.*
    Skip_Long_Lines On
    storage.type  filesystem
    Mem_Buf_Limit 5MB

[FILTER]
    Name          modify
    Match         app.*
    Rename        log message
    Add           service myapp
    Add           level info
    Add           host ${HOSTNAME}

[OUTPUT]
    Name          http
    Match         app.*
    Host          logs.example.com
    Port          443
    tls           On
    tls.verify    On
    URI           /api/v1/ingest/single
    Format        json_lines
    Header        X-API-Key ${LOGTIDE_API_KEY}
    Header        Content-Type application/json
    Json_date_key time
    Json_date_format iso8601
    Retry_Limit   5
```

Run it with the key in the environment:

```bash
LOGTIDE_API_KEY=lp_xxx fluent-bit -c /etc/fluent-bit/fluent-bit.conf
```

The static `level info` is a placeholder. If your application writes JSON lines, add a `parser` filter first so real levels and fields are used. The bundled `docker/fluent-bit.conf` and `docker/parsers.conf` in the LogTide repository show Docker JSON and syslog parsing.

### 4. Or: OpenTelemetry Collector

If your apps already emit OTLP, run the Collector as a gateway. LogTide accepts OTLP/HTTP logs at `/v1/otlp/logs` with the same `X-API-Key` header. Because the `otlphttp` exporter appends its own default path, set `logs_endpoint` explicitly:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 100

exporters:
  otlphttp/logtide:
    logs_endpoint: https://logs.example.com/v1/otlp/logs
    headers:
      X-API-Key: ${env:LOGTIDE_API_KEY}

service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/logtide]
```

See the [OpenTelemetry guide](/docs/opentelemetry/) for SDK examples, and the [Vector guide](/docs/vector/) if you would rather use Vector.

### 5. Receive syslog from devices

For routers, firewalls and hypervisors, the compose file includes a Fluent Bit service behind the `logging` profile that listens on port 514 (UDP and TCP, RFC 3164):

```bash
# in .env: FLUENT_BIT_API_KEY=lp_xxx  and  SYSLOG_TZ_OFFSET=1
docker compose --profile logging up -d
```

RFC 3164 timestamps carry no timezone, so set `SYSLOG_TZ_OFFSET` to the devices' offset from UTC or their logs will land at the wrong time. Restrict port 514 to your device subnets with the host firewall.

### 6. Verify

Generate a line and confirm it arrives:

```bash
echo "hello from $(hostname)" >> /var/log/myapp/test.log
```

Search for it in the UI. Then stop the server for a minute, write more lines, start it again, and confirm the buffered lines appear. That test is what proves the filesystem buffer works.

## Checklist

- [ ] Daily raw volume measured, retention and disk computed with headroom
- [ ] Collector buffers to disk and retries on failure
- [ ] TLS between collectors and server, valid certificate
- [ ] Per-source API keys, none baked into images
- [ ] Database and cache ports not published on the host
- [ ] Syslog port restricted to known subnets
- [ ] Secrets and PII scrubbed at the collector
- [ ] Retention set per source, alert on disk usage
- [ ] Backup taken and a restore actually tested
- [ ] Alert on the logging pipeline itself (silence from a host is a signal)

---

**Related guides:**

- [Self-hosted log management](/self-hosted-log-management/) - why teams run their own log stack and what it replaces
- [Deployment guide](/docs/deployment/) - production Docker Compose, storage and reverse proxy setup
- [Syslog and network devices](/docs/syslog/) - receiving syslog from firewalls, hypervisors and legacy hosts
- [ELK alternatives](/elk-alternatives/) - lighter options when the Elastic footprint is the problem
- [LogTide vs Grafana Loki](/vs/grafana-loki/) - label index versus field search, side by side
