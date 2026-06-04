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
faqs:
  - question: "How do I add LogTide logging to an Elysia application?"
    answer: "Install @logtide/elysia with bun add @logtide/elysia, then call app.use(logtide({ dsn, service, environment })) in your Elysia setup. Use .as('global') on the plugin to ensure all routes, including those registered after the plugin, are covered."
  - question: "Does the LogTide Elysia plugin automatically log every request?"
    answer: "Yes. The plugin hooks into Elysia's onRequest lifecycle to start a span and extract any incoming traceparent header, and into afterResponse to log the completed request with its duration, with no per-route code required."
  - question: "How does LogTide handle Elysia errors and exceptions?"
    answer: "The plugin registers an onError lifecycle hook that captures errors with full request context automatically. You can still add your own onError handler to return a custom response; the error is already recorded by LogTide before your handler runs."
  - question: "Does LogTide flush pending logs when the Elysia server stops?"
    answer: "Yes. The plugin registers an onStop lifecycle hook that flushes any buffered log events before the process exits, ensuring no logs are lost during graceful shutdown."
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
import { hub } from '@logtide/core';
import { logtide } from '@logtide/elysia';

const app = new Elysia()
  .use(logtide({
    dsn: process.env.LOGTIDE_DSN,
    service: 'elysia-api',
    environment: process.env.NODE_ENV,
  }))
  .get('/users/:id', ({ params }) => {
    hub.captureLog('info', 'Fetching user', { userId: params.id });
    return { id: params.id };
  })
  .listen(3000);
```

Use `.as('global')` to apply the plugin to all routes, including those registered after.

## Plugin Options

```typescript
app.use(logtide({
  dsn: process.env.LOGTIDE_DSN,
  service: 'elysia-api',
  environment: process.env.NODE_ENV,
  release: '1.0.0',
  tracesSampleRate: 1.0,
}));
```

## Scoped Context

```typescript
app
  .use(logtide({
    dsn: process.env.LOGTIDE_DSN,
    service: 'elysia-api',
  }))
  .get('/orders', () => {
    hub.captureLog('info', 'Listing orders');
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
  .use(logtide({
    dsn: process.env.LOGTIDE_DSN,
    service: 'elysia-api',
  }))
  .onError(({ code, error }) => {
    // Error is already captured by the plugin
    return new Response(JSON.stringify({
      error: error.message,
    }), {
      status: code === 'NOT_FOUND' ? 404 : 500,
    });
  });
```

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs/) - Core SDK reference
- [Elysia SDK Reference](/docs/sdks/elysia/) - Full API documentation
- [Docker Integration](/integrations/docker/) - Container deployments
