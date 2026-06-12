---
title: "Homelab Logging & Monitoring"
description: "Centralize logs from your Proxmox homelab with LogTide: LXC containers, Docker services, AdGuard DNS, firewall packets and exposed services — in ~3 GB of RAM."
category: "operations"
difficulty: "easy"
icon: "lucide:home"
industries:
  - "Homelab"
  - "Self-hosters"
  - "Developers"
highlights:
  - "Runs in a single LXC or VM"
  - "~3 GB RAM under load"
  - "Firewall & packet log visibility"
  - "SIEM for exposed services"
relatedIntegrations:
  - "systemd"
  - "docker"
  - "nginx"
relatedUseCases:
  - "security-monitoring"
  - "real-time-alerting"
keywords:
  - "homelab log management"
  - "proxmox log monitoring"
  - "self hosted homelab logging"
  - "lxc container logs"
  - "homelab SIEM"
  - "adguard home logs"
  - "firewall log monitoring homelab"
faqs:
  - question: "How much RAM does LogTide need in a homelab?"
    answer: "A standard homelab deployment (Proxmox host, a dozen LXC containers, a few exposed services) runs comfortably in about 3 GB of RAM under heavy load with the default TimescaleDB stack. That's a single LXC or small VM — compared to 8-16 GB for a minimal ELK setup, it fits a homelab budget."
  - question: "Can LogTide collect logs from Proxmox LXC containers?"
    answer: "Yes. The cleanest pattern is journald/rsyslog forwarding from each container (or the Proxmox host) to a central Fluent Bit instance that ships to LogTide's HTTP ingest API. Containers running Docker can use the Fluent Bit Docker log driver or the LogTide SDKs directly."
  - question: "Can I see what happens to network packets with LogTide?"
    answer: "Yes, via firewall logging: enable logging on your nftables/iptables rules (or your OPNsense/pfSense box) and forward those entries to LogTide. You get a searchable record of accepted and dropped connections — source IPs, ports, protocols — and can alert on patterns like port scans or repeated hits on your exposed services."
  - question: "Is a SIEM overkill for a homelab?"
    answer: "Not if you expose anything to the internet. LogTide's built-in Sigma rules detect SSH brute force, web scanning, and anomalous authentication out of the box — exactly the noise an exposed homelab service attracts daily. Since the SIEM is included rather than a paid add-on, the only cost is the logs' disk space."
  - question: "Why not just use Grafana Loki or Promtail for a homelab?"
    answer: "Loki is a fine choice if you already run Grafana and only need label-based queries. LogTide gives you full-text and field-based search, alerting, and security detection in a single service without needing the Grafana stack — and the live tail works out of the box. For homelabs the deciding factor is usually wanting one lightweight service instead of assembling several."
---

A homelab generates more logs than most small companies: a Proxmox host, a stack of LXC containers, Docker services like Forgejo, Vikunja and AdGuard Home, a reverse proxy, and — the part that actually matters — one or two services exposed to the public internet. Each one logs into its own corner, and when something breaks (or something probes you), you're SSH-ing into five boxes running `journalctl` and `docker logs` in parallel.

LogTide gives a homelab the thing enterprises pay five figures for: every log searchable in one place, with alerting and security detection — at homelab scale. The whole stack runs in a single LXC or VM and stays around **3 GB of RAM under heavy load**.

## What a homelab deployment looks like

```text
Proxmox host ──── journald/rsyslog ─┐
LXC: Forgejo ──── journald ─────────┤
LXC: Vikunja ──── journald ─────────┼──► Fluent Bit ──► LogTide (LXC/VM)
LXC: AdGuard ──── query log ────────┤    (one central     TimescaleDB
Docker services ─ log driver ───────┤     collector)      ~3 GB RAM
Firewall ──────── nftables/OPNsense ┘
```

One central Fluent Bit (or Vector) instance receives everything and ships it to LogTide's HTTP ingest API. No agents to license, no per-GB bill — your only constraint is disk, and homelab log volumes are tiny by enterprise standards (a busy homelab produces 100-500 MB/day; even a year of retention fits on a small SSD).

## Step 1: Deploy LogTide in an LXC or VM

A container or VM with **2 vCPU / 4 GB RAM / 50+ GB disk** is plenty:

```bash
git clone https://github.com/logtide-dev/logtide
cd logtide
docker compose up -d
```

Create an organization, a project (e.g. `homelab`), and an API key. Full steps in the [getting started guide](/docs/getting-started/) — including the low-resource Docker setup.

> Running Docker inside a Proxmox LXC works well with a privileged container or with `keyctl=1,nesting=1` features enabled on an unprivileged one. If you'd rather avoid Docker-in-LXC, use a small VM.

## Step 2: Collect the host and LXC containers

Every Debian/Ubuntu-based LXC already logs to journald, so the [systemd integration](/integrations/systemd/) pattern covers most of the fleet: forward journald (or rsyslog) from each container to your central collector.

The lazy-but-effective variant: instead of touching every container, log from the **Proxmox host**, which can see its containers' journals, and tag entries by container. Either way, Fluent Bit ships them on:

```ini
[INPUT]
    Name systemd
    Tag host.systemd
    Read_From_Tail On

[INPUT]
    Name syslog
    Mode udp
    Listen 0.0.0.0
    Port 5140
    Parser syslog-rfc5424
    Tag lxc.syslog

[OUTPUT]
    Name http
    Match *
    Host logtide.lan
    Port 8080
    URI /api/v1/ingest/single
    Format json_lines
    Header X-API-Key lp_your_api_key
    Header Content-Type application/json
```

Docker-based services (Forgejo, Vikunja, etc.) plug in through the [Docker integration](/integrations/docker/) — either the Fluent Bit forward driver or tailing the container log files.

## Step 3: Watch your packets (firewall logging)

This is the part homelabbers ask about most: *what is actually hitting my network?* You don't need a packet capture appliance — firewall logs give you the connection-level story (who, what port, allowed or dropped) at a fraction of the volume.

### Linux router / Proxmox firewall (nftables)

Add logging to the rules you care about — typically dropped inbound traffic and accepted connections to exposed ports:

```bash
# Log dropped inbound packets, rate-limited to protect the journal
nft add rule inet filter input limit rate 10/second log prefix \"fw-drop: \" counter drop

# Log accepted connections to your exposed web service
nft add rule inet filter input tcp dport { 80, 443 } limit rate 50/second log prefix \"fw-accept-web: \" counter accept
```

These entries land in the kernel log (journald), which your Fluent Bit pipeline from Step 2 already ships. The `fw-drop:` / `fw-accept-web:` prefixes become trivially searchable in LogTide, and the log line carries source IP, destination port, and protocol.

> Always rate-limit firewall logging (`limit rate`). A port scan against an unlimited `log` rule can flood the journal faster than you'd expect.

### OPNsense / pfSense

If a BSD firewall fronts your network, point its remote syslog at the Fluent Bit syslog input from Step 2 (`Settings → Logging → Remote`) and select the firewall log category. Same pipeline, zero extra moving parts.

### What you get

- A searchable history of every dropped probe against your WAN — by source IP, port, and time
- Alert rules like *"more than 50 drops from one IP in 5 minutes"* (port scan) or *"any accepted connection to a port that isn't 80/443"*
- Correlation between a firewall accept and what your reverse proxy and application logged seconds later — one timeline instead of three

## Step 4: The exposed service gets the SIEM treatment

Anything public-facing attracts scanners within hours. Ship your reverse proxy logs ([nginx](/integrations/nginx/) or Traefik) and auth logs, then let LogTide's built-in detection work:

- **SSH brute force**: Sigma rules flag repeated `Failed password` bursts — useful even if you only expose SSH through a VPN, as a canary
- **Web scanning**: bursts of 404s and probes for `/wp-admin`, `/.env`, `/phpmyadmin` against a site that has none of them
- **AdGuard DNS anomalies**: ship AdGuard Home's query log and alert on lookups to known-bad domains from your own LAN — the cheapest malware tripwire there is

Set up [real-time alerts](/use-cases/real-time-alerting/) to Telegram, Discord or email, and the homelab tells *you* when something's wrong — instead of you finding out three weeks later in a forgotten log file.

## Why not ELK / Loki / a SaaS free tier?

| | ELK Stack | Grafana Loki | SaaS free tiers | LogTide |
|---|---|---|---|---|
| RAM footprint | 8-16 GB | 2-4 GB (+ Grafana) | n/a | **~3 GB under load** |
| Full-text + field search | Yes | Labels only | Limited | Yes |
| Retention | Disk-bound | Disk-bound | Days, capped volume | Disk-bound |
| SIEM / detections | Paid tier | No | No | **Included** |
| Data leaves your network | No | No | **Yes** | No |

SaaS free tiers cap volume and retention exactly where a homelab gets interesting, and shipping your home network's logs (every DNS query, every failed login) to a third party defeats half the point of self-hosting. ELK works but eats a homelab-sized server by itself. LogTide is built for exactly this footprint: one service, one database, everything included.

## Realistic resource budget

| Component | Sizing |
|-----------|--------|
| LogTide LXC/VM | 2 vCPU, 4 GB RAM (≈3 GB used under load), 50 GB disk |
| Fluent Bit collector | ~50 MB RAM (can live in the same container) |
| Typical homelab volume | 100-500 MB/day → years of retention on 50 GB |

Start with everything on one box; split the collector out only if you grow into multiple physical hosts.

---

**Get started:**

- [Getting started guide](/docs/getting-started/) — Docker Compose deployment, low-resource setup included
- [systemd integration](/integrations/systemd/) — journald forwarding for host and LXCs
- [Docker integration](/integrations/docker/) — for your containerized services
- [No-SDK setup](/docs/no-sdk-setup/) — Fluent Bit patterns for everything else
