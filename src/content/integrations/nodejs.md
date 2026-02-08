---
title: "Node.js SDK Integration"
description: "Send structured logs from Node.js applications to LogTide with automatic batching, retries, and console interception."
category: "language"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:nodedotjs"
highlights:
  - "DSN-based configuration"
  - "Distributed tracing"
  - "Breadcrumbs & scopes"
  - "TypeScript support"
relatedIntegrations:
  - "docker"
  - "express"
  - "fastify"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "nodejs logging"
  - "node.js logs"
  - "javascript logging"
  - "typescript logging"
  - "node structured logging"
---

The LogTide JavaScript SDK (`@logtide/core`) provides structured logging with DSN-based configuration, automatic batching, distributed tracing (W3C Trace Context), breadcrumbs, and scopes.

## Why use the LogTide JavaScript SDK?

- **DSN-based config**: Single connection string for all settings
- **Distributed tracing**: W3C Trace Context propagation across services
- **Breadcrumbs**: Trail of events leading up to errors
- **Scopes**: Per-request context isolation
- **Console interception**: Capture `console.log()` calls automatically
- **TypeScript**: Full type definitions included

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm, yarn, or pnpm
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/core
```

For framework-specific integration, install the corresponding package instead:

```bash
npm install @logtide/express    # Express.js
npm install @logtide/fastify    # Fastify
npm install @logtide/nextjs     # Next.js
npm install @logtide/nuxt       # Nuxt
npm install @logtide/sveltekit  # SvelteKit
npm install @logtide/hono       # Hono
npm install @logtide/angular    # Angular
npm install @logtide/elysia     # Elysia
```

## Quick Start (5 minutes)

### Basic Setup

```typescript
import * as Logtide from '@logtide/core';

Logtide.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
  environment: process.env.NODE_ENV,
  release: '1.0.0',
});

// Capture logs
Logtide.captureLog('info', 'Application started', {
  version: '1.0.0',
  environment: process.env.NODE_ENV,
});

// Different log levels
Logtide.captureLog('debug', 'Debug information');
Logtide.captureLog('info', 'User logged in', { userId: '123' });
Logtide.captureLog('warn', 'Rate limit approaching', { current: 90, max: 100 });
Logtide.captureLog('error', 'Failed to process payment', { orderId: '456' });
Logtide.captureLog('critical', 'Database connection lost');

// Graceful shutdown - flush remaining logs
process.on('SIGTERM', async () => {
  await Logtide.close();
  process.exit(0);
});
```

### Environment Variables

Store your DSN in an environment variable:

```bash
# .env
LOGTIDE_DSN=https://lp_abc123@api.logtide.dev
```

## Configuration Options

```typescript
Logtide.init({
  // Required
  dsn: process.env.LOGTIDE_DSN,

  // Recommended
  service: 'api-server',
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version,

  // Batching (optional)
  batchSize: 100,        // Flush after N logs (default: 100)
  flushInterval: 5000,   // Flush every N ms (default: 5000)

  // Reliability (optional)
  maxRetries: 3,
  circuitBreakerThreshold: 5,
  circuitBreakerTimeout: 60000,

  // Tracing (optional)
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/^https:\/\/api\.example\.com/],

  // Integrations (optional)
  integrations: [
    Logtide.consoleIntegration(),
    Logtide.globalErrorIntegration(),
  ],
});
```

## Express.js Integration

For Express apps, use the dedicated `@logtide/express` package:

```typescript
import express from 'express';
import * as Logtide from '@logtide/core';
import { logtide, logtideErrorHandler } from '@logtide/express';

Logtide.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
});

const app = express();
app.use(logtide());

app.get('/users/:id', (req, res) => {
  req.logtideScope.setTag('userId', req.params.id);
  res.json({ id: req.params.id });
});

app.use(logtideErrorHandler());
```

See the [Express integration guide](/integrations/express) for full details.

## Fastify Integration

For Fastify apps, use the dedicated `@logtide/fastify` package:

```typescript
import Fastify from 'fastify';
import * as Logtide from '@logtide/core';
import { logtidePlugin } from '@logtide/fastify';

Logtide.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
});

const fastify = Fastify();
await fastify.register(logtidePlugin);

fastify.get('/users/:id', async (request) => {
  request.logtideScope.setTag('userId', request.params.id);
  return { id: request.params.id };
});
```

See the [Fastify integration guide](/integrations/fastify) for full details.

## Error Capture

```typescript
try {
  await processPayment(orderId);
} catch (error) {
  Logtide.captureError(error, {
    extra: { orderId },
    tags: { module: 'payments' },
  });
}
```

## Scopes & Breadcrumbs

```typescript
// Add breadcrumbs for debugging context
Logtide.addBreadcrumb({
  category: 'auth',
  message: 'User authenticated',
  level: 'info',
});

// Use scopes for per-request context
Logtide.withScope((scope) => {
  scope.setTag('handler', 'payment');
  scope.setUser({ id: 'user-123' });
  Logtide.captureError(new Error('Payment failed'));
});
```

## Console Interception

```typescript
Logtide.init({
  dsn: process.env.LOGTIDE_DSN,
  integrations: [
    Logtide.consoleIntegration({
      levels: ['warn', 'error'],
    }),
  ],
});

// Automatically captured:
console.warn('Disk space low');
console.error('Connection timeout');
```

## Production Best Practices

### 1. Always Close on Shutdown

```typescript
const shutdown = async () => {
  await Logtide.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### 2. Set Environment and Release

```typescript
Logtide.init({
  dsn: process.env.LOGTIDE_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version,
});
```

### 3. Don't Log Sensitive Data

```typescript
// Use beforeSend to filter sensitive data
Logtide.init({
  dsn: process.env.LOGTIDE_DSN,
  beforeSend: (event) => {
    // Strip sensitive headers
    delete event.metadata?.authorization;
    return event;
  },
});
```

### 4. Use Appropriate Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Detailed debugging info (disabled in production) |
| `info` | Normal operations: requests, user actions |
| `warn` | Recoverable issues: rate limits, retries |
| `error` | Failures that need attention |
| `critical` | System failures requiring immediate action |

## Performance

| Metric | Value |
|--------|-------|
| Memory overhead | ~5MB |
| Latency (batched) | <1ms per log |
| Network calls | 1 per batch (100 logs default) |
| CPU impact | <0.1% |

## Framework Packages

| Package | Framework |
|---------|-----------|
| [`@logtide/express`](/integrations/express) | Express.js |
| [`@logtide/fastify`](/integrations/fastify) | Fastify |
| [`@logtide/nextjs`](/integrations/nextjs) | Next.js |
| [`@logtide/nuxt`](/integrations/nuxt) | Nuxt |
| [`@logtide/sveltekit`](/integrations/sveltekit) | SvelteKit |
| [`@logtide/hono`](/integrations/hono) | Hono |
| [`@logtide/angular`](/integrations/angular) | Angular |
| [`@logtide/elysia`](/integrations/elysia) | Elysia |

## Next Steps

- [JavaScript SDK Reference](/docs/sdks/nodejs) - Full API documentation
- [Docker Integration](/integrations/docker) - Containerized deployments
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy-compliant logging
