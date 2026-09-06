---
title: "Host System Monitoring Integration"
description: "Collect CPU, memory, disk I/O, and network metrics from your host machine using OTLP-compatible tools and visualize them in the LogTide Metrics Explorer."
category: "infrastructure"
difficulty: "easy"
brandIcon: "lucide:activity"
highlights:
  - "Standard OTLP endpoint"
  - "CPU, RAM, disk, network"
  - "Metrics Explorer charts"
  - "Bring your own collector"
relatedIntegrations:
  - "docker"
  - "docker-compose"
  - "systemd"
relatedUseCases:
  - "real-time-alerting"
  - "microservices-observability"
keywords:
  - "host monitoring"
  - "system metrics"
  - "cpu monitoring"
  - "memory monitoring"
  - "disk monitoring"
  - "server monitoring"
  - "fluent bit metrics"
  - "otlp metrics"
  - "opentelemetry metrics"
faqs:
  - question: "What metrics does LogTide collect from a host machine?"
    answer: "Using the included Fluent Bit configuration, LogTide collects CPU utilisation, user and system CPU percentages, memory usage and total, disk read and write throughput, and network received and transmitted data. All metrics appear under the service name host-system in the Metrics Explorer."
  - question: "Do I have to use Fluent Bit to send host metrics to LogTide?"
    answer: "No. LogTide exposes a standard OpenTelemetry OTLP endpoint at /v1/otlp/metrics, so you can use any OTLP-compatible tool such as the OpenTelemetry Collector, Grafana Alloy, Vector, or even application OTel SDKs. Fluent Bit is simply included in the Docker Compose setup for zero-config convenience."
  - question: "How do I start collecting host metrics with the Docker Compose setup?"
    answer: "Download fluent-bit-metrics.conf and format_metrics.lua into the same directory as your docker-compose.yml, add your FLUENT_BIT_API_KEY to the .env file, and run docker compose --profile metrics up -d. You can combine it with log collection by starting both the logging and metrics profiles together."
  - question: "Will host metrics work on macOS or Windows with Docker Desktop?"
    answer: "System metrics via Fluent Bit require the Linux /proc filesystem and will not reflect the actual host on macOS or Windows Docker Desktop because the container sees the VM's /proc rather than the host. Use the OpenTelemetry Collector with its hostmetrics receiver as an alternative on those platforms."
---

Monitor your host machine's health by collecting system metrics and viewing them in the LogTide Metrics Explorer. LogTide accepts metrics via the standard **OpenTelemetry (OTLP)** endpoint, so you can use Fluent Bit (included in Docker Compose), or any OTLP-compatible tool you already have.

## Standard OTLP Endpoint

LogTide exposes a standard OpenTelemetry metrics endpoint:

```
POST /v1/otlp/metrics
Content-Type: application/json
X-API-Key: <your-api-key>
```

This means you are **not limited to Fluent Bit**. Any tool that speaks OTLP can send metrics to LogTide:

| Tool | Description |
|------|-------------|
| **Fluent Bit** | Included in Docker Compose (`--profile metrics`), zero config |
| **OpenTelemetry Collector** | The standard OTel collector with `otlphttp` exporter |
| **Grafana Alloy / Agent** | Grafana's collector, supports OTLP export |
| **Vector** | Datadog's collector, supports OTLP export |
| **Prometheus + OTLP remote write** | Export Prometheus metrics to LogTide |
| **Application OTel SDKs** | Node.js, Python, Go, Java - send custom metrics directly |

## Option A: Fluent Bit (included, zero config)

The Docker Compose setup includes a pre-configured Fluent Bit metrics container that collects CPU, memory, disk, and network metrics automatically.

### 1. Download configuration files

```bash
curl -O https://raw.githubusercontent.com/logtide-dev/logtide/main/docker/fluent-bit-metrics.conf
curl -O https://raw.githubusercontent.com/logtide-dev/logtide/main/docker/format_metrics.lua
```

Place these in the same directory as your `docker-compose.yml`.

### 2. Set your API key

```bash
# Add to your .env file (if not already set)
echo "FLUENT_BIT_API_KEY=lp_your_api_key_here" >> .env
```

### 3. Start with metrics profile

```bash
# Metrics only
docker compose --profile metrics up -d

# Or combine with Docker log collection
docker compose --profile logging --profile metrics up -d
```

## Option B: OpenTelemetry Collector

If you already run an OpenTelemetry Collector, add LogTide as an OTLP HTTP exporter:

```yaml
# otel-collector-config.yaml
receivers:
  hostmetrics:
    collection_interval: 30s
    scrapers:
      cpu:
      memory:
      disk:
      network:

exporters:
  otlphttp/logtide:
    endpoint: http://<logtide-host>:8080
    headers:
      X-API-Key: "lp_your_api_key_here"

service:
  pipelines:
    metrics:
      receivers: [hostmetrics]
      exporters: [otlphttp/logtide]
```

## Option C: Grafana Alloy

```hcl
otelcol.receiver.hostmetrics "default" {
  collection_interval = "30s"
  scrapers {
    cpu {}
    memory {}
    disk {}
    network {}
  }
}

otelcol.exporter.otlphttp "logtide" {
  client {
    endpoint = "http://<logtide-host>:8080"
    headers  = { "X-API-Key" = "lp_your_api_key_here" }
  }
}
```

## Option D: Any OTLP-compatible tool

Point any OTLP HTTP exporter at:

```
http://<logtide-host>:8080/v1/otlp/metrics
```

With header `X-API-Key: <your-api-key>`. Both JSON and Protobuf content types are supported.

## What gets collected (Fluent Bit)

The included Fluent Bit configuration sends OTLP gauge metrics every 30-60 seconds:

| Metric Name | Interval | Description |
|------------|----------|-------------|
| `system.cpu.utilization` | 30s | Total CPU usage % |
| `system.cpu.user` | 30s | User CPU % |
| `system.cpu.system` | 30s | System CPU % |
| `system.memory.utilization` | 30s | Memory usage % |
| `system.memory.usage` | 30s | Memory used (MB) |
| `system.memory.total` | 30s | Total memory (MB) |
| `system.disk.read` | 60s | Disk read throughput (KB) |
| `system.disk.write` | 60s | Disk write throughput (KB) |
| `system.network.rx` | 30s | Network received per interval (KB) |
| `system.network.tx` | 30s | Network transmitted per interval (KB) |

All metrics appear under service `host-system` in the Metrics Explorer.

## Auto-detection (Fluent Bit)

The Lua script automatically detects the primary disk device and network interface by reading /proc:

- **Disk**: Reads /proc/diskstats, selects the device with the most I/O activity. Skips partitions (sda1), loop devices, and device-mapper entries.
- **Network**: Reads /proc/net/dev, selects the interface with the most traffic. Skips lo (loopback).

Detection runs once and caches the result for the lifetime of the container. If your primary device changes, restart the metrics container:

```bash
docker compose restart fluent-bit-metrics
```

## Viewing metrics

Metrics appear in the **Metrics Explorer** in the LogTide dashboard (`/dashboard/metrics`). You can:

- Browse all metric names
- Filter by service (`host-system` for Fluent Bit, or your custom service name)
- View time-series charts for any metric
- Compare metrics across services

## Configuration

### Adjusting collection intervals (Fluent Bit)

Edit `fluent-bit-metrics.conf` to change how often metrics are collected:

```ini
[INPUT]
    Name         cpu
    Tag          metrics.cpu
    Interval_Sec 10   # Every 10 seconds instead of 30
```

### Flush interval

The Flush setting in the [SERVICE] section controls how often metrics are sent to LogTide. Default is 30 seconds.

## Troubleshooting

### Metrics not appearing

1. Check the container is running:
```bash
docker compose ps fluent-bit-metrics
```

2. Check logs for errors:
```bash
docker compose logs fluent-bit-metrics
```

3. Verify API key is set:
```bash
grep FLUENT_BIT_API_KEY .env
```

4. Look for HTTP status codes in the logs - `200` means metrics are being accepted.

### Platform limitations

System metrics via Fluent Bit require Linux /proc filesystem. They won't work on macOS or Windows Docker Desktop (the container sees the VM's /proc, not the host's). Use the OpenTelemetry Collector with hostmetrics receiver as an alternative on those platforms.

## Next Steps

- [Docker Log Collection](/integrations/docker/) - Collect container logs alongside metrics
- [OpenTelemetry](/docs/opentelemetry/) - Send traces and logs via OTLP
- [Real-Time Alerting](/use-cases/real-time-alerting/) - Set up alerts for metric thresholds
- [systemd Journal](/integrations/systemd/) - Collect system service logs
