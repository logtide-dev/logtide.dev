---
title: "Bun Runtime Logging Integration"
description: "Run the LogTide JavaScript SDK on Bun for fast structured logging with native TypeScript support and zero-config setup."
category: "language"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:bun"
highlights:
  - "Native TypeScript support"
  - "Node.js SDK compatible"
  - "Faster startup & runtime"
  - "Built-in .env loading"
relatedIntegrations:
  - "nodejs"
  - "hono"
  - "elysia"
  - "docker"
relatedUseCases: []
keywords:
  - "bun logging"
  - "bun structured logging"
  - "bun observability"
  - "bun typescript logging"
  - "bun runtime logs"
---

Bun is a fast JavaScript runtime that is Node.js API compatible. The LogTide JavaScript SDK works with Bun out of the box — no extra configuration needed. This guide covers setup, framework integration (Hono, Elysia), and Bun-specific patterns.

## Why use LogTide with Bun?

- **Zero config**: The `@logtide/node` SDK works directly on Bun
- **Native TypeScript**: No build step needed, Bun runs `.ts` files directly
- **Built-in .env**: Bun loads `.env` files automatically
- **Fast startup**: Bun's speed means your logging starts immediately
- **Same API**: If you know the Node.js SDK, you know the Bun SDK

## Prerequisites

- Bun 1.0+ (1.1+ recommended)
- LogTide instance with a DSN or API key

## Installation

```bash
bun add @logtide/node
```

## Quick Start

```typescript
// index.ts
import { LogTideClient } from '@logtide/node';

const client = new LogTideClient({
  dsn: process.env.LOGTIDE_DSN!,
  service: 'bun-app',
  environment: process.env.NODE_ENV ?? 'development',
});

client.info('Application started', { runtime: 'bun', version: Bun.version });

// Your application logic
const server = Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    client.info(`${req.method} ${url.pathname}`);
    return new Response('OK');
  },
});

client.info('Server listening', { port: server.port });
```

Run directly — no build step:

```bash
bun run index.ts
```

### Environment Variables

Bun loads `.env` files automatically:

```bash
# .env
LOGTIDE_DSN=http://lp_your_key@logtide.internal:8080
NODE_ENV=development
```

No `dotenv` package needed.

## Bun.serve with Logging

### Structured Request Logging

```typescript
// server.ts
import { LogTideClient } from '@logtide/node';

const client = new LogTideClient({
  dsn: process.env.LOGTIDE_DSN!,
  service: 'api',
});

const server = Bun.serve({
  port: process.env.PORT ?? 3000,

  async fetch(req) {
    const url = new URL(req.url);
    const start = performance.now();
    const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID();

    try {
      const response = await handleRequest(req, url);
      const durationMs = Math.round(performance.now() - start);

      client.info(`${req.method} ${url.pathname} ${response.status}`, {
        method: req.method,
        path: url.pathname,
        statusCode: response.status,
        durationMs,
        traceId,
      });

      response.headers.set('X-Trace-Id', traceId);
      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);

      client.error(`${req.method} ${url.pathname} 500`, {
        method: req.method,
        path: url.pathname,
        statusCode: 500,
        durationMs,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });

      return new Response('Internal Server Error', { status: 500 });
    }
  },

  error(error) {
    client.error('Server error', { error: error.message });
    return new Response('Internal Server Error', { status: 500 });
  },
});

async function handleRequest(req: Request, url: URL): Promise<Response> {
  if (url.pathname === '/health') return new Response('OK');
  if (url.pathname === '/api/users') return new Response(JSON.stringify([]), {
    headers: { 'Content-Type': 'application/json' },
  });
  return new Response('Not Found', { status: 404 });
}
```

## Hono Framework Integration

Hono is a lightweight framework that runs on Bun. Use the LogTide middleware:

```typescript
// index.ts
import { Hono } from 'hono';
import { LogTideClient } from '@logtide/node';

const client = new LogTideClient({
  dsn: process.env.LOGTIDE_DSN!,
  service: 'hono-api',
});

const app = new Hono();

// Logging middleware
app.use('*', async (c, next) => {
  const start = performance.now();
  const traceId = c.req.header('x-trace-id') ?? crypto.randomUUID();
  c.set('traceId', traceId);

  await next();

  const durationMs = Math.round(performance.now() - start);
  const path = new URL(c.req.url).pathname;

  if (path !== '/health') {
    client.info(`${c.req.method} ${path} ${c.res.status}`, {
      method: c.req.method,
      path,
      statusCode: c.res.status,
      durationMs,
      traceId,
    });
  }

  c.res.headers.set('X-Trace-Id', traceId);
});

// Error handler
app.onError((err, c) => {
  client.error('Unhandled error', {
    error: err.message,
    path: new URL(c.req.url).pathname,
    traceId: c.get('traceId'),
  });
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.get('/users/:id', (c) => {
  const id = c.req.param('id');
  client.info('Fetching user', { userId: id, traceId: c.get('traceId') });
  return c.json({ id, name: 'User' });
});

export default app;
```

## Elysia Framework Integration

Elysia is a Bun-native framework with plugin support:

```typescript
// index.ts
import { Elysia } from 'elysia';
import { LogTideClient } from '@logtide/node';

const client = new LogTideClient({
  dsn: process.env.LOGTIDE_DSN!,
  service: 'elysia-api',
});

const app = new Elysia()
  .onRequest(({ request, set }) => {
    const start = performance.now();
    set.headers['x-start-time'] = String(start);
  })
  .onAfterResponse(({ request, set, response }) => {
    const url = new URL(request.url);
    if (url.pathname === '/health') return;

    const start = Number(set.headers['x-start-time']);
    const durationMs = Math.round(performance.now() - start);

    client.info(`${request.method} ${url.pathname}`, {
      method: request.method,
      path: url.pathname,
      durationMs,
    });
  })
  .onError(({ error, request }) => {
    client.error('Request error', {
      error: error.message,
      path: new URL(request.url).pathname,
    });
  })
  .get('/users/:id', ({ params }) => {
    client.info('Fetching user', { userId: params.id });
    return { id: params.id, name: 'User' };
  })
  .listen(3000);

client.info('Server started', { port: app.server?.port });
```

## Graceful Shutdown

Bun supports `process.on('beforeExit')` and signal handlers:

```typescript
// Flush logs before exit
process.on('SIGINT', () => {
  client.info('Shutting down (SIGINT)');
  client.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  client.info('Shutting down (SIGTERM)');
  client.shutdown();
  process.exit(0);
});
```

## Docker Deployment

```dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Copy application
COPY . .

ENV NODE_ENV=production
ENV LOGTIDE_DSN=""

EXPOSE 3000
CMD ["bun", "run", "index.ts"]
```

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - LOGTIDE_DSN=${LOGTIDE_DSN}
      - NODE_ENV=production
```

## Performance

Bun's performance means logging overhead is minimal:

| Metric | Value |
|--------|-------|
| Startup time | ~50ms (vs ~300ms Node.js) |
| Log call overhead | <0.2ms (batched) |
| Memory overhead | ~6MB |
| Throughput | 15,000+ logs/sec |

## Troubleshooting

### Module resolution issues

If you see module resolution errors, ensure your `bunfig.toml` doesn't override Node.js compatibility:

```toml
# bunfig.toml
[install]
peer = false
```

### Bun.serve vs Express

If migrating from Express, note that `Bun.serve` uses Web Standard `Request`/`Response`. The LogTide SDK works with both APIs.

### Hot reload with --watch

```bash
bun --watch run index.ts
```

LogTide re-initializes cleanly on file changes.

## Next Steps

- [Node.js SDK Reference](/integrations/nodejs) - Full SDK documentation
- [Hono Integration](/integrations/hono) - Hono-specific guide
- [Elysia Integration](/integrations/elysia) - Elysia-specific guide
- [Docker Integration](/integrations/docker) - Container deployments
