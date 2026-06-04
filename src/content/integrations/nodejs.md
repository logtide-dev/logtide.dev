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
faqs:
  - question: "How do I send Node.js application logs to LogTide?"
    answer: "Install @logtide/core, call hub.init with your DSN and service name, then use hub.captureLog to emit structured logs at levels like debug, info, warn, error, and critical. Logs are automatically batched and flushed every 5 seconds or after 100 entries by default."
  - question: "Does the LogTide Node.js SDK support TypeScript?"
    answer: "Yes. @logtide/core ships with full TypeScript type definitions and works with Node.js 18 or later. Framework-specific packages such as @logtide/express, @logtide/fastify, and @logtide/nextjs are also available and equally typed."
  - question: "What is the performance overhead of using the LogTide JavaScript SDK?"
    answer: "According to this guide, the SDK adds approximately 5 MB of memory, less than 1 ms of latency per log call (due to batching), and under 0.1% CPU impact. A single network call is made per batch of up to 100 logs."
  - question: "Can I automatically capture console.log calls without changing all my existing code?"
    answer: "Yes. Pass new ConsoleIntegration() in the integrations array when calling hub.init, and the SDK will intercept console.warn and console.error calls and forward them to LogTide automatically."
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
import { hub } from '@logtide/core';

hub.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
  environment: process.env.NODE_ENV,
  release: '1.0.0',
});

// Capture logs
hub.captureLog('info', 'Application started', {
  version: '1.0.0',
  environment: process.env.NODE_ENV,
});

// Different log levels
hub.captureLog('debug', 'Debug information');
hub.captureLog('info', 'User logged in', { userId: '123' });
hub.captureLog('warn', 'Rate limit approaching', { current: 90, max: 100 });
hub.captureLog('error', 'Failed to process payment', { orderId: '456' });
hub.captureLog('critical', 'Database connection lost');

// Graceful shutdown - flush remaining logs
process.on('SIGTERM', async () => {
  await hub.close();
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
hub.init({
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
  circuitBreakerResetMs: 30000,

  // Tracing (optional)
  tracesSampleRate: 1.0,

  // Integrations (optional)
  integrations: [
    new ConsoleIntegration(),
    new GlobalErrorIntegration(),
  ],
});
```

## Express.js Integration

For Express apps, use the dedicated `@logtide/express` package:

```typescript
import express from 'express';
import { hub } from '@logtide/core';
import { logtide } from '@logtide/express';

const app = express();
app.use(logtide({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
}));

app.get('/users/:id', (req, res) => {
  req.logtideScope.setTag('userId', req.params.id);
  res.json({ id: req.params.id });
});
```

See the [Express integration guide](/integrations/express/) for full details.

## Fastify Integration

For Fastify apps, use the dedicated `@logtide/fastify` package:

```typescript
import Fastify from 'fastify';
import { logtide } from '@logtide/fastify';

const fastify = Fastify();
await fastify.register(logtide, {
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
});

fastify.get('/users/:id', async (request) => {
  request.logtideScope.setTag('userId', request.params.id);
  return { id: request.params.id };
});
```

See the [Fastify integration guide](/integrations/fastify/) for full details.

## Error Capture

```typescript
try {
  await processPayment(orderId);
} catch (error) {
  hub.captureError(error, {
    extra: { orderId },
    tags: { module: 'payments' },
  });
}
```

## Scopes & Breadcrumbs

```typescript
// Add breadcrumbs for debugging context
hub.addBreadcrumb({
  category: 'auth',
  message: 'User authenticated',
  level: 'info',
});

// Framework SDKs create per-request scopes automatically.
// For manual scopes:
const client = hub.getClient();
const scope = client.createScope();
scope.setTag('handler', 'payment');
scope.setExtra('userId', 'user-123');
client.captureError(new Error('Payment failed'), {}, scope);
```

## Console Interception

```typescript
import { hub, ConsoleIntegration } from '@logtide/core';

hub.init({
  dsn: process.env.LOGTIDE_DSN,
  integrations: [
    new ConsoleIntegration(),
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
  await hub.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### 2. Set Environment and Release

```typescript
hub.init({
  dsn: process.env.LOGTIDE_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version,
});
```

### 3. Don't Log Sensitive Data

```typescript
// Avoid logging sensitive data in metadata
hub.captureLog('info', 'User action', {
  userId: user.id,
  // Don't include: passwords, tokens, credit cards
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
| [`@logtide/express`](/integrations/express/) | Express.js |
| [`@logtide/fastify`](/integrations/fastify/) | Fastify |
| [`@logtide/nextjs`](/integrations/nextjs/) | Next.js |
| [`@logtide/nuxt`](/integrations/nuxt/) | Nuxt |
| [`@logtide/sveltekit`](/integrations/sveltekit/) | SvelteKit |
| [`@logtide/hono`](/integrations/hono/) | Hono |
| [`@logtide/angular`](/integrations/angular/) | Angular |
| [`@logtide/elysia`](/integrations/elysia/) | Elysia |

## Next Steps

- [JavaScript SDK Reference](/docs/sdks/nodejs/) - Full API documentation
- [Docker Integration](/integrations/docker/) - Containerized deployments
- [GDPR Compliance](/use-cases/gdpr-compliance/) - Privacy-compliant logging
