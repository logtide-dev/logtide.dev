---
title: "Apache Kafka Log Pipeline Integration"
description: "Use Apache Kafka as a log transport layer to buffer and route high-volume log streams into LogTide reliably."
category: "infrastructure"
difficulty: "advanced"
brandIcon: "simple-icons:apachekafka"
highlights:
  - "High-throughput buffering"
  - "At-least-once delivery"
  - "Multi-consumer fanout"
  - "Backpressure handling"
relatedIntegrations:
  - "docker"
  - "kubernetes"
  - "nodejs"
  - "python"
relatedUseCases:
  - "real-time-alerting"
keywords:
  - "kafka logging"
  - "kafka log pipeline"
  - "kafka log aggregation"
  - "kafka fluent bit"
  - "log streaming kafka"
  - "high volume logging"
faqs:
  - question: "Why should I use Kafka as a log transport layer in front of LogTide?"
    answer: "Kafka acts as a durable buffer between your applications and LogTide, absorbing traffic bursts without blocking application code. It provides at-least-once delivery with disk persistence, the ability to replay logs by resetting consumer offsets, and fanout so the same stream can feed LogTide, S3 archival, and real-time alerting simultaneously."
  - question: "How do I ship logs from Kafka into LogTide?"
    answer: "The recommended approach is to run Fluent Bit as a Kafka consumer using its built-in kafka input plugin, then configure an http output that posts to your LogTide instance at /api/v1/ingest/single with your API key in the X-API-Key header. Alternatively you can write a custom Node.js or Python consumer that batches records and posts them to /api/v1/ingest."
  - question: "Does LogTide support structured JSON logs coming through Kafka?"
    answer: "Yes. Both the Fluent Bit consumer and the example Node.js and Python producers serialize log events as JSON. As long as each message includes the expected fields (level, message, service, timestamp), LogTide ingests and indexes them as fully structured log events."
  - question: "Can I use Redpanda instead of Apache Kafka with this setup?"
    answer: "Yes. The guide explicitly lists Redpanda as a Kafka-compatible alternative. Because Redpanda implements the Kafka protocol, the same Fluent Bit configuration, producer code, and consumer setup work without changes."
---

When you're generating millions of log events per second, shipping directly to LogTide may not be enough. Apache Kafka acts as a durable buffer between your applications and LogTide, providing backpressure handling, replay capability, and multi-consumer fanout. This guide shows you how to build a Kafka-backed log pipeline.

## Why Kafka for log transport?

- **Backpressure handling**: Applications never block on log shipping — Kafka absorbs bursts
- **Durability**: Logs are persisted to disk before acknowledgment — no data loss on restarts
- **Replay**: Re-process historical logs by resetting consumer offsets
- **Fanout**: Send the same log stream to LogTide, S3 archival, and real-time alerting
- **Decoupling**: Applications don't need to know about LogTide — they publish to Kafka
- **Throughput**: Kafka handles millions of messages per second per partition

## Architecture

```d2
direction: right
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  group: { style: { fill: "#ede9fe"; stroke: "#c4b5fd"; stroke-width: 2; font-color: "#3b0764"; border-radius: 10 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

app1: App 1 { class: src }
app2: App 2 { class: src }
app3: App 3 { class: src }
nginx: nginx { class: src }
kafka: Kafka Cluster { shape: queue; class: hub }
lt: LogTide { class: hub }
s3: S3 Archive { shape: cylinder; class: src }
alerting: Alerting { class: src }

app1 -> kafka { class: flow }
app2 -> kafka { class: flow }
app3 -> kafka { class: flow }
nginx -> kafka { class: flow }
kafka -> lt { class: flow }
kafka -> s3 { class: flow }
kafka -> alerting { class: flow }
```

Applications produce logs to Kafka topics. A Kafka Connect sink or Fluent Bit consumer ships logs to LogTide. Other consumers can archive to S3 or trigger real-time alerts.

## Prerequisites

- Apache Kafka 3.0+ (or Redpanda as a Kafka-compatible alternative)
- Fluent Bit or a custom consumer
- LogTide instance with API key
- Docker or Kubernetes for deployment

## Kafka Topic Setup

### Create Log Topics

```bash
# Create a topic for application logs
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic logs.application \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=86400000 \        # 24 hour retention
  --config retention.bytes=10737418240 \  # 10 GB max per partition
  --config compression.type=lz4

# Create a topic for infrastructure logs
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic logs.infrastructure \
  --partitions 6 \
  --replication-factor 3 \
  --config retention.ms=86400000 \
  --config compression.type=lz4

# Create a topic for security events (higher retention)
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic logs.security \
  --partitions 6 \
  --replication-factor 3 \
  --config retention.ms=604800000 \       # 7 day retention
  --config compression.type=lz4
```

### Topic Naming Convention

```
logs.{category}

Examples:
  logs.application       # App-level logs
  logs.infrastructure    # nginx, systemd, etc.
  logs.security          # Auth events, SIEM
  logs.{service-name}    # Per-service topics (optional)
```

## Producing Logs to Kafka

### Node.js Producer

```typescript
// lib/kafka-logger.ts
import { Kafka, Partitioners } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'my-service',
  brokers: process.env.KAFKA_BROKERS!.split(','),
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  allowAutoTopicCreation: false,
});

await producer.connect();

interface LogEvent {
  level: string;
  message: string;
  service: string;
  metadata?: Record<string, unknown>;
}

export async function sendLog(event: LogEvent) {
  await producer.send({
    topic: 'logs.application',
    messages: [{
      // Partition by service name for ordering
      key: event.service,
      value: JSON.stringify({
        ...event,
        timestamp: new Date().toISOString(),
        hostname: process.env.HOSTNAME,
      }),
      headers: {
        'content-type': 'application/json',
      },
    }],
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await producer.disconnect();
});
```

### Python Producer

```python
# lib/kafka_logger.py
import json
import os
import socket
from datetime import datetime, timezone
from confluent_kafka import Producer

conf = {
    'bootstrap.servers': os.environ['KAFKA_BROKERS'],
    'client.id': 'my-service',
    'compression.type': 'lz4',
    'linger.ms': 50,         # Batch for 50ms
    'batch.num.messages': 1000,
}

producer = Producer(conf)

def send_log(level: str, message: str, service: str, **metadata):
    event = {
        'level': level,
        'message': message,
        'service': service,
        'metadata': metadata,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'hostname': socket.gethostname(),
    }

    producer.produce(
        topic='logs.application',
        key=service.encode('utf-8'),
        value=json.dumps(event).encode('utf-8'),
    )

    # Trigger delivery callbacks
    producer.poll(0)

def flush():
    producer.flush(timeout=10)
```

## Consuming Logs into LogTide

### Fluent Bit Kafka Consumer

```ini
# /etc/fluent-bit/fluent-bit.conf
[SERVICE]
    Flush         5
    Log_Level     info

# Consume from Kafka
[INPUT]
    Name          kafka
    Tag           kafka.logs
    Brokers       kafka-1:9092,kafka-2:9092,kafka-3:9092
    Topics        logs.application,logs.infrastructure,logs.security
    Group_Id      logtide-consumer
    Format        json
    Poll_Ms       100

# Output to LogTide
[OUTPUT]
    Name          http
    Match         *
    Host          api.logtide.dev
    Port          443
    URI           /api/v1/ingest/single
    Format        json_lines
    Header        X-API-Key ${LOGTIDE_API_KEY}
    Header        Content-Type application/json
    tls           On
    tls.verify    On
    Retry_Limit   5
```

### Custom Consumer (Node.js)

For more control, use a custom consumer:

```typescript
// consumer.ts
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'logtide-consumer',
  brokers: process.env.KAFKA_BROKERS!.split(','),
});

const consumer = kafka.consumer({
  groupId: 'logtide-ingest',
  maxWaitTimeInMs: 100,
  maxBytesPerPartition: 1048576, // 1MB per partition
});

const LOGTIDE_API_URL = process.env.LOGTIDE_API_URL!;
const LOGTIDE_API_KEY = process.env.LOGTIDE_API_KEY!;

const buffer: any[] = [];
const BATCH_SIZE = 100;
const FLUSH_INTERVAL = 5000;

async function flushToLogTide() {
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, BATCH_SIZE);

  const response = await fetch(`${LOGTIDE_API_URL}/api/v1/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LOGTIDE_API_KEY,
    },
    body: JSON.stringify({ logs: batch }),
  });

  if (!response.ok) {
    console.error(`LogTide ingest failed: ${response.status}`);
    // Put back in buffer for retry
    buffer.unshift(...batch);
  }
}

setInterval(flushToLogTide, FLUSH_INTERVAL);

await consumer.connect();
await consumer.subscribe({
  topics: ['logs.application', 'logs.infrastructure', 'logs.security'],
});

await consumer.run({
  eachMessage: async ({ topic, message }) => {
    try {
      const event = JSON.parse(message.value!.toString());
      event._topic = topic;
      buffer.push(event);

      if (buffer.length >= BATCH_SIZE) {
        await flushToLogTide();
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  },
});
```

## Docker Setup

```yaml
# docker-compose.yml
services:
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_LOG_RETENTION_HOURS: 24
      KAFKA_LOG_SEGMENT_BYTES: 1073741824
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: false
      CLUSTER_ID: kafka-logtide-cluster-001
    volumes:
      - kafka_data:/var/lib/kafka/data

  kafka-consumer:
    image: fluent/fluent-bit:latest
    volumes:
      - ./fluent-bit-kafka.conf:/fluent-bit/etc/fluent-bit.conf:ro
    environment:
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    depends_on:
      - kafka

volumes:
  kafka_data:
```

## Kubernetes Deployment

```yaml
# kafka-consumer-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: logtide-kafka-consumer
spec:
  replicas: 3  # One per Kafka partition group
  selector:
    matchLabels:
      app: logtide-kafka-consumer
  template:
    metadata:
      labels:
        app: logtide-kafka-consumer
    spec:
      containers:
        - name: consumer
          image: fluent/fluent-bit:latest
          volumeMounts:
            - name: config
              mountPath: /fluent-bit/etc/
          env:
            - name: LOGTIDE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: logtide-credentials
                  key: api-key
            - name: KAFKA_BROKERS
              value: "kafka-0.kafka:9092,kafka-1.kafka:9092,kafka-2.kafka:9092"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
      volumes:
        - name: config
          configMap:
            name: kafka-consumer-config
```

## Monitoring the Pipeline

### Consumer Lag

Track consumer lag to ensure LogTide keeps up:

```bash
kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group logtide-consumer \
  --describe
```

### Pipeline Health Metrics

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Consumer lag | <1000 | 1000-10000 | >10000 |
| Throughput | >1000 msgs/s | - | <100 msgs/s |
| Partition balance | Even | 2x skew | 5x skew |
| Error rate | <0.01% | 0.01-1% | >1% |

## Performance Tuning

### Producer Tuning

```
linger.ms=50          # Batch window (50ms)
batch.size=65536      # Max batch size (64KB)
compression.type=lz4  # Compress batches
acks=1                # Leader acknowledgment (balance speed/durability)
```

### Consumer Tuning

```
fetch.min.bytes=1048576    # Wait for 1MB before fetching
fetch.max.wait.ms=500      # Max wait time
max.poll.records=500       # Process 500 records per poll
```

### Partition Strategy

- **12 partitions** for high-throughput topics (allows 12 parallel consumers)
- **6 partitions** for moderate topics
- **3 partitions** for low-volume security events

## Troubleshooting

### Consumer lag increasing

1. Check consumer health: `kafka-consumer-groups.sh --describe`
2. Add more consumer instances (up to partition count)
3. Check if LogTide is accepting logs (connection issues?)
4. Increase batch size for more efficient shipping

### Messages not being consumed

1. Verify topic exists: `kafka-topics.sh --list`
2. Check consumer group: `kafka-consumer-groups.sh --describe`
3. Verify Fluent Bit Kafka plugin configuration

### Data loss during restarts

Ensure `acks=all` for critical topics:

```
acks=all
min.insync.replicas=2
```

This guarantees logs survive broker failures.

## Next Steps

- [Docker Integration](/integrations/docker/) - Container log routing to Kafka
- [Kubernetes Integration](/integrations/kubernetes/) - Kafka on K8s
- [Real-Time Alerting](/use-cases/real-time-alerting/) - Alert on Kafka streams
- [Node.js Integration](/integrations/nodejs/) - Application log producers
