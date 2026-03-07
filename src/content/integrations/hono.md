---
title: "Hono Framework Logging Integration"
description: "Add structured logging to Hono applications across Node.js, Bun, Deno, and Cloudflare Workers with trace propagation."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:hono"
highlights:
  - "Multi-runtime support"
  - "Context-based scoping"
  - "Lightweight middleware"
  - "Trace propagation"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases: []
keywords:
  - "hono logging"
  - "hono structured logging"
  - "hono middleware logging"
  - "cloudflare workers logging"
  - "bun hono logging"
---

LogTide's Hono SDK provides lightweight middleware for automatic request logging and distributed tracing across all Hono-supported runtimes: Node.js, Bun, Deno, and Cloudflare Workers.

## Why use LogTide with Hono?

- **Multi-runtime**: Same code on Node.js, Bun, Deno, and Workers
- **Lightweight**: Minimal overhead, fetch-based transport
- **Context-based**: Uses Hono's `c.get()`/`c.set()` for scoping
- **Trace propagation**: W3C traceparent headers across services
- **Automatic**: Request logging without manual instrumentation

## Prerequisites

- Hono 4.x
- Node.js 18+, Bun, Deno, or Cloudflare Workers
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/hono
# or
bun add @logtide/hono
```

## Quick Start

```typescript
import { Hono } from 'hono';
import { hub } from '@logtide/core';
import { logtide } from '@logtide/hono';

const app = new Hono();
app.use('*', logtide({
  dsn: process.env.LOGTIDE_DSN,
  service: 'hono-api',
  environment: process.env.NODE_ENV,
}));

app.get('/users/:id', (c) => {
  c.get('logtideScope').setTag('userId', c.req.param('id'));

  hub.captureLog('info', 'Fetching user', {
    userId: c.req.param('id'),
  });

  return c.json({ id: c.req.param('id') });
});

export default app;
```

## Middleware Options

```typescript
app.use('*', logtide({
  dsn: process.env.LOGTIDE_DSN,
  service: 'hono-api',
  environment: process.env.NODE_ENV,
  release: '1.0.0',
  tracesSampleRate: 1.0,
}));
```

## Context-Based Scoping

```typescript
app.get('/orders', (c) => {
  const scope = c.get('logtideScope');
  scope.setExtra('userId', 'user-123');
  scope.setTag('module', 'orders');

  const traceId = c.get('logtideTraceId');

  return c.json({ orders: [], traceId });
});
```

## Runtime Examples

### Node.js

```typescript
import { serve } from '@hono/node-server';
serve(app, { port: 3000 });
```

### Bun

```typescript
export default { port: 3000, fetch: app.fetch };
```

### Cloudflare Workers

```typescript
export default app;
```

### Deno

```typescript
Deno.serve(app.fetch);
```

## Error Handling

```typescript
app.onError((err, c) => {
  // Errors are captured automatically by the middleware
  return c.json({
    error: err.message,
    traceId: c.get('logtideTraceId'),
  }, 500);
});
```

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs/) - Core SDK reference
- [Hono SDK Reference](/docs/sdks/hono/) - Full API documentation
- [Docker Integration](/integrations/docker/) - Container deployments
