---
title: "Host System Monitoring Integration"
description: "Collect CPU, memory, disk I/O, and network metrics from your host machine and send them to LogTide as structured logs."
category: "infrastructure"
difficulty: "easy"
brandIcon: "lucide:activity"
highlights:
  - "Zero-config auto-detection"
  - "CPU, RAM, disk, network"
  - "Alert on thresholds"
  - "No extra tools needed"
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
---

Monitor your host machine's health by collecting system metrics and sending them to LogTide as structured logs. Uses Fluent Bit's native input plugins with auto-detection of disk and network devices.

## Why monitor host metrics in LogTide?

- **Single pane of glass**: Application logs and system metrics in one place
- **Zero config**: Disk and network devices are auto-detected from /proc
- **Alert on thresholds**: Create alert rules for high CPU, low memory, disk I/O spikes
- **No extra tools**: No Prometheus, Grafana, or node_exporter needed
- **Lightweight**: Fluent Bit uses ~5MB RAM for metrics collection

## Prerequisites

- LogTide instance running (self-hosted)
- Docker Compose setup with LogTide
- API key from LogTide dashboard
- Linux host (metrics read from /proc)

## Quick Start

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

## What gets collected

Metrics are sent as structured logs every 30-60 seconds:

| Service | Interval | Data |
|---------|----------|------|
| host-cpu | 30s | Total CPU %, user %, system %, per-core stats |
| host-memory | 30s | Used/free/total RAM, swap usage, usage percentage |
| host-disk | 60s | Read/write KB for the primary disk device |
| host-network | 30s | RX/TX bytes per interval, packets, errors |

### Example log entries

**CPU metric:**
```json
{
  "service": "host-cpu",
  "level": "info",
  "message": "CPU usage: 12.5% (user: 8.2%, system: 4.3%)",
  "metadata": { "cpu_p": 12.5, "user_p": 8.2, "system_p": 4.3 }
}
```

**Memory metric (high usage warning):**
```json
{
  "service": "host-memory",
  "level": "warn",
  "message": "Memory usage: 92.3% (7384 MB used / 8000 MB total)",
  "metadata": { "total_kb": 8192000, "used_kb": 7561216, "usage_pct": 92.3 }
}
```

## Auto-detection

The Lua script automatically detects the primary disk device and network interface by reading /proc:

- **Disk**: Reads /proc/diskstats, selects the device with the most I/O activity. Skips partitions (sda1), loop devices, and device-mapper entries.
- **Network**: Reads /proc/net/dev, selects the interface with the most traffic. Skips lo (loopback).

Detection runs once and caches the result for the lifetime of the container. If your primary device changes, restart the metrics container:

```bash
docker compose restart fluent-bit-metrics
```

## Filtering metrics in LogTide

Use the search bar to filter by metric type:

- **All metrics**: filter by service `host-cpu`, `host-memory`, `host-disk`, or `host-network`
- **High resource usage**: filter by level `warn`

## Alert rules

Create alert rules in LogTide to get notified when thresholds are exceeded.

The metrics Lua script automatically sets level to `warn` when:
- CPU usage exceeds 90%
- Memory usage exceeds 90%
- Network errors are detected

**High CPU alert example:**
- Service filter: `host-cpu`
- Level filter: `warn`
- Threshold: 1 occurrence in 5 minutes
- Notification: Email or webhook

**High memory alert example:**
- Service filter: `host-memory`
- Level filter: `warn`
- Threshold: 3 occurrences in 5 minutes (sustained high memory)

## Configuration

### Adjusting collection intervals

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

### No network metrics

Network metrics read from /host/proc/net/dev which is the host's proc filesystem mounted into the container. If the mount is missing, network metrics will show "no data available".

### Platform limitations

System metrics require Linux /proc filesystem. They won't work on macOS or Windows Docker Desktop (the container sees the VM's /proc, not the host's).

## Next Steps

- [Docker Log Collection](/integrations/docker) - Collect container logs alongside metrics
- [Real-Time Alerting](/use-cases/real-time-alerting) - Set up alerts for metric thresholds
- [systemd Journal](/integrations/systemd) - Collect system service logs
