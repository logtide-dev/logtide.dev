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
---

LogTide's Express SDK provides drop-in middleware for automatic request logging, per-request context scoping, and distributed tracing with W3C Trace Context.

## Why use LogTide with Express?

- **Zero-config request logging**: Every HTTP request/response logged automatically
- **Per-request scoping**: Attach user, tenant, and custom tags to all logs in a request
- **Distributed tracing**: W3C traceparent headers propagated automatically
- **Error capture**: Unhandled errors captured with full request context
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
import { logtide } from '@logtide/express';

const app = express();

// Add LogTide middleware (initializes LogTide automatically)
app.use(logtide({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
  environment: process.env.NODE_ENV,
}));

app.get('/users/:id', (req, res) => {
  req.logtideScope.setTag('userId', req.params.id);
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
    req.logtideScope.setExtra('userId', req.user.id);
    req.logtideScope.setExtra('email', req.user.email);
  }
  req.logtideScope.setTag('tenant', req.headers['x-tenant-id']);
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
// The middleware automatically captures 5xx errors.
// Your error response handler:
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: err.message,
    traceId: req.logtideTraceId,
  });
});
```

## Request Logging Output

Each request generates a structured log:

```json
{
  "level": "info",
  "message": "GET /users/123 200",
  "service": "api-server",
  "metadata": {
    "method": "GET",
    "path": "/users/123",
    "statusCode": 200,
    "duration": 45,
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
  }
}
```

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs) - Core SDK reference
- [Express SDK Reference](/docs/sdks/express) - Full API documentation
- [Docker Integration](/integrations/docker) - Container deployments
