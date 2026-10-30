---
title: "Express.js Logging Integration"
description: "Add structured logging to Express.js applications with automatic request tracing, scoped context, and error capture."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:express"
highlights:
  - "Automatic request logging"
  - "Per-request scoping"
  - "W3C trace propagation"
  - "Error handler middleware"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "express logging"
  - "express.js structured logging"
  - "express middleware logging"
  - "express request tracing"
  - "node express logs"
faqs:
  - question: "How do I add LogTide logging to an Express.js application?"
    answer: "Install the @logtide/express package with npm and add the logtide() middleware to your Express app using app.use(). Pass your DSN, service name, and environment in the options object - LogTide initialises automatically and every HTTP request is traced as a span without any further code changes."
  - question: "Does the Express integration log every request automatically?"
    answer: "Yes. Once the logtide() middleware is registered, every HTTP request is recorded as a trace span with method, path, status code, duration, client IP, and user agent attributes, and 5xx responses are also logged as error entries - with no manual instrumentation required."
  - question: "Can I attach per-request context like user ID or tenant to Express logs?"
    answer: "Yes. Inside any route or middleware you can call req.logtideScope.setTag() or req.logtideScope.setExtra() to attach custom fields. Those fields are attached to the log entries and errors LogTide captures with that request's scope (such as 5xx error logs and errors passed through logtideErrorHandler())."
  - question: "Will adding LogTide middleware slow down my Express server?"
    answer: "No. Logging is non-blocking - log events are buffered and shipped asynchronously so request handling is never delayed. The middleware also propagates W3C traceparent headers at no extra cost."
---

LogTide's Express SDK provides drop-in middleware for automatic request logging, per-request context scoping, and distributed tracing with W3C Trace Context.

## Why use LogTide with Express?

- **Zero-config request tracing**: Every HTTP request recorded as a span automatically, 5xx responses logged as errors
- **Per-request scoping**: Attach user, tenant, and custom tags to all logs in a request
- **Distributed tracing**: W3C traceparent headers propagated automatically
- **Error capture**: Errors captured with request context via `logtideErrorHandler()`
- **Non-blocking**: Logging never slows down your request handling

## Prerequisites

- Node.js 18+
- Express 4.x or 5.x
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/express
```

This includes `@logtide/core` as a dependency.

## Quick Start

```typescript
import express from 'express';
import { hub } from '@logtide/core';
import { logtide, logtideErrorHandler } from '@logtide/express';

const app = express();

// Add LogTide middleware (initializes LogTide automatically)
app.use(logtide({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
  environment: process.env.NODE_ENV,
}));

app.get('/users/:id', (req, res) => {
  req.logtideScope?.setTag('userId', req.params.id);
  res.json({ id: req.params.id });
});

app.listen(3000);
```

## Middleware Configuration

```typescript
app.use(logtide({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
  environment: process.env.NODE_ENV,
  release: '1.0.0',
  tracesSampleRate: 1.0,
}));
```

## Per-Request Context

Attach context to all logs within a request:

```typescript
app.use((req, res, next) => {
  if (req.user) {
    req.logtideScope?.setExtra('userId', req.user.id);
    req.logtideScope?.setExtra('email', req.user.email);
  }
  req.logtideScope?.setTag('tenant', String(req.headers['x-tenant-id']));
  next();
});
```

## Trace Propagation

The middleware extracts incoming `traceparent` headers and makes the trace ID available:

```typescript
app.get('/api/data', async (req, res) => {
  // Include trace ID in responses for debugging
  res.set('X-Trace-Id', req.logtideTraceId);
  res.json({ data: [] });
});
```

## Error Handling

```typescript
// The middleware records 5xx responses as error logs. To capture the
// thrown error itself, register logtideErrorHandler() after your routes:
app.use(logtideErrorHandler());

// Then your own error response handler:
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: err.message,
    traceId: req.logtideTraceId,
  });
});
```

## Request Tracing Output

Each request produces a span (sent as a trace) named after the method and path, for example `GET /users/123`, with attributes such as:

```json
{
  "http.method": "GET",
  "http.target": "/users/123",
  "http.route": "/users/:id",
  "http.status_code": 200,
  "duration_ms": 45,
  "net.peer.ip": "192.168.1.1",
  "http.user_agent": "Mozilla/5.0..."
}
```

Responses with a 5xx status additionally produce an error log entry (`HTTP 500 GET /users/123`).

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs/) - Core SDK reference
- [Express SDK Reference](/docs/sdks/express/) - Full API documentation
- [Docker Integration](/integrations/docker/) - Container deployments
