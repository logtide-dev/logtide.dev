---
title: "RabbitMQ Log and Monitoring Integration"
description: "Forward RabbitMQ server logs, queue metrics, and consumer events to LogTide for centralized message broker observability."
category: "infrastructure"
difficulty: "medium"
brandIcon: "simple-icons:rabbitmq"
highlights:
  - "Server & queue logging"
  - "Dead letter tracking"
  - "Consumer monitoring"
  - "Cluster health alerts"
relatedIntegrations:
  - "docker"
  - "docker-compose"
  - "nodejs"
relatedUseCases:
  - "incident-response"
  - "real-time-alerting"
keywords:
  - "rabbitmq logging"
  - "rabbitmq log management"
  - "rabbitmq monitoring"
  - "message queue logging"
  - "rabbitmq dead letter"
  - "rabbitmq cluster monitoring"
faqs:
  - question: "How do I forward RabbitMQ server logs to LogTide?"
    answer: "Enable JSON structured logging in rabbitmq.conf by setting log.file.formatter to json, then run Fluent Bit with the tail input pointed at /var/log/rabbitmq/rabbit.log and the HTTP output configured with your LogTide API key. RabbitMQ 3.9 or later is required for native JSON log formatting."
  - question: "How can I monitor dead letter queues with LogTide?"
    answer: "Deploy the provided dead-letter-monitor TypeScript service, which connects to your dead-letters queue via amqplib, reads failed messages, and ships each one as a structured log event with the original queue, death reason, and routing key to LogTide via the HTTP ingest API."
  - question: "Can I collect RabbitMQ queue depth and consumer metrics, not just text logs?"
    answer: "Yes. The guide provides a Python metrics collector that queries the RabbitMQ Management HTTP API every 30 seconds to collect queue depth, consumer count, publish rate, and node health, then ships those as structured log events to LogTide. The management plugin must be enabled."
  - question: "What is the performance overhead of adding LogTide monitoring to RabbitMQ?"
    answer: "JSON log formatting adds less than 1% overhead compared to the default format. The Python metrics collector uses around 30 MB of memory and under 1% CPU when running every 30 seconds, and the dead letter monitor uses around 20 MB as a Node.js AMQP consumer."
---

RabbitMQ is a widely used message broker that sits at the heart of event-driven architectures. When queues back up, consumers crash, or messages land in dead letter exchanges, you need centralized visibility. This guide shows you how to forward RabbitMQ server logs, queue metrics, consumer patterns, and dead letter events to LogTide.

## Why use LogTide with RabbitMQ?

- **Queue visibility**: Monitor queue depths, consumer counts, and message rates from a centralized dashboard
- **Dead letter tracking**: Get alerted when messages fail processing and land in dead letter queues
- **Consumer health**: Detect crashed, stuck, or slow consumers before message backlogs grow
- **Cluster monitoring**: Track node health, network partitions, and failover events across your cluster
- **Incident response**: Correlate message broker issues with application errors during outages
- **Audit trail**: Record who published what, when, and which consumers processed each message

## Prerequisites

- RabbitMQ 3.12+ (with management plugin enabled)
- LogTide instance with API key
- Fluent Bit or Vector for log forwarding
- `rabbitmq_management` plugin (for metrics collection)

## Quick Start (10 minutes)

### Step 1: Configure RabbitMQ JSON Logging

RabbitMQ 3.9+ supports structured JSON logging natively. Configure in `rabbitmq.conf`:

```ini
# /etc/rabbitmq/rabbitmq.conf

# Enable JSON log format
log.console = true
log.console.level = info
log.console.formatter = json

# File logging with JSON format
log.file = /var/log/rabbitmq/rabbit.log
log.file.level = info
log.file.formatter = json
log.file.rotation.date = $D0
log.file.rotation.size = 104857600
log.file.rotation.count = 7
```

Or using the advanced config format (`advanced.config`):

```erlang
% /etc/rabbitmq/advanced.config
[
  {rabbit, [
    {log, [
      {file, [{file, "/var/log/rabbitmq/rabbit.log"},
              {level, info},
              {formatter, {rabbit_logger_json_fmt, #{}}},
              {date, "$D0"},
              {size, 104857600},
              {count, 7}]}
    ]}
  ]}
].
```

Restart RabbitMQ:

```bash
sudo systemctl restart rabbitmq-server
```

### Step 2: Set Up Fluent Bit

Create `/etc/fluent-bit/fluent-bit.conf`:

```ini
[SERVICE]
    Flush         5
    Log_Level     info
    Parsers_File  parsers.conf

# RabbitMQ server logs
[INPUT]
    Name          tail
    Path          /var/log/rabbitmq/rabbit.log
    Tag           rabbitmq.server
    Refresh_Interval 5

[FILTER]
    Name          parser
    Match         rabbitmq.server
    Key_Name      log
    Parser        json
    Reserve_Data  On

[FILTER]
    Name          modify
    Match         rabbitmq.*
    Add           service rabbitmq

[FILTER]
    Name          lua
    Match         rabbitmq.server
    script        /etc/fluent-bit/rabbitmq_level.lua
    call          map_level

[OUTPUT]
    Name          http
    Match         rabbitmq.*
    Host          YOUR_LOGTIDE_HOST
    Port          443
    URI           /api/v1/ingest/single
    Format        json
    Header        X-API-Key ${LOGTIDE_API_KEY}
    Header        Content-Type application/json
    tls           On
    tls.verify    On
```

Create `/etc/fluent-bit/rabbitmq_level.lua`:

```lua
function map_level(tag, timestamp, record)
    local level = record["level"] or "info"
    -- RabbitMQ uses Erlang log levels
    local level_map = {
        emergency = "critical",
        alert = "critical",
        critical = "critical",
        error = "error",
        warning = "warn",
        notice = "info",
        info = "info",
        debug = "debug",
    }
    record["level"] = level_map[level] or "info"
    return 1, timestamp, record
end
```

Start Fluent Bit:

```bash
sudo systemctl enable fluent-bit
sudo systemctl start fluent-bit
```

### Step 3: Verify

```bash
# Generate a log event
rabbitmqctl status

# Check in LogTide with filter: service:rabbitmq
```

## Queue Metrics Collection

### Management API Metrics Collector

Use the RabbitMQ Management HTTP API to collect queue metrics and send them to LogTide:

```python
#!/usr/bin/env python3
# /opt/rabbitmq-metrics/collect.py

import json
import os
import time
import requests
from datetime import datetime, timezone

RABBITMQ_HOST = os.environ.get('RABBITMQ_HOST', 'localhost')
RABBITMQ_PORT = os.environ.get('RABBITMQ_MGMT_PORT', '15672')
RABBITMQ_USER = os.environ.get('RABBITMQ_USER', 'guest')
RABBITMQ_PASS = os.environ.get('RABBITMQ_PASS', 'guest')
LOGTIDE_API_URL = os.environ.get('LOGTIDE_API_URL')
LOGTIDE_API_KEY = os.environ.get('LOGTIDE_API_KEY')

BASE_URL = f"http://{RABBITMQ_HOST}:{RABBITMQ_PORT}/api"
AUTH = (RABBITMQ_USER, RABBITMQ_PASS)


def collect_queue_metrics():
    """Collect metrics from all queues."""
    response = requests.get(f"{BASE_URL}/queues", auth=AUTH)
    response.raise_for_status()
    queues = response.json()

    logs = []
    for queue in queues:
        log = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "rabbitmq",
            "log_type": "queue_metrics",
            "level": "info",
            "message": f"Queue metrics: {queue['name']} - {queue.get('messages', 0)} messages",
            "queue_name": queue["name"],
            "vhost": queue["vhost"],
            "messages": queue.get("messages", 0),
            "messages_ready": queue.get("messages_ready", 0),
            "messages_unacked": queue.get("messages_unacknowledged", 0),
            "consumers": queue.get("consumers", 0),
            "publish_rate": queue.get("message_stats", {}).get("publish_details", {}).get("rate", 0),
            "deliver_rate": queue.get("message_stats", {}).get("deliver_get_details", {}).get("rate", 0),
            "ack_rate": queue.get("message_stats", {}).get("ack_details", {}).get("rate", 0),
            "memory": queue.get("memory", 0),
            "state": queue.get("state", "unknown"),
            "durable": queue.get("durable", False),
        }

        # Set level based on queue health
        if queue.get("messages", 0) > 10000:
            log["level"] = "warn"
            log["message"] = f"Queue backlog: {queue['name']} - {queue['messages']} messages"
        if queue.get("consumers", 0) == 0 and queue.get("messages", 0) > 0:
            log["level"] = "error"
            log["message"] = f"Queue has no consumers: {queue['name']} - {queue['messages']} messages"

        logs.append(log)

    return logs


def collect_node_metrics():
    """Collect cluster node health metrics."""
    response = requests.get(f"{BASE_URL}/nodes", auth=AUTH)
    response.raise_for_status()
    nodes = response.json()

    logs = []
    for node in nodes:
        log = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "rabbitmq",
            "log_type": "node_metrics",
            "level": "info",
            "message": f"Node health: {node['name']} - running={node.get('running', False)}",
            "node_name": node["name"],
            "node_type": node.get("type", "disc"),
            "running": node.get("running", False),
            "mem_used": node.get("mem_used", 0),
            "mem_limit": node.get("mem_limit", 0),
            "mem_alarm": node.get("mem_alarm", False),
            "disk_free": node.get("disk_free", 0),
            "disk_free_limit": node.get("disk_free_limit", 0),
            "disk_free_alarm": node.get("disk_free_alarm", False),
            "fd_used": node.get("fd_used", 0),
            "fd_total": node.get("fd_total", 0),
            "sockets_used": node.get("sockets_used", 0),
            "sockets_total": node.get("sockets_total", 0),
            "uptime": node.get("uptime", 0),
        }

        # Alert on resource issues
        if node.get("mem_alarm", False):
            log["level"] = "critical"
            log["message"] = f"Memory alarm on node: {node['name']}"
        elif node.get("disk_free_alarm", False):
            log["level"] = "critical"
            log["message"] = f"Disk free alarm on node: {node['name']}"
        elif not node.get("running", False):
            log["level"] = "error"
            log["message"] = f"Node not running: {node['name']}"

        logs.append(log)

    return logs


def collect_connection_metrics():
    """Collect connection metrics."""
    response = requests.get(f"{BASE_URL}/connections", auth=AUTH)
    response.raise_for_status()
    connections = response.json()

    log = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "rabbitmq",
        "log_type": "connection_metrics",
        "level": "info",
        "message": f"Active connections: {len(connections)}",
        "total_connections": len(connections),
        "connections_by_user": {},
        "connections_by_vhost": {},
    }

    for conn in connections:
        user = conn.get("user", "unknown")
        vhost = conn.get("vhost", "/")
        log["connections_by_user"][user] = log["connections_by_user"].get(user, 0) + 1
        log["connections_by_vhost"][vhost] = log["connections_by_vhost"].get(vhost, 0) + 1

    return [log]


def ship_to_logtide(logs):
    """Send collected metrics to LogTide."""
    if not logs:
        return

    response = requests.post(
        f"{LOGTIDE_API_URL}/api/v1/ingest",
        headers={
            "Content-Type": "application/json",
            "X-API-Key": LOGTIDE_API_KEY,
        },
        json={"logs": logs},
    )

    if not response.ok:
        print(f"LogTide ingest failed: {response.status_code} {response.text}")


if __name__ == "__main__":
    all_logs = []
    all_logs.extend(collect_queue_metrics())
    all_logs.extend(collect_node_metrics())
    all_logs.extend(collect_connection_metrics())
    ship_to_logtide(all_logs)
    print(f"Shipped {len(all_logs)} metric events to LogTide")
```

### Schedule the Collector

Run every 30 seconds via cron or systemd timer:

```ini
# /etc/systemd/system/rabbitmq-metrics.service
[Unit]
Description=RabbitMQ metrics collector for LogTide
After=network.target rabbitmq-server.service

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/rabbitmq-metrics/collect.py
EnvironmentFile=/etc/rabbitmq-metrics/environment
```

```ini
# /etc/systemd/system/rabbitmq-metrics.timer
[Unit]
Description=Run RabbitMQ metrics collector every 30 seconds

[Timer]
OnBootSec=10
OnUnitActiveSec=30

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable rabbitmq-metrics.timer
sudo systemctl start rabbitmq-metrics.timer
```

## Dead Letter Queue Monitoring

### Configure Dead Letter Exchange

Set up dead letter exchanges so failed messages are routed to a monitored queue:

```bash
# Create the dead letter exchange
rabbitmqadmin declare exchange name=dlx type=direct

# Create the dead letter queue
rabbitmqadmin declare queue name=dead-letters durable=true

# Bind DLQ to the exchange
rabbitmqadmin declare binding source=dlx destination=dead-letters routing_key=dead-letter

# Configure your application queue with DLX
rabbitmqadmin declare queue name=orders \
  durable=true \
  arguments='{"x-dead-letter-exchange":"dlx","x-dead-letter-routing-key":"dead-letter","x-message-ttl":300000}'
```

### Dead Letter Consumer for LogTide

```typescript
// dead-letter-monitor.ts
import amqplib from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const LOGTIDE_API_URL = process.env.LOGTIDE_API_URL!;
const LOGTIDE_API_KEY = process.env.LOGTIDE_API_KEY!;

async function startDeadLetterMonitor() {
  const connection = await amqplib.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  // Ensure the dead letter queue exists
  await channel.assertQueue('dead-letters', { durable: true });

  console.log('Dead letter monitor started. Waiting for messages...');

  channel.consume('dead-letters', async (msg) => {
    if (!msg) return;

    const headers = msg.properties.headers || {};
    const deathHistory = headers['x-death'] || [];
    const firstDeath = deathHistory[0] || {};

    const logEvent = {
      timestamp: new Date().toISOString(),
      service: 'rabbitmq',
      log_type: 'dead_letter',
      level: 'error',
      message: `Dead letter from queue: ${firstDeath.queue || 'unknown'}`,
      original_queue: firstDeath.queue,
      original_exchange: firstDeath.exchange,
      death_reason: firstDeath.reason,
      death_count: firstDeath.count || 1,
      routing_key: msg.fields.routingKey,
      content_type: msg.properties.contentType,
      message_id: msg.properties.messageId,
      correlation_id: msg.properties.correlationId,
      app_id: msg.properties.appId,
      payload_size: msg.content.length,
    };

    // Try to parse the message body for additional context
    try {
      const body = JSON.parse(msg.content.toString());
      logEvent.message = `Dead letter: ${firstDeath.reason || 'unknown'} - ${body.type || body.action || 'message'} from ${firstDeath.queue || 'unknown'}`;
    } catch {
      // Binary or non-JSON message
    }

    // Ship to LogTide
    try {
      await fetch(`${LOGTIDE_API_URL}/api/v1/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': LOGTIDE_API_KEY,
        },
        body: JSON.stringify({ logs: [logEvent] }),
      });
    } catch (error) {
      console.error('Failed to ship dead letter to LogTide:', error);
    }

    // Acknowledge the dead letter
    channel.ack(msg);
  });

  // Handle connection errors
  connection.on('error', (err) => {
    console.error('RabbitMQ connection error:', err);
    process.exit(1);
  });
}

startDeadLetterMonitor().catch(console.error);
```

## Consumer Logging Patterns

### Node.js Consumer with LogTide

```typescript
// consumer.ts
import amqplib from 'amqplib';
import { hub } from '@logtide/core';

hub.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'order-consumer',
  environment: process.env.NODE_ENV,
});

async function startConsumer() {
  const connection = await amqplib.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  // Prefetch for controlled consumption
  await channel.prefetch(10);
  await channel.assertQueue('orders', { durable: true });

  hub.captureLog('info', 'Consumer started', {
    queue: 'orders',
    prefetch: 10,
  });

  channel.consume('orders', async (msg) => {
    if (!msg) return;

    const startTime = Date.now();
    const messageId = msg.properties.messageId || 'unknown';

    hub.captureLog('debug', 'Message received', {
      queue: 'orders',
      messageId,
      contentType: msg.properties.contentType,
      redelivered: msg.fields.redelivered,
    });

    try {
      const body = JSON.parse(msg.content.toString());
      await processOrder(body);

      hub.captureLog('info', `Order processed: ${body.orderId}`, {
        queue: 'orders',
        messageId,
        orderId: body.orderId,
        processingTime: Date.now() - startTime,
      });

      channel.ack(msg);
    } catch (error) {
      const err = error as Error;

      hub.captureLog('error', `Order processing failed: ${err.message}`, {
        queue: 'orders',
        messageId,
        error: err.message,
        processingTime: Date.now() - startTime,
        redelivered: msg.fields.redelivered,
      });

      // Requeue once, then dead letter
      if (!msg.fields.redelivered) {
        channel.nack(msg, false, true);  // Requeue
      } else {
        channel.nack(msg, false, false); // Send to DLX
      }
    }
  });

  // Monitor consumer health
  setInterval(() => {
    hub.captureLog('info', 'Consumer heartbeat', {
      queue: 'orders',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage().heapUsed,
    });
  }, 60000);
}

async function processOrder(order: any) {
  // Business logic here
}

startConsumer().catch(console.error);
```

## Docker Setup

### docker-compose.yml

```yaml
services:
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: rabbitmq
    hostname: rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
      RABBITMQ_DEFAULT_VHOST: /
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
      - ./rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
      - rabbitmq_logs:/var/log/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_running"]
      interval: 30s
      timeout: 10s
      retries: 5

  fluent-bit:
    image: fluent/fluent-bit:latest
    container_name: fluent-bit
    volumes:
      - ./fluent-bit/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
      - ./fluent-bit/rabbitmq_level.lua:/etc/fluent-bit/rabbitmq_level.lua:ro
      - rabbitmq_logs:/var/log/rabbitmq:ro
    environment:
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    depends_on:
      rabbitmq:
        condition: service_healthy
    restart: unless-stopped

  rabbitmq-metrics:
    image: python:3.12-slim
    container_name: rabbitmq-metrics
    volumes:
      - ./metrics/collect.py:/opt/collect.py:ro
      - ./metrics/requirements.txt:/opt/requirements.txt:ro
    command: >
      bash -c "pip install -r /opt/requirements.txt &&
               while true; do
                 python /opt/collect.py;
                 sleep 30;
               done"
    environment:
      - RABBITMQ_HOST=rabbitmq
      - RABBITMQ_MGMT_PORT=15672
      - RABBITMQ_USER=admin
      - RABBITMQ_PASS=${RABBITMQ_PASSWORD}
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    depends_on:
      rabbitmq:
        condition: service_healthy

  dead-letter-monitor:
    image: node:20-alpine
    container_name: dead-letter-monitor
    volumes:
      - ./dead-letter-monitor:/app
    working_dir: /app
    command: node dead-letter-monitor.js
    environment:
      - RABBITMQ_URL=amqp://admin:${RABBITMQ_PASSWORD}@rabbitmq:5672
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    depends_on:
      rabbitmq:
        condition: service_healthy
    restart: unless-stopped

volumes:
  rabbitmq_data:
  rabbitmq_logs:
```

### RabbitMQ Config for Docker

```ini
# rabbitmq.conf
log.console = true
log.console.level = info
log.console.formatter = json

log.file = /var/log/rabbitmq/rabbit.log
log.file.level = info
log.file.formatter = json
log.file.rotation.size = 104857600
log.file.rotation.count = 5

management.tcp.port = 15672
```

## Kubernetes Deployment

### RabbitMQ Cluster Operator

For Kubernetes, the RabbitMQ Cluster Operator is recommended:

```yaml
apiVersion: rabbitmq.com/v1beta1
kind: RabbitmqCluster
metadata:
  name: rabbitmq
  namespace: messaging
spec:
  replicas: 3
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: "2"
      memory: 2Gi
  rabbitmq:
    additionalConfig: |
      log.console.level = info
      log.console.formatter = json
  override:
    statefulSet:
      spec:
        template:
          metadata:
            annotations:
              fluentbit.io/parser: json
```

## Detection Rules

Create alerts for common RabbitMQ issues:

### Queue Backlog

```
service:rabbitmq AND log_type:queue_metrics AND messages:>10000
```

Threshold: any occurrence indicates growing backlog.

### No Consumers

```
service:rabbitmq AND log_type:queue_metrics AND consumers:0 AND messages:>0
```

Queues with messages but no consumers.

### Dead Letters

```
service:rabbitmq AND log_type:dead_letter
```

Any occurrence - failed message processing needs investigation.

### Memory Alarm

```
service:rabbitmq AND mem_alarm:true
```

Critical - RabbitMQ will block publishing when memory alarm triggers.

### Disk Space Alarm

```
service:rabbitmq AND disk_free_alarm:true
```

Critical - RabbitMQ will block publishing when disk space is low.

### Node Down

```
service:rabbitmq AND log_type:node_metrics AND running:false
```

Any occurrence - cluster degradation.

### Connection Spike

```
service:rabbitmq AND log_type:connection_metrics AND total_connections:>500
```

Threshold depends on your baseline.

## Management Plugin Metrics

### Key Metrics to Monitor

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Queue depth | <1000 | 1000-10000 | >10000 |
| Consumer count | >0 | - | 0 |
| Publish rate | Stable | 2x baseline | 5x baseline |
| Memory usage | <80% limit | 80-90% | >90% (alarm) |
| Disk free | >2x limit | 1-2x limit | <limit (alarm) |
| File descriptors | <80% total | 80-90% | >90% |
| Unacked messages | <prefetch * consumers | 2x expected | >5x expected |

### Overview API Endpoint

```bash
# Get cluster overview
curl -u admin:password http://localhost:15672/api/overview | jq '{
  rabbitmq_version: .rabbitmq_version,
  erlang_version: .erlang_version,
  message_stats: .message_stats,
  queue_totals: .queue_totals,
  object_totals: .object_totals
}'
```

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| JSON log overhead | <1% | Compared to default format |
| Metrics collector CPU | <1% | Python script every 30s |
| Metrics collector memory | ~30MB | Python with requests library |
| Fluent Bit memory | ~30MB | Tailing server logs |
| Dead letter monitor | ~20MB | Node.js AMQP consumer |

## Troubleshooting

### RabbitMQ logs not in JSON format

1. Verify the formatter configuration:
   ```bash
   rabbitmqctl environment | grep log
   ```

2. Ensure you are running RabbitMQ 3.9+ (JSON formatter was introduced in 3.9).

3. Check for syntax errors in `rabbitmq.conf`:
   ```bash
   rabbitmq-diagnostics check_running
   ```

### Metrics collector failing

1. Verify the management plugin is enabled:
   ```bash
   rabbitmq-plugins list | grep management
   # If not enabled:
   rabbitmq-plugins enable rabbitmq_management
   ```

2. Test the management API:
   ```bash
   curl -u admin:password http://localhost:15672/api/queues | jq length
   ```

3. Check credentials and network access from the collector.

### Dead letter monitor not receiving messages

1. Verify the dead letter exchange binding:
   ```bash
   rabbitmqadmin list bindings | grep dlx
   ```

2. Check that the source queue has the DLX argument set:
   ```bash
   rabbitmqadmin list queues name arguments
   ```

3. Test by publishing and rejecting a message:
   ```bash
   rabbitmqadmin publish exchange=amq.default routing_key=orders payload='{"test": true}'
   # Then nack the message in your consumer
   ```

### High memory usage

1. Check which queues are consuming the most memory:
   ```bash
   rabbitmqctl list_queues name messages memory --sort-by memory --reverse
   ```

2. Enable lazy queues for large backlogs:
   ```bash
   rabbitmqctl set_policy lazy-queues "^lazy\." '{"queue-mode":"lazy"}' --apply-to queues
   ```

3. Check for message TTL to prevent unbounded growth:
   ```bash
   rabbitmqadmin list queues name arguments | grep ttl
   ```

## Next Steps

- [Docker Integration](/integrations/docker/) - Container log collection patterns
- [Docker Compose Integration](/integrations/docker-compose/) - Multi-service logging
- [Node.js Integration](/integrations/nodejs/) - Application-level consumer logging
- [Incident Response](/use-cases/incident-response/) - Build runbooks for RabbitMQ outages
- [Real-Time Alerting](/use-cases/real-time-alerting/) - Alert on queue backlogs and dead letters
