---
title: "Odoo Logging Integration"
description: "Send Odoo server logs, tracebacks, request latency and business events to LogTide: Odoo addon, Fluent Bit with the odoo parser, or webhooks."
category: "framework"
difficulty: "easy"
sdk: "python"
brandIcon: "simple-icons:odoo"
highlights:
  - "Official logtide_odoo addon"
  - "Prefork-safe (workers > 0)"
  - "Request latency from werkzeug lines"
  - "Odoo Online via Automated Actions"
relatedIntegrations:
  - "python"
  - "postgresql"
  - "docker"
  - "systemd"
relatedUseCases:
  - "security-monitoring"
keywords:
  - "odoo logging"
  - "odoo log management"
  - "odoo.sh logs"
  - "odoo error monitoring"
  - "odoo slow requests"
  - "odoo automated actions webhook"
faqs:
  - question: "Which method should I use to send Odoo logs to LogTide?"
    answer: "It depends on where Odoo runs. Self-hosted: the logtide_odoo addon, or Fluent Bit with the built-in odoo parser if you prefer not to install modules. Odoo.sh: the logtide_odoo addon, with the DSN stored in the logtide.dsn System Parameter. Odoo Online: custom modules are not allowed, so use an Automated Action that sends a webhook to an Odoo receiver."
  - question: "Does the addon work with Odoo in multi-worker (prefork) mode?"
    answer: "Yes. The addon creates one LogTide client per process and resets it after fork, so HTTP workers, cron workers and the gevent process each send their own logs. Entries buffered in the master are never sent twice. Version 0.11.0 of the Python SDK is fork-safe on its own as well."
  - question: "Which Odoo versions are supported?"
    answer: "The addon targets Odoo 17.0, 18.0 and 19.0. The Fluent Bit parser works with any version that uses the default log format. The Odoo receiver needs Odoo 17 or later, where Automated Actions can send webhooks."
  - question: "Can I see slow Odoo requests in LogTide?"
    answer: "Yes. Odoo appends query count, SQL time and remaining time to every werkzeug access line. The odoo pipeline parser turns them into query_count, query_time, remaining_time and duration_ms, which you can filter and chart."
---

Odoo writes everything through Python's standard `logging` module: HTTP access lines, ORM warnings, cron runs and full tracebacks. LogTide can collect them in three ways, and the right one depends on where Odoo runs.

| Where Odoo runs | Recommended method |
|---|---|
| Self-hosted (VM, Docker, Kubernetes) | `logtide_odoo` addon, or Fluent Bit + `odoo` parser |
| Odoo.sh | `logtide_odoo` addon (DSN in a System Parameter) |
| Odoo Online (SaaS) | Automated Action webhook to an Odoo receiver |

## Prerequisites

- Odoo 17.0, 18.0 or 19.0
- A LogTide project and its DSN or API key
- For the addon: Python package `logtide-sdk` 0.10.0 or later (0.11.0 recommended)

## Method 1: the logtide_odoo addon

The addon attaches a handler to Odoo's root logger and forwards every record to LogTide through the Python SDK, with Odoo context attached to each entry.

### Install

```bash
pip install "logtide-sdk>=0.10.0"
git clone https://github.com/logtide-dev/logtide-odoo /opt/odoo/logtide-odoo
```

Add `/opt/odoo/logtide-odoo` to `addons_path`.

### Configure

In `odoo.conf`:

```ini
[options]
addons_path = /opt/odoo/odoo/addons,/opt/odoo/logtide-odoo
server_wide_modules = base,web,logtide_odoo

logtide_dsn = https://lp_your_api_key@logs.example.com
logtide_service = odoo
logtide_level = INFO
logtide_environment = production
logtide_capture_ir_logging = False
```

Every key can also be set as an environment variable. Lookup order is `odoo.conf`, then environment, then default:

| odoo.conf | Environment | Default | Notes |
|---|---|---|---|
| `logtide_dsn` | `LOGTIDE_DSN` | none | Required. Falls back to the `logtide.dsn` System Parameter |
| `logtide_service` | `LOGTIDE_SERVICE` | `odoo` | Service name in LogTide |
| `logtide_level` | `LOGTIDE_LEVEL` | `INFO` | Minimum level forwarded |
| `logtide_environment` | `LOGTIDE_ENVIRONMENT` | none | Added as `environment` metadata |
| `logtide_capture_ir_logging` | `LOGTIDE_CAPTURE_IR_LOGGING` | `False` | Also forward `ir.logging` rows (server action logs) |

Without a DSN the addon does nothing and logs a single warning.

### Server-wide or installed

Loading the addon server-wide (`server_wide_modules` or `--load=base,web,logtide_odoo`) is recommended: the handler is attached at startup, so module loading and registry errors are captured too. Installing it as a regular module from Apps also works, but logs start only once the registry for that database is loaded.

### Odoo.sh

Odoo.sh does not let you edit `odoo.conf`. Add the addon to your repository, add `logtide-sdk>=0.10.0` to the `requirements.txt` at the repository root, install the module, then create a System Parameter (Settings, Technical, System Parameters):

- Key: `logtide.dsn`
- Value: your DSN

The parameter is read once when the registry loads, and only when no DSN is set in the config or environment.

### Multi-worker (prefork) mode

With `workers > 0` Odoo forks HTTP and cron workers from a master process and recycles them periodically. The addon keeps one LogTide client per process: after a fork the inherited client is discarded without flushing, so the master's buffered logs are never sent twice, and each worker flushes its own buffer when it exits. A worker killed with SIGKILL (for example after `limit_time_real`) can lose up to one flush interval of logs, about 5 seconds.

### What gets sent

Each record keeps its Python level and message. Records with `exc_info` carry the full traceback in `exception`. Metadata keys are flat:

| Key | When |
|---|---|
| `odoo.pid` | Always |
| `odoo.dbname` | When a database is bound to the thread |
| `odoo.uid` | When a user is known |
| `odoo.cron` | Inside an `ir.cron` job |
| `http.path`, `http.method`, `http.remote_addr` | Inside an HTTP request |
| `odoo.model`, `odoo.method` | On `/web/dataset/call_kw` (JSON-RPC) calls |
| `environment` | When `logtide_environment` is set |
| `logger`, `module`, `funcName`, `lineno`, `pathname` | Always (added by the SDK) |

If the incoming request carries a W3C `traceparent` header, its trace ID is attached to every log of that request, so Odoo logs line up with traces from a frontend or proxy.

Logs from `logtide_sdk`, `urllib3` and `requests` are never forwarded, to avoid feedback loops.

## Method 2: Fluent Bit and the odoo parser

Use this when you would rather not install a module, or already run Fluent Bit. Odoo keeps logging to a file; Fluent Bit ships the raw lines and LogTide parses them.

### Odoo side

```ini
[options]
logfile = /var/log/odoo/odoo.log
```

In Docker, mount `/var/log/odoo` as a volume shared with Fluent Bit.

### Fluent Bit

`/etc/fluent-bit/parsers.conf`:

```ini
[MULTILINE_PARSER]
    name          odoo_multiline
    type          regex
    flush_timeout 1000
    rule          "start_state" "/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} /" "cont"
    rule          "cont"        "/^(?!\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} ).*/" "cont"

[PARSER]
    Name   odoo_level
    Format regex
    Regex  ^\S+ \S+ \d+ (?<level>[A-Z]+)\s
```

`/etc/fluent-bit/fluent-bit.conf`:

```ini
[SERVICE]
    Parsers_File parsers.conf

[INPUT]
    Name              tail
    Path              /var/log/odoo/odoo.log
    Tag               odoo
    multiline.parser  odoo_multiline

[FILTER]
    Name          parser
    Match         odoo
    Key_Name      log
    Parser        odoo_level
    Reserve_Data  On
    Preserve_Key  On

[FILTER]
    Name    modify
    Match   odoo
    Add     service odoo

[OUTPUT]
    Name             http
    Match            odoo
    Host             YOUR_LOGTIDE_HOST
    Port             443
    URI              /api/v1/ingest/single
    Format           json_lines
    Header           X-API-Key YOUR_API_KEY
    Header           Content-Type application/x-ndjson
    Json_date_key    time
    Json_date_format iso8601
    tls              On
```

The multiline parser joins traceback lines to the record that produced them. The `odoo_level` parser only adds a `level` field and keeps the original line in `log`, so LogTide stores the whole line as the message with the correct level.

### LogTide pipeline

In LogTide, open **Settings, Pipelines**, create a pipeline for the project and add a **Parser** step with the built-in **odoo** parser. It extracts:

| Field | Description |
|---|---|
| `timestamp`, `pid`, `logger`, `message` | From the Odoo line prefix |
| `odoo_level` | Raw level name (`WARNING`, `ERROR`, ...) |
| `level` | Normalized level (stored as metadata) |
| `dbname` | Omitted when Odoo logs `?` (no database) |

On `werkzeug` access lines it also extracts the request and Odoo's performance counters:

| Field | Description |
|---|---|
| `client_ip`, `http_method`, `http_path`, `http_query`, `http_version`, `http_status`, `response_bytes` | Request |
| `query_count` | SQL queries run by the request |
| `query_time` | Time spent in SQL, seconds |
| `remaining_time` | Time spent outside SQL, seconds |
| `duration_ms` | `(query_time + remaining_time) * 1000` |

ANSI colour codes (present when Odoo logs to a terminal) are stripped before parsing.

## Method 3: Odoo Online and business events

Odoo Online does not allow custom modules, and its server logs are not accessible. What you can send are business events: an Automated Action posts a record to LogTide whenever it changes. The same approach is useful on any Odoo version 17 or later for auditing, alongside server logs.

1. In LogTide, open **Project Settings, Webhook Receivers**, create a receiver with type **Odoo** and copy its ingest URL.
2. In Odoo, open **Settings, Technical, Automated Actions** and create a rule, for example on `Journal Entry` when `Status` is set to `Posted`.
3. Set the action to **Send Webhook Notification**, paste the ingest URL and select the fields to send (for example `name`, `state`, `amount_total`, `partner_id`).

Each webhook becomes one log entry:

- **service**: `odoo`, unless the receiver sets a default service
- **message**: `<model> <display name>` and, when the payload has `state`, `→ <state>`. Example: `account.move INV/2026/0042 → posted`
- **level**: `warn` when `state` is `cancel`, `cancelled`, `error`, `failed` or `exception`, otherwise `info`. A `levelMap` in the receiver's field mapping overrides this per state
- **metadata.odoo**: `model`, `id`, `display_name`, `action`, and `fields` with every selected field (Many2one values stay as `[id, "Name"]`)

Payloads without `_model` are skipped. See [Webhook Receivers](/docs/receivers) for tokens, rotation and field mapping.

## Useful queries

```
# Tracebacks from Odoo
service:odoo level:error

# Slow requests (Fluent Bit + odoo parser)
service:odoo duration_ms:>2000

# Requests running too many SQL queries
service:odoo query_count:>500

# Everything from one cron job (addon)
service:odoo odoo.cron:"Mail: Email Queue Manager"

# Cancelled invoices (Odoo receiver)
service:odoo odoo.model:account.move level:warn
```

## Troubleshooting

**No logs arrive from the addon.** Check the Odoo log at startup for a `logtide_odoo` warning: a missing DSN, an invalid DSN or a missing `logtide-sdk` package disables forwarding with one warning and nothing else.

**Logs stop after a few minutes in multi-worker mode.** You are probably using `logtide-sdk` older than 0.11.0 with your own handler setup instead of the addon. Upgrade the SDK or use the addon.

**Tracebacks arrive split over many entries (Fluent Bit).** The `multiline.parser` line is missing from the `tail` input, or the log format was customised and the `start_state` regex no longer matches.

**Every Fluent Bit entry is `info`.** The `odoo_level` parser did not match: check that the line starts with `YYYY-MM-DD HH:MM:SS,mmm PID LEVEL`.
