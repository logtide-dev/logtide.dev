---
title: "Elysia Framework Logging Integration"
description: "Add structured logging to Elysia applications running on Bun with lifecycle hooks, scoped context, and trace propagation."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:bun"
highlights:
  - "Bun-optimized"
  - "Lifecycle hook integration"
  - "Plugin with .as('global')"
  - "Trace propagation"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases: []
keywords:
  - "elysia logging"
  - "elysia structured logging"
  - "bun logging"
  - "elysia plugin logging"
  - "elysia error tracking"
---

LogTide's Elysia SDK provides a Bun-optimized plugin for automatic request logging, scoped context, lifecycle hooks, and W3C trace propagation.

## Why use LogTide with Elysia?

- **Bun-optimized**: Takes advantage of Bun's performance
- **Plugin architecture**: Use `.as('global')` for app-wide coverage
- **Lifecycle hooks**: onRequest, afterResponse, onError, onStop
- **Scoped context**: Per-request scope via store decorators
- **Auto-shutdown**: Flushes pending logs when the server stops

## Prerequisites

- Bun 1.x
- Elysia 1.x
- LogTide instance with a DSN

## Installation

```bash
bun add @logtide/elysia
```

## Quick Start

```typescript
import { Elysia } from 'elysia';
import * as Logtide from '@logtide/core';
import { logtidePlugin } from '@logtide/elysia';

Logtide.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'elysia-api',
  environment: process.env.NODE_ENV,
});

const app = new Elysia()
  .use(logtidePlugin().as('global'))
  .get('/users/:id', ({ params, store }) => {
    store.logtideScope.setTag('userId', params.id);
    return { id: params.id };
  })
  .listen(3000);
```

Use `.as('global')` to apply the plugin to all routes, including those registered after.

## Plugin Options

```typescript
app.use(logtidePlugin({
  logRequests: true,
  logHeaders: false,
  skip: (ctx) => ctx.path === '/health',
  getLogLevel: (ctx, status) => {
    if (status >= 500) return 'error';
    if (status >= 400) return 'warn';
    return 'info';
  },
}).as('global'));
```

## Scoped Context

```typescript
app
  .use(logtidePlugin().as('global'))
  .derive(({ store, headers }) => {
    store.logtideScope.setUser({ id: headers['x-user-id'] });
    store.logtideScope.setTag('tenant', headers['x-tenant-id']);
    return {};
  })
  .get('/orders', () => {
    Logtide.captureLog('info', 'Listing orders');
    return { orders: [] };
  });
```

## Lifecycle Hooks

| Hook | Behavior |
|------|----------|
| `onRequest` | Creates scope, extracts traceparent, starts span |
| `afterResponse` | Logs completion with duration |
| `onError` | Captures errors with request context |
| `onStop` | Flushes pending events |

## Error Handling

```typescript
app
  .use(logtidePlugin().as('global'))
  .onError(({ code, error, store }) => {
    return new Response(JSON.stringify({
      error: error.message,
      traceId: store.logtideTraceId,
    }), {
      status: code === 'NOT_FOUND' ? 404 : 500,
    });
  });
```

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs) - Core SDK reference
- [Elysia SDK Reference](/docs/sdks/elysia) - Full API documentation
- [Docker Integration](/integrations/docker) - Container deployments
