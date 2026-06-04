---
title: "Incident Response with Structured Logs"
description: "Reduce MTTR with structured logging, correlation IDs, and runbook-driven incident management using LogTide."
category: "operations"
difficulty: "advanced"
icon: "lucide:siren"
industries:
  - "SaaS"
  - "Fintech"
  - "E-commerce"
  - "DevOps"
highlights:
  - "Reduce MTTR by 50%"
  - "Request correlation"
  - "Runbook integration"
  - "Post-mortem workflows"
relatedIntegrations:
  - "nodejs"
  - "nginx"
  - "kubernetes"
relatedUseCases:
  - "security-monitoring"
  - "real-time-alerting"
keywords:
  - "incident response logging"
  - "MTTR reduction"
  - "production debugging"
  - "on-call"
  - "incident management"
  - "observability"
faqs:
  - question: "How does LogTide help reduce MTTR during incidents?"
    answer: "LogTide reduces MTTR by giving on-call engineers a single place to search structured logs with correlation IDs, so they can trace a failing request across every service in seconds instead of grepping through fragmented log files. Structured events with consistent fields and alert-driven detection mean issues are surfaced and triaged faster."
  - question: "What is request correlation and why does it matter for incident response?"
    answer: "Request correlation assigns a unique trace ID to every incoming request and forwards it through every downstream service call. During an incident, a single query like trace_id:abc-123 in LogTide instantly shows the complete timeline of that request across all services, eliminating the 30+ minutes teams typically spend reconstructing what happened."
  - question: "Does LogTide support post-mortem workflows?"
    answer: "Yes. LogTide stores structured, timestamped log events that you can query by trace ID and time range to reconstruct an exact incident timeline. This data feeds directly into post-mortem documents and helps teams identify detection gaps and implement improvements."
  - question: "Can LogTide alert on-call engineers when errors spike in production?"
    answer: "Yes. LogTide supports threshold-based alert rules that fire on error counts, log patterns, or health check failures within configurable time windows. Alerts are delivered via email or webhook, enabling routing to Slack, PagerDuty, or any on-call tool."
---

When production breaks at 3 AM, the difference between a 5-minute fix and a 3-hour outage comes down to one thing: can you find the relevant logs fast enough? This guide shows how to structure your logging for rapid incident response with LogTide.

## The Incident Response Problem

### What Goes Wrong During Incidents

Most teams waste time during incidents because:

```typescript
// ❌ BAD: Unstructured log that's useless during incidents
console.log('Error processing request');

// ❌ BAD: No correlation between services
logger.error('Payment failed');
// Which user? Which order? Which service triggered this?

// ❌ BAD: Missing context
logger.error('Database timeout');
// Which query? How long did it wait? Is it the primary or replica?
```

**Common time sinks during incidents:**
- 30+ minutes searching for the right logs
- No way to trace a request across services
- Key context missing from error messages
- No timeline of events leading to the failure
- Multiple team members searching independently

### The Cost of Slow Incident Response

| Metric | Impact |
|--------|--------|
| MTTR > 30 min | Lost revenue, SLA violations |
| MTTR > 1 hour | Customer churn, brand damage |
| MTTR > 4 hours | Regulatory reporting (for financial services) |
| Repeat incidents | Team burnout, on-call fatigue |

## The LogTide Approach

Build your logging for incident response from day one:

1. **Structured events** with consistent fields
2. **Correlation IDs** that trace across services
3. **Context-rich errors** with debugging data
4. **Alert-driven detection** for fast notification
5. **Real-time streaming** for live investigation
6. **Built-in incidents** for tracking and post-mortems

## Implementation

### 1. Request Correlation

Every request gets a trace ID that follows it across all services:

```typescript
// middleware/correlation.ts
import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

interface RequestContext {
  requestId: string;
  traceId: string;
  spanId: string;
  userId?: string;
  service: string;
  startTime: number;
}

export const requestStorage = new AsyncLocalStorage<RequestContext>();

export function correlationMiddleware(serviceName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const context: RequestContext = {
      requestId: req.headers['x-request-id'] as string || crypto.randomUUID(),
      traceId: req.headers['x-trace-id'] as string || crypto.randomUUID(),
      spanId: crypto.randomUUID().split('-')[0],
      userId: req.user?.id,
      service: serviceName,
      startTime: Date.now(),
    };

    // Pass correlation headers to downstream services
    res.setHeader('x-request-id', context.requestId);
    res.setHeader('x-trace-id', context.traceId);

    requestStorage.run(context, () => next());
  };
}

export function getContext(): RequestContext | undefined {
  return requestStorage.getStore();
}
```

### 2. Context-Rich Logger

```typescript
// lib/logger.ts
import { LogTideClient } from '@logtide/sdk-node';
import { getContext } from './middleware/correlation';

const client = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
  // Or use a DSN string instead:
  // dsn: process.env.LOGTIDE_DSN,
});

function enrichMetadata(metadata: Record<string, unknown> = {}) {
  const ctx = getContext();
  if (!ctx) return metadata;

  return {
    ...metadata,
    request_id: ctx.requestId,
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    user_id: ctx.userId,
    service: ctx.service,
    duration_ms: Date.now() - ctx.startTime,
  };
}

export const logger = {
  info(message: string, metadata?: Record<string, unknown>) {
    const ctx = getContext();
    client.info(ctx?.service || 'app', message, enrichMetadata(metadata));
  },

  warn(message: string, metadata?: Record<string, unknown>) {
    const ctx = getContext();
    client.warn(ctx?.service || 'app', message, enrichMetadata(metadata));
  },

  error(message: string, metadata?: Record<string, unknown>) {
    const ctx = getContext();
    client.error(ctx?.service || 'app', message, enrichMetadata(metadata));
  },

  // Special method for incident-critical events
  critical(message: string, metadata?: Record<string, unknown>) {
    const ctx = getContext();
    client.critical(ctx?.service || 'app', message, enrichMetadata({
      ...metadata,
      incident_relevant: true,
    }));
  },
};
```

### 3. Error Logging with Context

```typescript
// ✅ GOOD: Rich context for debugging
app.post('/api/orders', async (req, res) => {
  const { items, paymentMethod } = req.body;

  logger.info('Order creation started', {
    itemCount: items.length,
    paymentMethod,
    totalAmount: calculateTotal(items),
  });

  try {
    // Step 1: Validate inventory
    const inventory = await checkInventory(items);
    if (!inventory.available) {
      logger.warn('Order failed: insufficient inventory', {
        unavailableItems: inventory.unavailable,
        requestedItems: items.map(i => i.sku),
      });
      return res.status(400).json({ error: 'Items unavailable' });
    }

    // Step 2: Process payment
    const payment = await processPayment({
      amount: calculateTotal(items),
      method: paymentMethod,
      userId: req.user.id,
    });

    logger.info('Payment processed', {
      paymentId: payment.id,
      amount: payment.amount,
      processingTimeMs: payment.duration,
    });

    // Step 3: Create order
    const order = await createOrder({
      userId: req.user.id,
      items,
      paymentId: payment.id,
    });

    logger.info('Order created successfully', {
      orderId: order.id,
      itemCount: items.length,
      totalAmount: order.total,
    });

    res.json(order);
  } catch (error) {
    // ✅ Rich error context for incident response
    logger.error('Order creation failed', {
      error: error.message,
      errorCode: error.code,
      stack: error.stack,
      step: error.step || 'unknown',
      itemCount: items.length,
      paymentMethod,
      // Include enough to reproduce without exposing PII
    });

    res.status(500).json({ error: 'Order failed' });
  }
});
```

### 4. Service-to-Service Correlation

When calling downstream services, forward correlation headers:

```typescript
// lib/http-client.ts
import { getContext } from './middleware/correlation';

export async function serviceCall(url: string, options: RequestInit = {}) {
  const ctx = getContext();
  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
  };

  if (ctx) {
    headers['x-request-id'] = ctx.requestId;
    headers['x-trace-id'] = ctx.traceId;
    headers['x-caller-service'] = ctx.service;
  }

  const startTime = Date.now();

  try {
    const response = await fetch(url, { ...options, headers });
    const duration = Date.now() - startTime;

    logger.info('Service call completed', {
      target_url: url,
      status: response.status,
      duration_ms: duration,
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Service call failed', {
      target_url: url,
      error: error.message,
      duration_ms: duration,
    });

    throw error;
  }
}
```

### 5. Health Check Logging

```typescript
// health/checks.ts
import { logger } from '@/lib/logger';

interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
  critical: boolean;
}

const checks: HealthCheck[] = [
  {
    name: 'database',
    check: async () => {
      const start = Date.now();
      await db.$queryRaw`SELECT 1`;
      return Date.now() - start < 5000;
    },
    critical: true,
  },
  {
    name: 'redis',
    check: async () => {
      await redis.ping();
      return true;
    },
    critical: false,
  },
  {
    name: 'external_api',
    check: async () => {
      const res = await fetch('https://api.payment.com/health');
      return res.ok;
    },
    critical: true,
  },
];

export async function runHealthChecks() {
  const results = await Promise.allSettled(
    checks.map(async (check) => {
      try {
        const healthy = await check.check();
        return { name: check.name, healthy, critical: check.critical };
      } catch (error) {
        return { name: check.name, healthy: false, critical: check.critical, error: error.message };
      }
    })
  );

  const unhealthy = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(r => r && !r.healthy);

  if (unhealthy.length > 0) {
    const criticalDown = unhealthy.filter(r => r.critical);

    if (criticalDown.length > 0) {
      logger.critical('Critical health check failure', {
        failed: criticalDown.map(r => r.name),
        errors: criticalDown.map(r => ({ name: r.name, error: r.error })),
      });
    } else {
      logger.warn('Non-critical health check failure', {
        failed: unhealthy.map(r => r.name),
      });
    }
  }

  return results;
}
```

## Incident Response Workflow

### Phase 1: Detection (0-5 minutes)

LogTide detects the issue through:
- Alert rules trigger on error thresholds
- Sigma detection rules fire on patterns
- Health check failures are logged

### Phase 2: Triage (5-10 minutes)

The on-call engineer investigates in LogTide:

**"What's happening right now?"**
```
level:error AND time:>5m
```

**"Which services are affected?"**
```
level:error AND time:>15m | group by service
```

**"What changed recently?"**
```
service:audit AND action:deployment.* AND time:>1h
```

### Phase 3: Investigation (10-20 minutes)

**Trace a specific request:**
```
trace_id:abc-123-def
```

**Find the root cause:**
```
service:payment-api AND level:error AND time:>30m
```

**Check if it's a known pattern:**
```
error_code:ECONNREFUSED AND service:payment-api
```

### Phase 4: Resolution

Fix the issue, verify with real-time streaming, then document.

### Phase 5: Post-Mortem

Use LogTide data for the post-mortem timeline:

```typescript
// Generate incident timeline from logs
async function generateTimeline(
  traceId: string,
  startTime: string,
  endTime: string
) {
  const events = await logtide.search({
    q: `trace_id:${traceId} OR incident_relevant:true`,
    from: startTime,
    to: endTime,
    sort: 'asc',
  });

  return events.map(event => ({
    time: event.timestamp,
    service: event.service,
    level: event.level,
    message: event.message,
    metadata: event.metadata,
  }));
}
```

## Incident Response Checklist

- [ ] **Logging Infrastructure**
    - [ ] Correlation IDs (request_id, trace_id) in all logs
    - [ ] Context-rich error messages
    - [ ] Service-to-service header forwarding
    - [ ] Health check logging

- [ ] **Alert Configuration**
    - [ ] Error rate alerts per service
    - [ ] Latency alerts (p99 > threshold)
    - [ ] Health check failure alerts
    - [ ] Critical business event alerts

- [ ] **On-Call Preparedness**
    - [ ] Common LogTide queries documented
    - [ ] Runbook for each service
    - [ ] Escalation paths defined
    - [ ] Access to LogTide verified for all on-call

- [ ] **Post-Incident**
    - [ ] Timeline generation from logs
    - [ ] Root cause analysis process
    - [ ] Action items tracked
    - [ ] Detection improvements implemented

## Common Pitfalls

### 1. "We'll add correlation IDs later"

By the time you need them during an incident, it's too late.

**Solution:** Add correlation middleware on day one. It's a one-time setup.

### 2. "Our error messages are descriptive enough"

`"Database error"` tells you nothing. `"PostgreSQL connection timeout after 5000ms to primary db at db.internal:5432"` tells you everything.

**Solution:** Include the what, where, and why in every error log.

### 3. "We don't need structured logging, grep works fine"

Grep through 500 GB of unstructured logs during a 3 AM incident. Good luck.

**Solution:** Use structured JSON logs with consistent fields from the start.

## Performance Considerations

| Aspect | Impact | Mitigation |
|--------|--------|------------|
| Correlation middleware | <1ms per request | AsyncLocalStorage is fast |
| Extra metadata fields | ~100 bytes per log | Negligible at any volume |
| Service call logging | <1ms per call | Async, non-blocking |
| Health checks | 1-5 seconds | Run in background, cache results |

## Next Steps

- [Node.js SDK](/integrations/nodejs/) - Full logging setup
- [nginx Integration](/integrations/nginx/) - Web server logging
- [Real-Time Alerting](/use-cases/real-time-alerting/) - Alert configuration
- [Security Monitoring](/use-cases/security-monitoring/) - Threat detection

---

**Ready to improve your incident response?**

- [Deploy LogTide](https://github.com/logtide-dev/logtide) - Free, open-source
- [Join GitHub Discussions](https://github.com/logtide-dev/logtide/discussions) - Share your incident response setup
