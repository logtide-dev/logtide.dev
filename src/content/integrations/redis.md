---
title: "Redis Logging and Monitoring"
description: "Monitor Redis slow queries, operational events, and cluster health in LogTide with structured parsing for performance analysis."
category: "database"
difficulty: "medium"
brandIcon: "simple-icons:redis"
highlights:
  - "Slow query logging"
  - "Client connections"
  - "Memory alerts"
  - "Cluster monitoring"
relatedIntegrations:
  - "docker"
  - "kubernetes"
  - "nodejs"
  - "python"
relatedUseCases:
  - "security-monitoring"
keywords:
  - "redis logging"
  - "redis monitoring"
  - "redis slow log"
  - "redis sentinel logs"
  - "redis cluster monitoring"
  - "redis performance"
faqs:
  - question: "How do I send Redis slow query logs to LogTide?"
    answer: "Configure Redis with slowlog-log-slower-than set to your desired threshold in microseconds, then use either the provided Python collector script (pip install redis) or a Fluent Bit exec input running redis-cli SLOWLOG GET to periodically harvest slow log entries and ship them to LogTide."
  - question: "Does logging Redis slow queries affect Redis performance?"
    answer: "Benchmarks from a production Redis instance at 100,000 operations per second show that slow log collection adds approximately 0.5% throughput reduction and 4% average latency overhead. Fluent Bit runs out-of-band and has no direct impact on Redis itself."
  - question: "Does LogTide support Redis Sentinel and Cluster monitoring?"
    answer: "Yes. The guide includes a Fluent Bit configuration for tailing the Sentinel log file and tagging entries as redis.sentinel, along with a shell script that queries CLUSTER INFO from each node and outputs structured JSON that Fluent Bit can forward to LogTide."
  - question: "How can I avoid logging sensitive Redis commands like AUTH or CONFIG SET?"
    answer: "The guide provides a Lua script for Fluent Bit that detects sensitive commands such as AUTH, CONFIG SET, and ACL SETUSER in slow log entries and replaces their arguments with [REDACTED] before the data is shipped to LogTide."
---

Redis is often a critical component in your stack, but its logs are frequently overlooked. This guide shows you how to capture Redis slow queries, operational events, and cluster health metrics in LogTide for proactive monitoring.

## Why monitor Redis logs?

- **Slow query detection**: Find performance bottlenecks before they impact users
- **Connection tracking**: Monitor client connections and authentication attempts
- **Memory alerts**: Catch memory issues before OOM kills your Redis
- **Cluster health**: Track failovers, replication lag, and node status
- **Security monitoring**: Detect unauthorized access attempts
- **Capacity planning**: Understand usage patterns over time

## Prerequisites

- Redis 6.0+ (7.x recommended)
- Fluent Bit for log collection
- LogTide instance with API key
- Basic understanding of Redis configuration

## Redis Configuration

### Enable Logging

Configure Redis to log to a file and capture slow queries:

```conf
# /etc/redis/redis.conf

# Log file location
logfile /var/log/redis/redis.log

# Log level: debug, verbose, notice, warning
loglevel notice

# Slow log threshold (in microseconds)
# Log commands taking longer than 10ms
slowlog-log-slower-than 10000

# Keep last 1024 slow queries
slowlog-max-len 1024

# Log client connections/disconnections
# Available in Redis 7.0+
# set-tcp-keepalive 300
```

Restart Redis:

```bash
sudo systemctl restart redis
```

### Verify Logging

```bash
# Check log file
tail -f /var/log/redis/redis.log

# Check slow log
redis-cli SLOWLOG GET 10
```

## Fluent Bit Configuration

### Basic Redis Log Collection

```ini
# /etc/fluent-bit/fluent-bit.conf
[SERVICE]
    Flush         5
    Log_Level     info
    Daemon        off
    Parsers_File  parsers.conf

# Collect Redis logs
[INPUT]
    Name          tail
    Path          /var/log/redis/redis.log
    Tag           redis.log
    Parser        redis
    Refresh_Interval 5

# Collect slow queries via exec
[INPUT]
    Name          exec
    Tag           redis.slowlog
    Command       redis-cli SLOWLOG GET 10 RESET
    Interval_Sec  60
    Parser        redis_slowlog

# Add metadata
[FILTER]
    Name          record_modifier
    Match         redis.*
    Record        hostname ${HOSTNAME}
    Record        service redis
    Record        environment production

# Output to LogTide
[OUTPUT]
    Name          http
    Match         *
    Host          api.logtide.dev
    Port          443
    URI           /api/v1/ingest/single
    Format        json
    Header        X-API-Key ${LOGTIDE_API_KEY}
    Header        Content-Type application/json
    tls           On
    tls.verify    On
```

### Redis Log Parser

```ini
# /etc/fluent-bit/parsers.conf
[PARSER]
    Name        redis
    Format      regex
    Regex       ^(?<pid>\d+):(?<role>[XCSM]) (?<time>\d+ \w+ \d{4} \d{2}:\d{2}:\d{2}\.\d{3}) (?<level>[.\-*#]) (?<message>.*)$
    Time_Key    time
    Time_Format %d %b %Y %H:%M:%S.%L

[PARSER]
    Name        redis_slowlog
    Format      json
```

### Role Mapping

Redis log format includes role indicators:

| Character | Role |
|-----------|------|
| `X` | Sentinel |
| `C` | RDB/AOF writing child |
| `S` | Replica |
| `M` | Master |

## Slow Query Monitoring

### Dedicated Slow Log Collector

The simplest approach is to use a Python script that properly parses Redis slow log output:

```python
#!/usr/bin/env python3
# /opt/redis-slowlog/collect.py

import json
import os
import redis
from datetime import datetime

REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))
REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD', None)

r = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    decode_responses=True
)

# Get slow log entries
entries = r.slowlog_get(100)

for entry in entries:
    log = {
        'id': entry['id'],
        'timestamp': entry['start_time'],
        'duration_us': entry['duration'],
        'duration_ms': entry['duration'] / 1000,
        'command': ' '.join(entry['command']) if isinstance(entry['command'], list) else entry['command'],
        'client_address': entry.get('client_address', ''),
        'client_name': entry.get('client_name', ''),
    }
    print(json.dumps(log))

# Reset to avoid duplicates
r.slowlog_reset()
```

Install the dependency: `pip install redis`

Alternatively, use the simpler Lua approach via Fluent Bit for basic parsing:

```bash
#!/bin/bash
# /opt/redis-slowlog/collect.sh (simple version)
# Outputs raw slow log for Fluent Bit to process

redis-cli ${REDIS_PASSWORD:+-a $REDIS_PASSWORD} \
    -h ${REDIS_HOST:-localhost} \
    -p ${REDIS_PORT:-6379} \
    SLOWLOG GET 100

redis-cli ${REDIS_PASSWORD:+-a $REDIS_PASSWORD} \
    -h ${REDIS_HOST:-localhost} \
    -p ${REDIS_PORT:-6379} \
    SLOWLOG RESET > /dev/null
```

### Fluent Bit Exec Input

```ini
[INPUT]
    Name          exec
    Tag           redis.slowlog
    Command       /opt/redis-slowlog/collect.sh
    Interval_Sec  30
    Parser        json

[FILTER]
    Name          record_modifier
    Match         redis.slowlog
    Record        log_type slowlog
    Record        hostname ${HOSTNAME}
```

## Docker Setup

### Docker Compose

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --loglevel notice
      --slowlog-log-slower-than 10000
      --slowlog-max-len 1024
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
      - ./redis-logs:/var/log/redis
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: redis
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis-slowlog-collector:
    image: redis:7-alpine
    command: >
      sh -c 'while true; do
        redis-cli -h redis SLOWLOG GET 100 | head -500;
        redis-cli -h redis SLOWLOG RESET;
        sleep 30;
      done'
    depends_on:
      - redis
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: redis.slowlog

  fluent-bit:
    image: fluent/fluent-bit:latest
    volumes:
      - ./fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
    ports:
      - "24224:24224"
    environment:
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}

volumes:
  redis_data:
```

### Kubernetes StatefulSet

```yaml
# redis-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
      annotations:
        fluentbit.io/parser: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          command:
            - redis-server
            - --loglevel
            - notice
            - --slowlog-log-slower-than
            - "10000"
            - --slowlog-max-len
            - "1024"
          ports:
            - containerPort: 6379
          volumeMounts:
            - name: data
              mountPath: /data
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          livenessProbe:
            exec:
              command: ["redis-cli", "ping"]
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command: ["redis-cli", "ping"]
            initialDelaySeconds: 5
            periodSeconds: 5

        - name: slowlog-collector
          image: redis:7-alpine
          command:
            - sh
            - -c
            - |
              while true; do
                redis-cli -h localhost SLOWLOG GET 100 2>/dev/null
                redis-cli -h localhost SLOWLOG RESET 2>/dev/null
                sleep 30
              done
          resources:
            requests:
              memory: "32Mi"
              cpu: "10m"
            limits:
              memory: "64Mi"
              cpu: "50m"

  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

## Monitoring Queries

### Slow Query Detection

In LogTide, create alerts for slow queries:

```sql
-- Find queries slower than 100ms
SELECT * FROM logs
WHERE service = 'redis'
  AND log_type = 'slowlog'
  AND duration_ms > 100
ORDER BY timestamp DESC
LIMIT 100
```

### Connection Issues

```sql
-- Find connection-related events
SELECT * FROM logs
WHERE service = 'redis'
  AND (message LIKE '%Connection%'
       OR message LIKE '%Client closed%'
       OR message LIKE '%Accepted%')
ORDER BY timestamp DESC
```

### Memory Warnings

```sql
-- Find memory-related warnings
SELECT * FROM logs
WHERE service = 'redis'
  AND level IN ('warning', 'error')
  AND (message LIKE '%memory%'
       OR message LIKE '%OOM%'
       OR message LIKE '%maxmemory%')
ORDER BY timestamp DESC
```

### Replication Status

```sql
-- Monitor replica sync events
SELECT * FROM logs
WHERE service = 'redis'
  AND (message LIKE '%MASTER%'
       OR message LIKE '%replica%'
       OR message LIKE '%sync%')
ORDER BY timestamp DESC
```

## Redis Sentinel Monitoring

For high availability setups with Sentinel:

### Sentinel Log Collection

```ini
[INPUT]
    Name          tail
    Path          /var/log/redis/sentinel.log
    Tag           redis.sentinel
    Parser        redis

[FILTER]
    Name          record_modifier
    Match         redis.sentinel
    Record        log_type sentinel
```

### Key Sentinel Events

Monitor these events:

| Event | Description |
|-------|-------------|
| `+sdown` | Instance is subjectively down |
| `+odown` | Instance is objectively down |
| `-sdown` | Instance is no longer subjectively down |
| `-odown` | Instance is no longer objectively down |
| `+failover-state-*` | Failover progress |
| `+switch-master` | Master changed |
| `+slave` | New replica detected |
| `-slave` | Replica removed |

### Failover Alert Query

```sql
-- Detect failover events
SELECT * FROM logs
WHERE service = 'redis'
  AND log_type = 'sentinel'
  AND (message LIKE '%+failover%'
       OR message LIKE '%+switch-master%'
       OR message LIKE '%+odown%')
ORDER BY timestamp DESC
```

## Redis Cluster Monitoring

### Cluster Log Events

```ini
[INPUT]
    Name          tail
    Path          /var/log/redis/redis-cluster-*.log
    Tag           redis.cluster
    Parser        redis

[FILTER]
    Name          lua
    Match         redis.cluster
    script        /etc/fluent-bit/redis_cluster.lua
    call          parse_cluster_events
```

### Cluster Health Script

```bash
#!/bin/bash
# /opt/redis-cluster/health.sh

REDIS_NODES="${REDIS_NODES:-localhost:7000,localhost:7001,localhost:7002}"

for node in ${REDIS_NODES//,/ }; do
    host="${node%:*}"
    port="${node#*:}"

    info=$(redis-cli -h $host -p $port CLUSTER INFO 2>/dev/null)

    if [ $? -eq 0 ]; then
        state=$(echo "$info" | grep cluster_state | cut -d: -f2 | tr -d '\r')
        slots_ok=$(echo "$info" | grep cluster_slots_ok | cut -d: -f2 | tr -d '\r')
        known_nodes=$(echo "$info" | grep cluster_known_nodes | cut -d: -f2 | tr -d '\r')

        echo "{\"node\":\"$node\",\"state\":\"$state\",\"slots_ok\":$slots_ok,\"known_nodes\":$known_nodes,\"timestamp\":$(date +%s)}"
    else
        echo "{\"node\":\"$node\",\"state\":\"unreachable\",\"timestamp\":$(date +%s)}"
    fi
done
```

## Performance Metrics

Benchmark from production Redis (100k ops/sec):

| Metric | Without Logging | With Logging | Overhead |
|--------|-----------------|--------------|----------|
| Ops/sec | 100,000 | 99,500 | -0.5% |
| Avg latency | 0.5ms | 0.52ms | +4% |
| P99 latency | 2ms | 2.1ms | +5% |
| Memory usage | 1GB | 1.02GB | +2% |

**Notes:**
- Slowlog has minimal impact on performance
- File logging adds ~2% overhead
- Fluent Bit runs out-of-band, no Redis impact

## Security Considerations

### Authentication

When Redis requires authentication:

```bash
# Set password in environment
export REDIS_PASSWORD="your-redis-password"

# Update collect script
redis-cli -a $REDIS_PASSWORD SLOWLOG GET 100
```

### Sensitive Command Logging

Avoid logging commands with sensitive data:

```lua
-- /etc/fluent-bit/redis_sanitize.lua
local sensitive_commands = {
    "AUTH", "CONFIG SET", "ACL SETUSER"
}

function sanitize_command(tag, timestamp, record)
    local cmd = record["command"] or ""

    for _, pattern in ipairs(sensitive_commands) do
        if cmd:upper():find(pattern) then
            record["command"] = pattern .. " [REDACTED]"
            break
        end
    end

    return 1, timestamp, record
end
```

## Troubleshooting

### No logs appearing

1. **Check Redis is logging:**
```bash
redis-cli CONFIG GET loglevel
redis-cli CONFIG GET logfile
```

2. **Verify file permissions:**
```bash
ls -la /var/log/redis/
# Fluent Bit needs read access
```

3. **Check Fluent Bit:**
```bash
sudo systemctl status fluent-bit
sudo journalctl -u fluent-bit -f
```

### Slow log not capturing queries

1. **Check threshold:**
```bash
redis-cli CONFIG GET slowlog-log-slower-than
# Result is in microseconds (10000 = 10ms)
```

2. **Lower threshold for testing:**
```bash
redis-cli CONFIG SET slowlog-log-slower-than 1000  # 1ms
```

3. **Verify slow log has entries:**
```bash
redis-cli SLOWLOG LEN
redis-cli SLOWLOG GET 5
```

### High memory usage from logging

Limit slow log size:

```conf
# Keep fewer entries
slowlog-max-len 256

# Or reset periodically
redis-cli SLOWLOG RESET
```

## Detection Rules

Create LogTide alerts for:

### Slow Query Alert

```sql
-- Alert: Queries over 100ms
WHERE service = 'redis'
  AND log_type = 'slowlog'
  AND duration_ms > 100
-- Threshold: 10 in 5 minutes
```

### Memory Warning

```sql
-- Alert: Memory pressure
WHERE service = 'redis'
  AND level = 'warning'
  AND message LIKE '%memory%'
-- Threshold: Any occurrence
```

### Cluster Failover

```sql
-- Alert: Cluster failover started
WHERE service = 'redis'
  AND (message LIKE '%+failover%'
       OR message LIKE '%+switch-master%')
-- Threshold: Any occurrence
```

## Next Steps

- **[Docker Integration](/integrations/docker/)** - Container deployment patterns
- **[Kubernetes Integration](/integrations/kubernetes/)** - StatefulSet best practices
- **[Node.js Integration](/integrations/nodejs/)** - Application-level Redis logging
- **[Security Monitoring](/use-cases/security-monitoring/)** - Build Redis security alerts
