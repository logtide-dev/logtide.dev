---
title: "Docker Container Logging Integration"
description: "Send Docker container logs to LogTide using Fluent Bit. Complete setup guide with Docker Compose and Kubernetes examples."
category: "container"
difficulty: "easy"
brandIcon: "simple-icons:docker"
highlights:
  - "5-minute setup"
  - "No code changes required"
  - "Works with any container"
  - "Auto-discovery of containers"
relatedIntegrations:
  - "docker-compose"
  - "nginx"
  - "nodejs"
  - "systemd"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "docker logs"
  - "container logging"
  - "fluent bit docker"
  - "docker log driver"
faqs:
  - question: "How do I send Docker container logs to LogTide?"
    answer: "Run a Fluent Bit container with its forward input listening on port 24224, then start your application containers with --log-driver=fluentd and --log-opt fluentd-address=localhost:24224. Fluent Bit receives the logs and forwards them to LogTide's HTTP ingest endpoint via your API key."
  - question: "Do I need to modify my container images or application code?"
    answer: "No code or image changes are required. LogTide collects whatever your containers write to stdout and stderr through the Fluentd log driver, so the integration works with any language or framework."
  - question: "Does LogTide support structured JSON logs from Docker containers?"
    answer: "Yes. If your application outputs JSON to stdout, the Fluent Bit parser filter with the json parser extracts all fields from the log key and merges them into the record, making every JSON field searchable in LogTide."
  - question: "How resource-intensive is Fluent Bit when collecting Docker logs?"
    answer: "A single Fluent Bit instance uses approximately 50MB of memory and less than 1% CPU at 1,000 logs per second. For higher volumes, the guide recommends running multiple Fluent Bit instances behind a load balancer or enabling the batch ingest endpoint with buffering."
---

Collecting logs from Docker containers is essential for debugging, monitoring, and security. This guide shows you how to send container logs to LogTide using Fluent Bit - no code changes required.

## Why send Docker logs to LogTide?

- **Centralized visibility**: All container logs in one place with powerful search
- **No agent per container**: Single Fluent Bit instance collects from all containers
- **Automatic service detection**: Container names become service names in LogTide
- **Privacy-first**: Logs stay in your infrastructure with GDPR-compliant storage
- **Real-time tailing**: Watch logs stream in with live tail feature

## Prerequisites

- Docker 19.03+ or Docker Compose v2+
- LogTide instance running (self-hosted or cloud)
- API key from LogTide dashboard

## Quick Start (5 minutes)

The fastest way to get Docker logs into LogTide is using Fluent Bit as a sidecar or system-level collector.

### Step 1: Create Fluent Bit Configuration

Create a file named `fluent-bit.conf`:

```ini
[SERVICE]
    Flush         1
    Log_Level     info
    Parsers_File  parsers.conf

[INPUT]
    Name          forward
    Listen        0.0.0.0
    Port          24224

[OUTPUT]
    Name          http
    Match         *
    Host          YOUR_LOGTIDE_HOST
    Port          443
    URI           /api/v1/ingest/single
    Format        json_lines
    Header        X-API-Key YOUR_API_KEY
    Header        Content-Type application/x-ndjson
    Json_date_key time
    Json_date_format iso8601
    tls           On
```

Replace `YOUR_LOGTIDE_HOST` with your LogTide API endpoint (e.g., `api.logtide.dev` or your self-hosted domain) and `YOUR_API_KEY` with your project API key.

### Step 2: Run Fluent Bit with Docker

```bash
docker run -d \
  --name fluent-bit \
  -p 24224:24224 \
  -v $(pwd)/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf \
  fluent/fluent-bit:latest
```

### Step 3: Configure Docker to use Fluent Bit

Run containers with the Fluentd log driver:

```bash
docker run -d \
  --name my-app \
  --log-driver=fluentd \
  --log-opt fluentd-address=localhost:24224 \
  --log-opt tag="{{.Name}}" \
  your-image:latest
```

That's it! Your container logs should now appear in LogTide within seconds.

## Production Setup with Docker Compose

For production, use Docker Compose to manage both Fluent Bit and your application containers.

### docker-compose.yml

```yaml
version: "3.8"

services:
  fluent-bit:
    image: fluent/fluent-bit:latest
    container_name: fluent-bit
    volumes:
      - ./fluent-bit/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf
      - ./fluent-bit/parsers.conf:/fluent-bit/etc/parsers.conf
    ports:
      - "24224:24224"
    restart: unless-stopped

  web:
    image: nginx:alpine
    container_name: web
    logging:
      driver: fluentd
      options:
        fluentd-address: "localhost:24224"
        tag: "web"
    depends_on:
      - fluent-bit
    ports:
      - "80:80"

  api:
    build: ./api
    container_name: api
    logging:
      driver: fluentd
      options:
        fluentd-address: "localhost:24224"
        tag: "api"
    depends_on:
      - fluent-bit
    environment:
      - NODE_ENV=production
```

### Enhanced Fluent Bit Configuration

For production, use a more robust configuration with parsing and buffering:

```ini
[SERVICE]
    Flush         1
    Log_Level     info
    Daemon        off
    Parsers_File  parsers.conf
    HTTP_Server   On
    HTTP_Listen   0.0.0.0
    HTTP_Port     2020

# Accept logs from Docker containers
[INPUT]
    Name          forward
    Listen        0.0.0.0
    Port          24224
    Buffer_Chunk_Size 1M
    Buffer_Max_Size   6M

# Parse JSON logs if your app outputs structured logs
[FILTER]
    Name          parser
    Match         *
    Key_Name      log
    Parser        json
    Reserve_Data  On

# Add container metadata
[FILTER]
    Name          modify
    Match         *
    Add           source docker
    Add           environment production

# Add required fields for LogTide
[FILTER]
    Name          modify
    Match         *
    Add           level info
    Rename        log message
    Copy          container_name service

# Send to LogTide
[OUTPUT]
    Name          http
    Match         *
    Host          YOUR_LOGTIDE_HOST
    Port          443
    URI           /api/v1/ingest/single
    Format        json_lines
    Header        X-API-Key YOUR_API_KEY
    Header        Content-Type application/x-ndjson
    Json_date_key time
    Json_date_format iso8601
    tls           On
    tls.verify    On
    Retry_Limit   5
```

### parsers.conf

```ini
[PARSER]
    Name        json
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L%z

[PARSER]
    Name        docker
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L%z
```

## Kubernetes Setup

For Kubernetes deployments, use a DaemonSet to collect logs from all nodes.

### fluent-bit-daemonset.yaml

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: logging
  labels:
    app: fluent-bit
spec:
  selector:
    matchLabels:
      app: fluent-bit
  template:
    metadata:
      labels:
        app: fluent-bit
    spec:
      serviceAccountName: fluent-bit
      containers:
      - name: fluent-bit
        image: fluent/fluent-bit:latest
        ports:
        - containerPort: 2020
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
        - name: config
          mountPath: /fluent-bit/etc/
        env:
        - name: LOGTIDE_HOST
          valueFrom:
            secretKeyRef:
              name: logtide-credentials
              key: host
        - name: LOGTIDE_API_KEY
          valueFrom:
            secretKeyRef:
              name: logtide-credentials
              key: api-key
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
      - name: config
        configMap:
          name: fluent-bit-config
```

Create the secret for your API key:

```bash
kubectl create secret generic logtide-credentials \
  --namespace=logging \
  --from-literal=host=api.logtide.dev \
  --from-literal=api-key=YOUR_API_KEY
```

## Verification

Check that logs are arriving in LogTide:

1. Open LogTide dashboard and navigate to your project
2. Use the search bar to filter by service name (container name)
3. Enable live tail to see new logs in real-time

### Debugging

If logs aren't appearing, check Fluent Bit status:

```bash
# Check Fluent Bit logs
docker logs fluent-bit

# Verify Fluent Bit is receiving logs
curl http://localhost:2020/api/v1/metrics/prometheus
```

Common issues:
- **Connection refused**: Ensure LogTide host and port are correct
- **401 Unauthorized**: Check your API key is valid and has ingestion permissions
- **Logs delayed**: Increase `Flush` interval or check network latency

## Performance Considerations

| Metric | Value | Notes |
|--------|-------|-------|
| Memory | ~50MB | Per Fluent Bit instance |
| CPU | <1% | At 1000 logs/second |
| Network | ~1KB per log | Average with metadata |
| Latency | <100ms | From container to LogTide |

For high-volume environments (>10,000 logs/second), consider:
- Running multiple Fluent Bit instances behind a load balancer
- Enabling compression in the HTTP output
- Using the batch endpoint (`/api/v1/ingest`) with buffering

## Detection Rules

Once your Docker logs are in LogTide, create detection rules for common issues:

**Container restart detection:**
```
service:* AND message:"container restart"
```

**Out of memory errors:**
```
level:error AND message:"out of memory"
```

**Failed health checks:**
```
service:healthcheck AND level:error
```

## Next Steps

- [nginx Integration](/integrations/nginx/) - Detailed nginx log parsing
- [Node.js SDK](/integrations/nodejs/) - Structured logging from Node.js apps
- [GDPR Compliance](/use-cases/gdpr-compliance/) - Privacy-compliant logging
