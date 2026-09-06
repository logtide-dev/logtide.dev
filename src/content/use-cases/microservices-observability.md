---
title: "Microservices Observability"
description: "Achieve full observability across distributed microservices with centralized logging, correlation IDs, and service dependency mapping in LogTide."
category: "operations"
difficulty: "medium"
icon: "lucide:network"
industries:
  - "SaaS"
  - "Fintech"
  - "E-commerce"
  - "Enterprise"
highlights:
  - "Distributed tracing"
  - "Service dependency mapping"
  - "Cross-service correlation"
  - "Centralized logging"
relatedIntegrations:
  - "docker"
  - "kubernetes"
  - "kafka"
  - "express"
  - "fastify"
relatedUseCases:
  - "incident-response"
  - "real-time-alerting"
  - "high-volume"
keywords:
  - "microservices logging"
  - "distributed tracing"
  - "microservices observability"
  - "service mesh logging"
  - "cross-service correlation"
faqs:
  - question: "How does LogTide provide observability across microservices?"
    answer: "LogTide centralises logs from every service into a single destination and propagates a trace ID across all service-to-service HTTP calls. This lets you search trace_id:any-value to see the complete request timeline across your entire distributed system, regardless of how many services or programming languages are involved."
  - question: "Does LogTide support distributed tracing without a separate tracing backend?"
    answer: "Yes. LogTide implements distributed tracing through correlation IDs in structured log events rather than requiring a separate tool like Jaeger or Zipkin. Each service attaches trace_id, span_id, and parent_span_id to every log, giving you parent-child relationships and service dependency maps from log data alone."
  - question: "Can LogTide detect cascading failures across multiple microservices?"
    answer: "Yes. You can configure cross-service alert rules that detect when multiple services begin erroring simultaneously or when downstream call failures spike above a threshold. Because all services log to a single LogTide instance with consistent schemas, queries like grouping errors by service across a five-minute window work out of the box."
  - question: "How does LogTide handle microservices written in different languages?"
    answer: "LogTide provides SDKs for Node.js frameworks such as Express and Fastify as well as a Python client, and the same trace propagation pattern works across all of them via HTTP headers. The shared structured schema ensures that cross-service queries return consistent results regardless of which language each service uses."
---

In a microservices architecture, every user action fans out across dozens of services. When something breaks, the error you see in one service is often just a symptom - the root cause lives three hops upstream, buried in a different service's logs. This guide shows how to build full observability across your distributed system with LogTide.

## The Problem with Distributed Logs

In a monolith, debugging is straightforward: one process, one log stream, one place to look. Microservices shatter that simplicity:

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

req: User Request { class: src }
gw: API Gateway { class: src }
auth: Auth Service { class: src }
order: Order Service { class: src }
inv: Inventory API { class: src }
pay: Payment Service { class: src }
notif: Notification Svc { class: src }
ana: Analytics Service { class: src }

stdout1: stdout { class: dest }
filed: file { class: dest }
stdout2: stdout { class: dest }
cloudwatch: CloudWatch { class: dest }
datadog: Datadog { class: dest }
syslogd: syslog { class: dest }
nowhere: nowhere { class: dest }

req -> gw -> stdout1 { class: flow }
req -> auth -> filed { class: flow }
req -> order -> stdout2 { class: flow }
order -> inv -> cloudwatch { class: flow }
order -> pay -> datadog { class: flow }
order -> notif -> syslogd { class: flow }
req -> ana -> nowhere { class: flow }
```

```
❌ Distributed logging problems:

1. Fragmented logs       → Each service logs independently, no unified view
2. Missing correlation   → No way to trace a request across service boundaries
3. Inconsistent formats  → JSON here, plain text there, different field names
4. Blind spots           → Async workers and message consumers often unlogged
5. Blast radius unknown  → One failure cascades, but you can't see where
```

| Problem | Impact |
|---------|--------|
| No correlation IDs | 40+ minutes per incident tracing request paths manually |
| Fragmented log stores | Context-switching between 3-5 tools during debugging |
| Inconsistent schemas | Queries break across services, dashboards unreliable |
| No dependency mapping | Cascading failures go undetected until customers report them |

## The LogTide Approach

LogTide solves distributed observability with three principles:

1. **One destination** - All services ship logs to a single LogTide instance
2. **Correlation by design** - Trace context propagates automatically across service boundaries
3. **Structure everything** - Consistent schemas make cross-service queries possible

### Architecture Overview

```d2
direction: down
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  group: { style: { fill: "#ede9fe"; stroke: "#c4b5fd"; stroke-width: 2; font-color: "#3b0764"; border-radius: 10 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

gw: "API GW\n(Express)" { class: src }
auth: "Auth Svc\n(Fastify)" { class: src }
order: "Order Svc\n(Python)" { class: src }
payment: "Payment\n(Go)" { class: src }

sdk: "LogTide SDK Layer\n@logtide/express · @logtide/fastify · …" { class: hub }

server: LogTide Server {
  class: group
  grid-rows: 2
  correlation: Correlation Engine { class: hub }
  siem: "SIEM / Sigma Detection" { class: hub }
}

gw -> sdk: x-trace-id { class: flow }
auth -> sdk: x-trace-id { class: flow }
order -> sdk: x-trace-id { class: flow }
payment -> sdk: x-trace-id { class: flow }
sdk -> server: "batched, compressed" { class: flow }
```

## Implementation

### 1. Trace Context Propagation

The foundation of microservices observability is a trace ID that follows every request from ingress to the last downstream call:

```typescript
// shared/correlation.ts
import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

export interface TraceContext {
  traceId: string;       // Unique per user request, propagated across services
  spanId: string;        // Unique per service hop
  parentSpanId?: string; // The span that called this one
  service: string;
  startTime: number;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();

export function createTraceMiddleware(serviceName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const context: TraceContext = {
      traceId: req.headers['x-trace-id'] as string || crypto.randomUUID(),
      spanId: crypto.randomUUID().slice(0, 16),
      parentSpanId: req.headers['x-span-id'] as string,
      service: serviceName,
      startTime: Date.now(),
    };

    res.setHeader('x-trace-id', context.traceId);
    res.setHeader('x-span-id', context.spanId);

    traceStorage.run(context, () => next());
  };
}

export function getTrace(): TraceContext | undefined {
  return traceStorage.getStore();
}
```

### 2. Service Logger with Auto-Enrichment

Wrap the LogTide SDK so every log event automatically includes trace context:

```typescript
// shared/logger.ts
import { LogTideClient } from '@logtide/sdk-node';
import { getTrace } from './correlation';

const SERVICE_NAME = process.env.SERVICE_NAME || 'unknown';

const client = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
  batchSize: 200,
  flushInterval: 3000,
});

function enrichWithTrace(metadata: Record<string, unknown> = {}) {
  const trace = getTrace();
  if (!trace) return metadata;

  return {
    ...metadata,
    trace_id: trace.traceId,
    span_id: trace.spanId,
    parent_span_id: trace.parentSpanId,
    service: trace.service,
    elapsed_ms: Date.now() - trace.startTime,
  };
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    client.info(SERVICE_NAME, message, enrichWithTrace(meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    client.warn(SERVICE_NAME, message, enrichWithTrace(meta));
  },
  error(message: string, meta?: Record<string, unknown>) {
    client.error(SERVICE_NAME, message, enrichWithTrace(meta));
  },
};

process.on('SIGTERM', async () => {
  await client.flush();
  process.exit(0);
});
```

### 3. HTTP Client with Trace Propagation

When services call each other, trace headers must be forwarded automatically:

```typescript
// shared/http-client.ts
import { getTrace } from './correlation';
import { logger } from './logger';

export async function serviceCall(url: string, options: RequestInit = {}): Promise<Response> {
  const trace = getTrace();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (trace) {
    headers['x-trace-id'] = trace.traceId;
    headers['x-span-id'] = trace.spanId;
  }

  const startTime = Date.now();
  const targetService = new URL(url).hostname;

  try {
    const response = await fetch(url, { ...options, headers });
    const duration = Date.now() - startTime;

    logger.info('Downstream call completed', {
      target_service: targetService,
      status: response.status,
      duration_ms: duration,
    });

    if (duration > 2000) {
      logger.warn('Slow downstream call detected', {
        target_service: targetService,
        duration_ms: duration,
      });
    }

    return response;
  } catch (error) {
    const err = error as Error;
    logger.error('Downstream call failed', {
      target_service: targetService,
      error: err.message,
      error_code: (err as any).code,
      duration_ms: Date.now() - startTime,
    });
    throw error;
  }
}
```

### 4. Python (FastAPI) Service Example

Not all services are in Node.js. Here is a Python downstream service using LogTide:

```python
# services/inventory-service/main.py
import os, time, uuid
from contextvars import ContextVar
from fastapi import FastAPI, Request, Response
from logtide_sdk import LogTideClient, ClientOptions

trace_context: ContextVar[dict] = ContextVar("trace_context", default={})

client = LogTideClient(ClientOptions(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
    batch_size=200,
    flush_interval=3.0,
    global_metadata={"service": "inventory-service"},
))

app = FastAPI()

@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    ctx = {
        "trace_id": request.headers.get("x-trace-id", str(uuid.uuid4())),
        "span_id": str(uuid.uuid4())[:16],
        "parent_span_id": request.headers.get("x-span-id"),
    }
    trace_context.set(ctx)

    start = time.time()
    response: Response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000)

    client.info(
        "inventory-service",
        f"{request.method} {request.url.path} {response.status_code}",
        {**ctx, "duration_ms": duration_ms},
    )
    return response

@app.post("/check")
async def check_inventory(items: list[dict]):
    ctx = trace_context.get({})
    client.info("inventory-service", "Inventory check started", {**ctx, "item_count": len(items)})

    unavailable = []
    for item in items:
        stock = await get_stock(item["sku"])
        if stock < item["quantity"]:
            unavailable.append({"sku": item["sku"], "requested": item["quantity"], "available": stock})

    return {"available": len(unavailable) == 0, "unavailable": unavailable}
```

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

map: "Service Dependency Map" {
  class: group
  apigw: api-gw { class: hub }
  authsvc: "auth-service\n45ms avg" { class: src }
  notif: "notification\n120ms avg" { class: src }
  ordersvc: "order-service\n85ms avg" { class: src }
  inv: "inventory\n30ms avg" { class: src }
  pay: "payment\n200ms avg" { class: src }

  apigw -> authsvc { class: flow }
  apigw -> notif { class: flow }
  apigw -> ordersvc { class: flow }
  ordersvc -> inv { class: flow }
  ordersvc -> pay { class: flow }
}
```

### 6. Kubernetes Deployment

Deploy your microservices with LogTide credentials as a shared Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: logtide-credentials
  namespace: ecommerce
type: Opaque
stringData:
  LOGTIDE_API_URL: "https://logtide.internal"
  LOGTIDE_API_KEY: "lp_your_api_key"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: ecommerce
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
        - name: api-gateway
          image: myregistry/api-gateway:latest
          ports:
            - containerPort: 3000
          env:
            - name: SERVICE_NAME
              value: "api-gateway"
            - name: LOGTIDE_API_URL
              valueFrom:
                secretKeyRef:
                  name: logtide-credentials
                  key: LOGTIDE_API_URL
            - name: LOGTIDE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: logtide-credentials
                  key: LOGTIDE_API_KEY
```

Repeat this pattern for each service, changing the `SERVICE_NAME` and image. See the [Kubernetes Integration](/integrations/kubernetes/) guide for full setup.

### 7. Cross-Service Alerting

Set up alerts that detect problems spanning multiple services:

```yaml
# Cascade failure: multiple services erroring simultaneously
- name: cascade-failure
  query: 'level:error AND time:>5m | group by service | count > 10'
  threshold: 3
  window: 5m
  severity: critical

# Downstream latency spike
- name: downstream-latency-spike
  query: 'message:"Downstream call completed" AND duration_ms:>3000'
  threshold: 10
  window: 5m
  severity: warning

# Service unreachable
- name: service-unreachable
  query: 'message:"Downstream call failed" AND error_code:ECONNREFUSED'
  threshold: 3
  window: 2m
  severity: critical
```

## Real-World Example: E-Commerce Platform

An e-commerce company with 8 microservices (Express, Fastify, FastAPI, Go) handles 50,000 orders per day. Before LogTide, debugging a failed order meant checking logs in 5 different systems.

**Before LogTide:**
- MTTR for cross-service issues: 90 minutes
- Time to find relevant logs: 30+ minutes
- Recurring "mystery errors" with no root cause

**After LogTide:**
- MTTR for cross-service issues: 15 minutes
- Time to find relevant logs: < 2 minutes (search by trace_id)
- Zero unresolved incidents in 6 months

**Debugging a failed order:**

```
1. Alert fires: "order-service error rate > 5%"

2. Query recent errors:
   service:order-service AND level:error AND time:>15m

3. Find common error: "Downstream call failed: inventory-service"
   → trace_id: 8f3a-b2c1-d4e5

4. Search by trace to see the full picture:
   trace_id:8f3a-b2c1-d4e5

5. Trace timeline reveals:
   10:42:01.123  api-gateway       → POST /api/orders (started)
   10:42:01.145  auth-service      → Token verified (22ms)
   10:42:01.167  order-service     → Order creation started
   10:42:01.189  inventory-service → Connection refused ← ROOT CAUSE
   10:42:01.190  order-service     → Downstream call failed
   10:42:01.191  api-gateway       → 500 Internal Server Error

6. Root cause: inventory-service pod OOMKilled
   → Fix: increase memory limits, add HPA
```

## Cross-Service Query Patterns

```
# Trace a single request across all services
trace_id:8f3a-b2c1-d4e5

# Error rate by service (last hour)
level:error AND time:>1h | group by service | sort by count desc

# Services with elevated p99 latency
message:"Request completed" AND time:>30m
  | group by service | percentile(duration_ms, 99)

# Detect retry storms
target_service:inventory-service AND time:>10m
  | group by trace_id | count > 3

# Find all callers of a service
target_service:payment-service | group by service
```

## Observability Checklist

### Trace Propagation
- [ ] Trace middleware installed on all services
- [ ] `x-trace-id` header forwarded in all service-to-service calls
- [ ] `x-span-id` set per service for parent-child relationships
- [ ] Async workers and message consumers inherit trace context

### Consistent Logging
- [ ] All services use the LogTide SDK
- [ ] Standard fields: `trace_id`, `span_id`, `service`, `duration_ms`
- [ ] Downstream calls logged with target service and duration
- [ ] Errors include stack traces and contextual metadata

### Alerting and Infrastructure
- [ ] Cascade failure detection (multiple services erroring)
- [ ] Per-service error rate and latency alerts
- [ ] Service unreachable alerts (ECONNREFUSED)
- [ ] LogTide credentials stored as Kubernetes Secrets
- [ ] Graceful shutdown with `client.flush()` on SIGTERM

## Common Pitfalls

### 1. "We only need to trace errors"

If you only log error paths, you have no baseline for normal behavior. When latency doubles but nothing errors, you are blind.

**Solution:** Log request start and completion for every request. Use sampling for debug logs, but always capture lifecycle events.

### 2. "Each team picks their own logging library"

Service A uses Winston, Service B uses Pino, Service C uses Python logging. Field names differ, log levels differ. Cross-service queries become impossible.

**Solution:** Standardize on LogTide SDKs across all services. The SDKs handle field naming, batching, and delivery consistently.

### 3. "Async jobs don't need tracing"

Background workers, cron jobs, and message consumers are often the source of subtle bugs. Without trace context, their failures are orphaned.

**Solution:** Include the trace_id in message payloads and restore it when consuming:

```typescript
// Producer: include trace in message
await queue.publish('order.process', {
  traceId: getTrace()?.traceId,
  orderId: order.id,
});

// Consumer: restore trace context
queue.subscribe('order.process', (msg) => {
  const ctx = { traceId: msg.traceId, spanId: crypto.randomUUID().slice(0, 16) };
  traceStorage.run(ctx, () => processOrder(msg));
});
```

## Next Steps

- [Express Integration](/integrations/express/) - Detailed Express SDK setup
- [Fastify Integration](/integrations/fastify/) - Fastify SDK and middleware
- [Kubernetes Integration](/integrations/kubernetes/) - Deploy LogTide on K8s
- [Incident Response](/use-cases/incident-response/) - Use traces for faster debugging
- [Real-Time Alerting](/use-cases/real-time-alerting/) - Alert on cross-service failures

---

**Ready to unify your microservices logs?**

- [Deploy LogTide](https://github.com/logtide-dev/logtide) - Free, open-source
- [Join GitHub Discussions](https://github.com/logtide-dev/logtide/discussions) - Share your observability setup
