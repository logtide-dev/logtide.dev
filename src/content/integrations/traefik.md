---
title: "Traefik Reverse Proxy Log Integration"
description: "Forward Traefik access logs and middleware metrics to LogTide with structured JSON parsing for Docker and Kubernetes environments."
category: "infrastructure"
difficulty: "medium"
sdk: "none"
brandIcon: "simple-icons:traefikproxy"
highlights:
  - "JSON access log parsing"
  - "Middleware metrics"
  - "Docker & Kubernetes native"
  - "Real-time traffic analysis"
relatedIntegrations:
  - "docker"
  - "docker-compose"
  - "kubernetes"
relatedUseCases:
  - "security-monitoring"
  - "real-time-alerting"
keywords:
  - "traefik logging"
  - "traefik access logs"
  - "traefik log management"
  - "traefik monitoring"
  - "traefik reverse proxy logs"
  - "traefik middleware logging"
faqs:
  - question: "How do I send Traefik access logs to LogTide?"
    answer: "Enable JSON access logging in Traefik via traefik.yml or CLI flags, then use Vector or Fluent Bit to tail the log file and ship entries to the LogTide HTTP ingest endpoint using your API key. The guide includes ready-to-use Vector and Fluent Bit configurations for both Docker and Kubernetes environments."
  - question: "Does LogTide support structured JSON logs from Traefik?"
    answer: "Yes. Traefik natively supports JSON-formatted access logs via the accessLog.format: json setting, and LogTide parses all standard fields such as DownstreamStatus, RequestMethod, RequestPath, Duration, and ClientHost automatically. No custom parsing rules are required on the LogTide side."
  - question: "Can I monitor Traefik middleware events like rate limiting and authentication failures?"
    answer: "Yes. Rate-limited requests appear as 429 status codes and authentication failures as 401 codes in the access log, so you can create LogTide alerts using queries like service:traefik AND DownstreamStatus:429. The guide includes example alert queries for rate limiting, auth failures, circuit breaker trips, and slow backend responses."
  - question: "What is the performance overhead of forwarding Traefik logs to LogTide?"
    answer: "Access log writing adds less than 1ms per request when using the recommended bufferingSize of 100. Vector uses approximately 50MB of memory tailing two log files, and Fluent Bit uses approximately 30MB as a lighter alternative. Log forwarding is fully decoupled from Traefik's request processing."
---

Traefik is a modern, cloud-native reverse proxy and ingress controller designed for microservices. This guide shows you how to forward Traefik access logs, middleware metrics, and error events to LogTide for centralized visibility across your infrastructure.

## Why use LogTide with Traefik?

- **Request visibility**: Analyze traffic patterns, status codes, and latencies across all your services
- **Middleware insights**: Track rate limiting, authentication, and circuit breaker events in real time
- **Security monitoring**: Detect suspicious traffic, brute-force attempts, and unauthorized access
- **Centralized logging**: Correlate Traefik routing decisions with backend application logs
- **Dynamic routing audit**: Understand which routes are active and how traffic flows through your infrastructure
- **Multi-environment**: Consistent log collection whether Traefik runs in Docker, Kubernetes, or bare metal

## Prerequisites

- Traefik v2.10+ or v3.x
- LogTide instance with API key
- One of the following log forwarding tools:
  - Vector (recommended for high throughput)
  - Fluent Bit
  - Or direct file tailing via HTTP API

## Quick Start (10 minutes)

### Step 1: Enable Traefik JSON Access Logs

Traefik supports structured JSON access logs out of the box. Configure via static configuration.

**Using `traefik.yml`:**

```yaml
# /etc/traefik/traefik.yml
accessLog:
  filePath: "/var/log/traefik/access.log"
  format: json
  bufferingSize: 100
  fields:
    defaultMode: keep
    names:
      ClientUsername: drop
    headers:
      defaultMode: drop
      names:
        User-Agent: keep
        Authorization: redact
        X-Forwarded-For: keep
        X-Real-Ip: keep
        X-Request-Id: keep

log:
  filePath: "/var/log/traefik/traefik.log"
  level: WARN
  format: json
```

**Using CLI flags:**

```bash
traefik \
  --accesslog=true \
  --accesslog.filepath=/var/log/traefik/access.log \
  --accesslog.format=json \
  --accesslog.bufferingsize=100 \
  --log.filepath=/var/log/traefik/traefik.log \
  --log.level=WARN \
  --log.format=json
```

**Using environment variables:**

```bash
TRAEFIK_ACCESSLOG=true
TRAEFIK_ACCESSLOG_FILEPATH=/var/log/traefik/access.log
TRAEFIK_ACCESSLOG_FORMAT=json
TRAEFIK_LOG_FILEPATH=/var/log/traefik/traefik.log
TRAEFIK_LOG_LEVEL=WARN
TRAEFIK_LOG_FORMAT=json
```

### Step 2: Set Up Vector for Log Forwarding

Vector is the recommended forwarder for Traefik logs due to its high throughput and native JSON support.

Install Vector:

```bash
# Ubuntu/Debian
curl -1sLf 'https://repositories.timber.io/public/vector/cfg/setup/bash.deb.sh' | sudo bash
sudo apt-get install vector

# RHEL/CentOS
curl -1sLf 'https://repositories.timber.io/public/vector/cfg/setup/bash.rpm.sh' | sudo bash
sudo yum install vector
```

Create `/etc/vector/vector.toml`:

```toml
# /etc/vector/vector.toml

# Traefik access logs
[sources.traefik_access]
type = "file"
include = ["/var/log/traefik/access.log"]
read_from = "end"

[transforms.parse_traefik_access]
type = "remap"
inputs = ["traefik_access"]
source = '''
. = parse_json!(.message)
.service = "traefik"
.log_type = "access"
.level = if .DownstreamStatus >= 500 { "error" } else if .DownstreamStatus >= 400 { "warn" } else { "info" }
.message = join!(
  [.RequestMethod, .RequestPath, to_string!(.DownstreamStatus)],
  separator: " "
)
'''

# Traefik application logs (errors, warnings)
[sources.traefik_app]
type = "file"
include = ["/var/log/traefik/traefik.log"]
read_from = "end"

[transforms.parse_traefik_app]
type = "remap"
inputs = ["traefik_app"]
source = '''
. = parse_json!(.message)
.service = "traefik"
.log_type = "application"
'''

# Ship to LogTide
[sinks.logtide]
type = "http"
inputs = ["parse_traefik_access", "parse_traefik_app"]
uri = "https://YOUR_LOGTIDE_HOST/api/v1/ingest"
method = "post"
encoding.codec = "json"

[sinks.logtide.request.headers]
X-API-Key = "${LOGTIDE_API_KEY}"
Content-Type = "application/json"

[sinks.logtide.batch]
max_bytes = 1048576
timeout_secs = 5

[sinks.logtide.buffer]
type = "disk"
max_size = 268435456
when_full = "block"
```

Start Vector:

```bash
sudo systemctl enable vector
sudo systemctl start vector
```

### Step 3: Verify Logs in LogTide

Generate some traffic and check LogTide:

```bash
curl -I http://localhost/
# Filter in LogTide: service:traefik
```

## Docker Setup

### docker-compose.yml with Labels

Traefik integrates natively with Docker using labels for dynamic routing. Here is a complete setup with log forwarding:

```yaml
# docker-compose.yml
services:
  traefik:
    image: traefik:v3.1
    container_name: traefik
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--accesslog=true"
      - "--accesslog.filepath=/var/log/traefik/access.log"
      - "--accesslog.format=json"
      - "--accesslog.bufferingsize=100"
      - "--accesslog.fields.defaultmode=keep"
      - "--accesslog.fields.headers.defaultmode=drop"
      - "--accesslog.fields.headers.names.User-Agent=keep"
      - "--accesslog.fields.headers.names.X-Forwarded-For=keep"
      - "--accesslog.fields.headers.names.X-Request-Id=keep"
      - "--log.filepath=/var/log/traefik/traefik.log"
      - "--log.level=WARN"
      - "--log.format=json"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_logs:/var/log/traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.local`)"
      - "traefik.http.routers.dashboard.service=api@internal"

  vector:
    image: timberio/vector:latest-alpine
    container_name: vector
    volumes:
      - ./vector.toml:/etc/vector/vector.toml:ro
      - traefik_logs:/var/log/traefik:ro
      - vector_data:/var/lib/vector
    environment:
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    depends_on:
      - traefik
    restart: unless-stopped

  # Example backend service
  whoami:
    image: traefik/whoami
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.whoami.rule=Host(`whoami.local`)"
      - "traefik.http.routers.whoami.entrypoints=web"

volumes:
  traefik_logs:
  vector_data:
```

### Docker Log Driver Alternative

Instead of file-based logging, capture Traefik stdout/stderr with Fluent Bit:

```yaml
services:
  traefik:
    image: traefik:v3.1
    command:
      - "--accesslog=true"
      - "--accesslog.format=json"
      - "--log.level=WARN"
      - "--log.format=json"
      # Logs go to stdout/stderr (default when no filepath set)
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: traefik
        fluentd-async: "true"

  fluent-bit:
    image: fluent/fluent-bit:latest
    ports:
      - "24224:24224"
    volumes:
      - ./fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
    environment:
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
```

## Kubernetes IngressRoute Setup

### Traefik CRD with Logging

For Kubernetes, Traefik is typically deployed via Helm with custom values:

```yaml
# values.yaml for Traefik Helm chart
additionalArguments:
  - "--accesslog=true"
  - "--accesslog.format=json"
  - "--accesslog.fields.defaultmode=keep"
  - "--accesslog.fields.headers.defaultmode=drop"
  - "--accesslog.fields.headers.names.User-Agent=keep"
  - "--accesslog.fields.headers.names.X-Forwarded-For=keep"
  - "--accesslog.fields.headers.names.X-Request-Id=keep"
  - "--log.level=WARN"
  - "--log.format=json"

logs:
  access:
    enabled: true
    format: json
  general:
    level: WARN
    format: json
```

Deploy with Helm:

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm install traefik traefik/traefik -f values.yaml -n traefik --create-namespace
```

### IngressRoute Example

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: my-app
  namespace: default
spec:
  entryPoints:
    - web
    - websecure
  routes:
    - match: Host(`app.example.com`)
      kind: Rule
      services:
        - name: my-app-service
          port: 80
      middlewares:
        - name: rate-limit
        - name: security-headers
```

### Fluent Bit DaemonSet for Traefik Pods

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-traefik
  namespace: traefik
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush         5
        Log_Level     info

    [INPUT]
        Name              tail
        Path              /var/log/containers/traefik-*.log
        Parser            cri
        Tag               traefik.*
        Refresh_Interval  5
        DB                /var/log/fluent-bit/traefik.db

    [FILTER]
        Name          parser
        Match         traefik.*
        Key_Name      log
        Parser        json
        Reserve_Data  On

    [FILTER]
        Name          modify
        Match         traefik.*
        Add           service traefik
        Add           environment production
        Add           cluster ${CLUSTER_NAME}

    [OUTPUT]
        Name          http
        Match         traefik.*
        Host          YOUR_LOGTIDE_HOST
        Port          443
        URI           /api/v1/ingest/single
        Format        json
        Header        X-API-Key ${LOGTIDE_API_KEY}
        Header        Content-Type application/json
        tls           On
        tls.verify    On
```

## Middleware Logging

### Rate Limiting Middleware

Configure rate limiting and log rejected requests:

```yaml
# Docker labels
labels:
  - "traefik.http.middlewares.rate-limit.ratelimit.average=100"
  - "traefik.http.middlewares.rate-limit.ratelimit.burst=50"
  - "traefik.http.middlewares.rate-limit.ratelimit.period=1m"
  - "traefik.http.routers.my-app.middlewares=rate-limit"
```

Rate-limited requests appear in access logs with `429` status codes. Create a LogTide alert:

```
service:traefik AND DownstreamStatus:429
```

### Authentication Middleware

Track authentication events:

```yaml
# Kubernetes middleware
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: auth-forward
spec:
  forwardAuth:
    address: http://auth-service:4180/verify
    trustForwardHeader: true
    authResponseHeaders:
      - X-Auth-User
      - X-Auth-Groups
```

Monitor failed authentication:

```
service:traefik AND DownstreamStatus:401
```

### Circuit Breaker Middleware

```yaml
labels:
  - "traefik.http.middlewares.cb.circuitbreaker.expression=LatencyAtQuantileMS(50.0) > 1000"
  - "traefik.http.middlewares.cb.circuitbreaker.checkperiod=10s"
  - "traefik.http.middlewares.cb.circuitbreaker.fallbackduration=30s"
```

Monitor circuit breaker trips in LogTide:

```
service:traefik AND DownstreamStatus:503 AND message:*circuit*
```

## Access Log Fields Reference

Traefik JSON access logs include these fields:

| Field | Description | Example |
|-------|-------------|---------|
| `StartUTC` | Request start time | `2025-01-15T10:30:00Z` |
| `Duration` | Total request duration (ns) | `45000000` |
| `RouterName` | Matched router name | `my-app@docker` |
| `ServiceName` | Backend service name | `my-app@docker` |
| `ServiceURL` | Backend URL | `http://172.18.0.3:8080` |
| `DownstreamStatus` | Response status code | `200` |
| `DownstreamContentSize` | Response body size | `1234` |
| `RequestMethod` | HTTP method | `GET` |
| `RequestPath` | Request path | `/api/users` |
| `RequestProtocol` | HTTP version | `HTTP/2.0` |
| `ClientAddr` | Client IP and port | `192.168.1.100:54321` |
| `ClientHost` | Client IP only | `192.168.1.100` |
| `RequestCount` | Request count on connection | `5` |
| `entryPointName` | Traefik entrypoint | `websecure` |
| `TLSVersion` | TLS version used | `1.3` |
| `TLSCipher` | TLS cipher suite | `TLS_AES_128_GCM_SHA256` |

## Detection Rules

Create alerts for common Traefik issues:

### High Error Rate

```
service:traefik AND DownstreamStatus:>=500
```

Threshold: >20 errors in 5 minutes.

### Slow Backend Responses

```
service:traefik AND Duration:>2000000000
```

Requests where the backend took longer than 2 seconds (duration is in nanoseconds).

### Potential DDoS or Scan

```
service:traefik AND DownstreamStatus:404
```

Threshold: >200 in 1 minute from the same `ClientHost`.

### TLS Errors

```
service:traefik AND log_type:application AND msg:*TLS*
```

Catch certificate issues and TLS handshake failures.

### Service Down

```
service:traefik AND DownstreamStatus:502
```

Backend service unreachable - often indicates a crashed container or misconfigured service discovery.

## Fluent Bit Alternative

If you prefer Fluent Bit over Vector:

```ini
# /etc/fluent-bit/fluent-bit.conf
[SERVICE]
    Flush         5
    Log_Level     info
    Parsers_File  parsers.conf

[INPUT]
    Name          tail
    Path          /var/log/traefik/access.log
    Tag           traefik.access
    Refresh_Interval 5

[INPUT]
    Name          tail
    Path          /var/log/traefik/traefik.log
    Tag           traefik.app
    Refresh_Interval 5

[FILTER]
    Name          parser
    Match         traefik.*
    Key_Name      log
    Parser        json
    Reserve_Data  On

[FILTER]
    Name          modify
    Match         traefik.*
    Add           service traefik

[FILTER]
    Name          lua
    Match         traefik.access
    script        /etc/fluent-bit/traefik_level.lua
    call          set_level

[OUTPUT]
    Name          http
    Match         traefik.*
    Host          YOUR_LOGTIDE_HOST
    Port          443
    URI           /api/v1/ingest/single
    Format        json
    Header        X-API-Key ${LOGTIDE_API_KEY}
    Header        Content-Type application/json
    tls           On
    tls.verify    On
    Retry_Limit   5
```

Create `/etc/fluent-bit/traefik_level.lua`:

```lua
function set_level(tag, timestamp, record)
    local status = tonumber(record["DownstreamStatus"]) or 0
    if status >= 500 then
        record["level"] = "error"
    elseif status >= 400 then
        record["level"] = "warn"
    else
        record["level"] = "info"
    end
    record["message"] = string.format(
        "%s %s %d",
        record["RequestMethod"] or "GET",
        record["RequestPath"] or "/",
        status
    )
    return 1, timestamp, record
end
```

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Access log overhead | <1ms per request | JSON format with buffering |
| Disk I/O | ~400 bytes/request | With default field set |
| Vector memory | ~50MB | Tailing two log files |
| Fluent Bit memory | ~30MB | Alternative forwarder |
| Buffering size | 100 (recommended) | Flush every 100 entries |

## Troubleshooting

### Access logs not being written

1. Verify access logging is enabled:
   ```bash
   # Check Traefik dashboard or API
   curl http://localhost:8080/api/rawdata/overview | jq .
   ```

2. Check Traefik logs for configuration errors:
   ```bash
   docker logs traefik 2>&1 | grep -i "access"
   ```

3. Ensure the log directory exists and is writable:
   ```bash
   docker exec traefik ls -la /var/log/traefik/
   ```

### Logs arriving but fields are missing

Verify your field configuration allows the fields you need:

```yaml
accessLog:
  fields:
    defaultMode: keep  # Change from "drop" to "keep"
```

### Vector not shipping logs

1. Check Vector status:
   ```bash
   vector top
   # Or check systemd
   sudo systemctl status vector
   ```

2. Verify Vector can read the log file:
   ```bash
   docker exec vector cat /var/log/traefik/access.log | head -5
   ```

3. Test LogTide connectivity:
   ```bash
   curl -X POST https://YOUR_LOGTIDE_HOST/api/v1/ingest \
     -H "X-API-Key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"logs":[{"service":"test","level":"info","message":"traefik test"}]}'
   ```

### High memory usage with buffering

Reduce the buffering size if memory is a concern:

```yaml
accessLog:
  bufferingSize: 50  # Default is 0 (synchronous), 100 recommended
```

## Next Steps

- [Docker Integration](/integrations/docker/) - Container log collection patterns
- [Docker Compose Integration](/integrations/docker-compose/) - Multi-service logging
- [Kubernetes Integration](/integrations/kubernetes/) - Cluster-wide log aggregation
- [Security Monitoring](/use-cases/security-monitoring/) - Build alerting rules for Traefik events
- [Real-Time Alerting](/use-cases/real-time-alerting/) - Get notified on traffic anomalies
