---
title: "API Monitoring and Analytics"
description: "Monitor API performance, track latency percentiles, detect error spikes, and analyze consumer usage patterns with LogTide."
category: "performance"
difficulty: "easy"
icon: "lucide:activity"
industries:
  - "SaaS"
  - "Fintech"
  - "API-first"
  - "E-commerce"
highlights:
  - "Request/response logging"
  - "Latency tracking"
  - "Error rate monitoring"
  - "Rate limit analysis"
relatedIntegrations:
  - "express"
  - "fastify"
  - "nodejs"
  - "nginx"
relatedUseCases:
  - "real-time-alerting"
  - "incident-response"
  - "security-monitoring"
keywords:
  - "API logging"
  - "API monitoring"
  - "API analytics"
  - "request logging"
  - "API performance"
  - "endpoint monitoring"
faqs:
  - question: "How does LogTide help with API monitoring?"
    answer: "LogTide turns every API request into a structured, queryable event by capturing method, path, status code, latency, consumer identity, and API version. This gives you real-time dashboards, latency percentile reports, and consumer analytics without any per-GB pricing."
  - question: "Can LogTide track API latency percentiles?"
    answer: "Yes. LogTide supports latency percentile tracking (p50, p95, p99) by aggregating per-route timing data and flushing periodic reports. Because average latency hides outliers, alerting on p99 rather than averages is the recommended approach."
  - question: "How do I detect which API consumer is abusing rate limits?"
    answer: "LogTide logs every rate-limit event with the consumer identifier extracted from the API key or JWT. You can query across consumers to find who is hitting limits most frequently and correlate those events with downstream latency spikes."
  - question: "Does LogTide work with Express and Fastify?"
    answer: "LogTide provides ready-made middleware for Express and a plugin for Fastify. Both implementations capture request metadata asynchronously using batched, compressed payloads to minimise performance overhead on your API."
---

Your API is your product. When response times creep up, error rates spike, or a specific consumer hammers your endpoints, you need to know immediately -- not when customers start complaining. This guide shows how to build comprehensive API monitoring with LogTide, from basic request logging to latency percentile tracking and consumer analytics.

## The Problem

Most teams start with no API monitoring at all. The first sign of trouble is a customer support ticket: "Your API is slow."

```
❌ API monitoring anti-patterns:

1. No request logging     → "How many requests do we actually get?"
2. Average-only metrics   → P99 is 10x worse than average, but you can't see it
3. No error breakdown     → "500 errors are up" -- which endpoint? which consumer?
4. No rate limit tracking → Abusive consumers degrade everyone's experience
5. No version tracking    → Can't tell if v2 is faster than v1
```

| Problem | Business Impact |
|---------|----------------|
| Undetected latency spikes | Users abandon requests, revenue drops |
| Silent error rate increase | Data corruption, broken integrations |
| No consumer visibility | One bad actor degrades service for everyone |
| Missing audit trail | Cannot debug partner integration issues |

## The LogTide Approach

Turn every API request into a structured, queryable event:

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

mobile: Mobile { class: src }
web: Web { class: src }
partners: Partners { class: src }

api: "Express / Fastify API" {
  class: group
  mw: "LogTide Request Middleware\nmethod · path · status · latency\nconsumer identity · API version\nrequest / response sizes" { class: src }
}

lt: LogTide {
  class: group
  grid-rows: 3
  dashboards: Dashboards { class: hub }
  alerts: Alerts { class: hub }
  analytics: Analytics { class: hub }
}

mobile -> api.mw { class: flow }
web -> api.mw { class: flow }
partners -> api.mw { class: flow }
api.mw -> lt: "Batched, async" { class: flow }
```

## Implementation

### 1. Express Request Logging Middleware

A production-ready middleware that captures everything you need:

```typescript
// middleware/api-logger.ts
import { LogTideClient } from '@logtide/sdk-node';
import { Request, Response, NextFunction } from 'express';

const client = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
  batchSize: 200,
  flushInterval: 3000,
});

export function apiLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = process.hrtime.bigint();
    const requestSize = parseInt(req.headers['content-length'] || '0', 10);

    // Track response size
    let responseSize = 0;
    const originalEnd = res.end.bind(res);
    res.end = function (chunk: any, ...args: any[]) {
      if (chunk) responseSize += Buffer.byteLength(chunk);
      return originalEnd(chunk, ...args);
    };

    res.on('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - startTime) / 1_000_000n);
      const consumerId = extractConsumerId(req);
      const apiVersion = extractApiVersion(req);

      const metrics = {
        method: req.method,
        path: req.path,
        route: req.route?.path || req.path,  // Route pattern, not actual path
        statusCode: res.statusCode,
        durationMs,
        requestSize,
        responseSize,
        consumerId,
        apiVersion,
        userAgent: req.headers['user-agent'] || null,
        ip: req.ip,
      };

      if (res.statusCode >= 500) {
        client.error('api', `${req.method} ${req.path} ${res.statusCode}`, metrics);
      } else if (res.statusCode >= 400) {
        client.warn('api', `${req.method} ${req.path} ${res.statusCode}`, metrics);
      } else {
        client.info('api', `${req.method} ${req.path} ${res.statusCode}`, metrics);
      }
    });

    next();
  };
}

function extractConsumerId(req: Request): string | null {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) return `key:${apiKey.slice(0, 8)}...`;

  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = JSON.parse(Buffer.from(auth.split('.')[1], 'base64').toString());
      return payload.client_id || payload.sub || null;
    } catch { return null; }
  }
  return null;
}

function extractApiVersion(req: Request): string | null {
  const pathMatch = req.path.match(/^\/(v\d+)\//);
  if (pathMatch) return pathMatch[1];
  return req.headers['x-api-version'] as string || null;
}
```

### 2. Fastify Request Logging Plugin

```typescript
// plugins/api-logger.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { LogTideClient } from '@logtide/sdk-node';

const client = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
  batchSize: 200,
  flushInterval: 3000,
});

const apiLoggerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    request.startTime = process.hrtime.bigint();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const durationMs = Number((process.hrtime.bigint() - request.startTime) / 1_000_000n);

    const metrics = {
      method: request.method,
      route: request.routeOptions?.url || request.url,
      statusCode: reply.statusCode,
      durationMs,
      consumerId: request.headers['x-api-key'] || null,
      ip: request.ip,
    };

    if (reply.statusCode >= 500) {
      client.error('api', `${request.method} ${request.url} ${reply.statusCode}`, metrics);
    } else if (reply.statusCode >= 400) {
      client.warn('api', `${request.method} ${request.url} ${reply.statusCode}`, metrics);
    } else {
      client.info('api', `${request.method} ${request.url} ${reply.statusCode}`, metrics);
    }
  });

  fastify.addHook('onClose', async () => { await client.flush(); });
};

export default fp(apiLoggerPlugin, { name: 'api-logger' });
```

### 3. Latency Percentile Tracking

Average latency hides problems. A p50 of 50ms with a p99 of 5000ms means 1 in 100 users waits 100x longer:

```typescript
// middleware/latency-tracker.ts
import { LogTideClient } from '@logtide/sdk-node';

const client = new LogTideClient({ apiUrl: process.env.LOGTIDE_API_URL!, apiKey: process.env.LOGTIDE_API_KEY! });

const latencyBuffer: Map<string, number[]> = new Map();

export function trackLatency(route: string, durationMs: number) {
  if (!latencyBuffer.has(route)) latencyBuffer.set(route, []);
  latencyBuffer.get(route)!.push(durationMs);
}

// Report percentiles every 60 seconds
setInterval(() => {
  for (const [route, latencies] of latencyBuffer.entries()) {
    if (latencies.length === 0) continue;
    latencies.sort((a, b) => a - b);

    const pct = (p: number) => latencies[Math.max(0, Math.ceil((p / 100) * latencies.length) - 1)];

    client.info('api-metrics', 'API latency report', {
      event: 'api.latency_report',
      route,
      request_count: latencies.length,
      p50_ms: pct(50),
      p95_ms: pct(95),
      p99_ms: pct(99),
      max_ms: latencies[latencies.length - 1],
      avg_ms: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    });

    latencyBuffer.set(route, []);
  }
}, 60_000);
```

### 4. Rate Limit Logging

When you enforce rate limits, log the events for analysis:

```typescript
// middleware/rate-limiter.ts
import { LogTideClient } from '@logtide/sdk-node';
import { Request, Response, NextFunction } from 'express';

const client = new LogTideClient({ apiUrl: process.env.LOGTIDE_API_URL!, apiKey: process.env.LOGTIDE_API_KEY! });

const requestCounts: Map<string, { count: number; resetAt: number }> = new Map();

export function rateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req.headers['x-api-key'] as string) || req.ip || 'anonymous';
    const now = Date.now();

    let entry = requestCounts.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      requestCounts.set(key, entry);
    }
    entry.count++;

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));

    if (entry.count > maxRequests) {
      client.warn('api', 'Rate limit exceeded', {
        event: 'api.rate_limit_exceeded',
        consumer: key,
        path: req.path,
        request_count: entry.count,
        limit: maxRequests,
      });
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    // Warn when approaching limit (80%)
    if (entry.count > maxRequests * 0.8) {
      client.info('api', 'Consumer approaching rate limit', {
        event: 'api.rate_limit_warning',
        consumer: key,
        request_count: entry.count,
        limit: maxRequests,
      });
    }

    next();
  };
}
```

### 5. Consumer Analytics

Track which consumers use which endpoints and how much:

```typescript
// analytics/consumer-tracker.ts
import { LogTideClient } from '@logtide/sdk-node';

const client = new LogTideClient({ apiUrl: process.env.LOGTIDE_API_URL!, apiKey: process.env.LOGTIDE_API_KEY! });

const activity: Map<string, {
  requests: number; errors: number;
  totalLatency: number; endpoints: Record<string, number>;
}> = new Map();

export function trackConsumer(consumerId: string, route: string, status: number, durationMs: number) {
  if (!consumerId) return;
  if (!activity.has(consumerId)) {
    activity.set(consumerId, { requests: 0, errors: 0, totalLatency: 0, endpoints: {} });
  }
  const a = activity.get(consumerId)!;
  a.requests++;
  if (status >= 500) a.errors++;
  a.totalLatency += durationMs;
  a.endpoints[route] = (a.endpoints[route] || 0) + 1;
}

// Report every 5 minutes
setInterval(() => {
  for (const [id, a] of activity.entries()) {
    if (a.requests === 0) continue;
    client.info('api-analytics', 'Consumer activity report', {
      event: 'api.consumer_report',
      consumer_id: id,
      request_count: a.requests,
      error_rate_pct: Math.round((a.errors / a.requests) * 10000) / 100,
      avg_latency_ms: Math.round(a.totalLatency / a.requests),
      top_endpoints: Object.fromEntries(
        Object.entries(a.endpoints).sort((x, y) => y[1] - x[1]).slice(0, 10)
      ),
    });
    activity.set(id, { requests: 0, errors: 0, totalLatency: 0, endpoints: {} });
  }
}, 300_000);
```

### 6. nginx Access Log Integration

Capture nginx access logs upstream of your application for a complete picture:

```nginx
# nginx.conf - Structured JSON access log
log_format logtide_json escape=json
  '{'
    '"timestamp":"$time_iso8601",'
    '"method":"$request_method",'
    '"path":"$uri",'
    '"status":$status,'
    '"body_bytes_sent":$body_bytes_sent,'
    '"request_time":$request_time,'
    '"upstream_response_time":"$upstream_response_time",'
    '"remote_addr":"$remote_addr",'
    '"http_user_agent":"$http_user_agent",'
    '"http_x_api_key":"$http_x_api_key"'
  '}';

access_log /var/log/nginx/api-access.log logtide_json;
```

Ship nginx JSON logs to LogTide with the [nginx integration](/integrations/nginx/) or a log shipper container.

## Real-World Example: Fintech API Platform

A fintech company exposes a payments API to 200+ partners, processing 2 million requests per day.

**Before LogTide:**
- Latency SLAs measured only by synthetic checks every 60s
- Consumer complaints about slowness took days to investigate
- Rate limit violations discovered after the fact
- No per-consumer usage analytics for billing

**After LogTide:**

```
1. Alert: "p99 latency > 2000ms on POST /v1/payments"

2. Query: Recent slow requests
   route:/v1/payments AND durationMs:>2000 AND time:>30m

3. Discovery: 80% of slow requests from consumer "key:a1b2c3d4..."
   They're sending 500-item batch requests (normal is 10-20)

4. Resolution: Contact consumer about batch size limits.
   Add request body size validation.

   Total investigation time: 8 minutes
```

**Results:**
- Latency issues detected in minutes, not days
- Per-consumer SLA tracking automated
- Rate limit abusers identified proactively
- API usage reports generated for billing

## Query Patterns for API Monitoring

```
# Top endpoints by request volume
service:api AND time:>1h | group by route | count | sort desc

# Endpoints with highest error rate
service:api AND time:>1h
  | group by route | ratio(statusCode:>=500) | sort desc

# Slowest endpoints by p99
event:api.latency_report AND time:>1h | sort by p99_ms desc

# Consumers hitting rate limits most
event:api.rate_limit_exceeded AND time:>24h
  | group by consumer | count | sort desc

# API version adoption
service:api AND time:>7d | group by apiVersion | count

# Large response payloads (optimization targets)
service:api AND responseSize:>1000000 AND time:>24h
  | group by route | avg(responseSize) | sort desc
```

## Alerting Configuration

```yaml
# High error rate on any endpoint
- name: api-error-rate
  query: 'service:api AND statusCode:>=500 AND time:>5m'
  threshold: 50
  window: 5m
  severity: critical

# Latency spike
- name: api-latency-spike
  query: 'event:api.latency_report AND p99_ms:>2000'
  threshold: 1
  window: 5m
  severity: warning

# Rate limit abuse
- name: api-rate-limit-abuse
  query: 'event:api.rate_limit_exceeded AND time:>10m'
  threshold: 100
  window: 10m
  severity: warning

# Zero traffic (API may be down)
- name: api-zero-traffic
  query: 'service:api AND time:>5m'
  threshold: 0
  condition: equals
  window: 5m
  severity: critical
```

## API Monitoring Checklist

### Request Logging
- [ ] Every request logged with method, path, status, and latency
- [ ] Route patterns used (not actual paths with IDs) for grouping
- [ ] Request and response sizes captured
- [ ] Consumer identity extracted from API key or JWT
- [ ] API version tracked (header or path-based)

### Latency Tracking
- [ ] High-resolution timing with `process.hrtime.bigint()`
- [ ] Percentile reports generated (p50, p95, p99)
- [ ] Slow request threshold alerts configured
- [ ] Upstream (nginx) and application latency correlated

### Error and Rate Limit Monitoring
- [ ] Error rates calculated per endpoint
- [ ] Status code breakdown tracked
- [ ] Rate limit events logged with consumer identity
- [ ] Approaching-limit warnings generated
- [ ] Abuse patterns detectable through queries

## Common Pitfalls

### 1. "Using the actual path instead of the route pattern"

Logging `/v1/products/abc123` instead of `/v1/products/:id` creates thousands of unique "endpoints" that cannot be grouped or analyzed.

**Solution:** Always use the route pattern from your framework (`req.route.path` in Express, `request.routeOptions.url` in Fastify).

### 2. "Setting alerts on averages"

Average latency of 100ms sounds great. But if p99 is 5000ms, 1% of your users are having a terrible experience.

**Solution:** Alert on percentiles (p95 or p99), not averages. A p99 spike is often the first sign of a systemic issue.

### 3. "Only monitoring from the application layer"

Your application may report 200ms latency, but the user experiences 800ms because of TLS handshake, nginx buffering, and network overhead.

**Solution:** Monitor at both the nginx layer and the application layer. Compare upstream vs. downstream latency to identify infrastructure bottlenecks.

## Next Steps

- [Express Integration](/integrations/express/) - Full Express SDK setup
- [Fastify Integration](/integrations/fastify/) - Fastify plugin configuration
- [nginx Integration](/integrations/nginx/) - Upstream access log shipping
- [Real-Time Alerting](/use-cases/real-time-alerting/) - Configure alert rules
- [Incident Response](/use-cases/incident-response/) - Debug API issues fast

---

**Ready to monitor your API?**

- [Deploy LogTide](https://github.com/logtide-dev/logtide) - Free, open-source
- [Join GitHub Discussions](https://github.com/logtide-dev/logtide/discussions) - Share your API monitoring setup
