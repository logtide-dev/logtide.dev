---
title: "Deno Runtime Logging Integration"
description: "Use the LogTide JavaScript SDK with Deno via npm specifiers for structured logging with secure-by-default permissions."
category: "language"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:deno"
highlights:
  - "npm: specifier support"
  - "Secure-by-default"
  - "Native TypeScript"
  - "Deno Deploy compatible"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases: []
keywords:
  - "deno logging"
  - "deno structured logging"
  - "deno observability"
  - "deno deploy logging"
  - "deno npm logging"
faqs:
  - question: "How do I send Deno application logs to LogTide?"
    answer: "Import the SDK using the npm: specifier (import { LogTideClient } from 'npm:@logtide/sdk-node'), initialise it with apiUrl and apiKey from Deno.env.get('LOGTIDE_API_URL') and Deno.env.get('LOGTIDE_API_KEY'), then run your script with at least --allow-net and --allow-env flags so Deno permits the outbound connection."
  - question: "Does Deno's permission model affect how LogTide sends logs?"
    answer: "Yes. LogTide makes outbound HTTP requests to your ingest endpoint, which requires the --allow-net flag. You can scope it to just your LogTide host (for example --allow-net=api.logtide.dev) to follow the principle of least privilege. On Deno Deploy, network permissions are granted automatically."
  - question: "Can I use LogTide with Deno Deploy edge functions?"
    answer: "Yes. Set LOGTIDE_API_URL and LOGTIDE_API_KEY in the Deno Deploy dashboard environment variables and use smaller batchSize and flushInterval values (the guide suggests batchSize: 10 and flushInterval: 2000) because edge function processes may terminate quickly before a full batch is ready."
  - question: "Does LogTide work with Deno frameworks like Fresh or Oak?"
    answer: "Yes. The guide includes a Fresh middleware example that injects the client into ctx.state for use in API route handlers, and an Oak middleware example that wraps app.use to log every request with method, path, status code, and duration."
---

Deno supports npm packages via `npm:` specifiers, making the LogTide JavaScript SDK work directly. This guide covers setup, Fresh framework integration, Deno.serve patterns, and Deno Deploy considerations.

## Why use LogTide with Deno?

- **npm: specifier**: Import `@logtide/sdk-node` directly - no import maps needed
- **Secure-by-default**: Deno's permission model means logging requires explicit `--allow-net`
- **Native TypeScript**: No build step, full type checking out of the box
- **Deno Deploy**: Ship logs from edge functions to your LogTide instance
- **Standard APIs**: Uses Web Standard `Request`/`Response` patterns

## Prerequisites

- Deno 1.38+ (2.x recommended for improved npm compatibility)
- LogTide instance with a DSN or API key

## Quick Start

```typescript
// main.ts
import { LogTideClient } from 'npm:@logtide/sdk-node';

const client = new LogTideClient({
  apiUrl: Deno.env.get('LOGTIDE_API_URL')!,
  apiKey: Deno.env.get('LOGTIDE_API_KEY')!,
  globalMetadata: { environment: Deno.env.get('DENO_ENV') ?? 'development' },
});

client.info('deno-app', 'Application started', { runtime: 'deno', version: Deno.version.deno });

Deno.serve({ port: 8000 }, async (req) => {
  const url = new URL(req.url);
  client.info('deno-app', `${req.method} ${url.pathname}`);
  return new Response('OK');
});
```

Run with permissions:

```bash
deno run --allow-net --allow-env main.ts
```

### Environment Variables

Create a `.env` file and load it:

```bash
# .env
LOGTIDE_API_URL=http://logtide.internal:8080
LOGTIDE_API_KEY=lp_your_key
DENO_ENV=development
```

```bash
deno run --allow-net --allow-env --allow-read=.env main.ts
```

Or with Deno 2.x, `.env` files load automatically with `--allow-env`.

## Deno.serve with Structured Logging

```typescript
// main.ts
import { LogTideClient } from 'npm:@logtide/sdk-node';

const client = new LogTideClient({
  apiUrl: Deno.env.get('LOGTIDE_API_URL')!,
  apiKey: Deno.env.get('LOGTIDE_API_KEY')!,
});

Deno.serve({ port: 8000 }, async (req) => {
  const url = new URL(req.url);
  const start = performance.now();
  const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID();

  // Skip health checks
  if (url.pathname === '/health') return new Response('OK');

  try {
    const response = await handleRequest(req, url);
    const durationMs = Math.round(performance.now() - start);

    client.info('api', `${req.method} ${url.pathname} ${response.status}`, {
      method: req.method,
      path: url.pathname,
      statusCode: response.status,
      durationMs,
      traceId,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    client.error('api', `${req.method} ${url.pathname} 500`, {
      method: req.method,
      path: url.pathname,
      statusCode: 500,
      traceId,
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response('Internal Server Error', { status: 500 });
  }
});

async function handleRequest(req: Request, url: URL): Promise<Response> {
  switch (url.pathname) {
    case '/api/users':
      return Response.json([]);
    default:
      return new Response('Not Found', { status: 404 });
  }
}
```

## Fresh Framework Integration

Fresh is Deno's full-stack framework. Add logging to middleware and routes:

### Middleware

```typescript
// routes/_middleware.ts
import { FreshContext } from '$fresh/server.ts';
import { LogTideClient } from 'npm:@logtide/sdk-node';

const client = new LogTideClient({
  apiUrl: Deno.env.get('LOGTIDE_API_URL')!,
  apiKey: Deno.env.get('LOGTIDE_API_KEY')!,
});

export async function handler(req: Request, ctx: FreshContext) {
  const url = new URL(req.url);
  const start = performance.now();
  const traceId = crypto.randomUUID();

  // Pass trace ID to downstream handlers
  ctx.state.traceId = traceId;
  ctx.state.logtide = client;

  const response = await ctx.next();
  const durationMs = Math.round(performance.now() - start);

  // Skip static assets
  if (!url.pathname.startsWith('/_frsh/')) {
    client.info('fresh-app', `${req.method} ${url.pathname} ${response.status}`, {
      method: req.method,
      path: url.pathname,
      statusCode: response.status,
      durationMs,
      traceId,
    });
  }

  response.headers.set('X-Trace-Id', traceId);
  return response;
}
```

### API Routes

```typescript
// routes/api/users/[id].ts
import { Handlers } from '$fresh/server.ts';

export const handler: Handlers = {
  async GET(_req, ctx) {
    const { logtide, traceId } = ctx.state;
    const { id } = ctx.params;

    logtide.info('fresh-app', 'Fetching user', { userId: id, traceId });

    const user = await db.getUser(id);
    if (!user) {
      logtide.warn('fresh-app', 'User not found', { userId: id, traceId });
      return new Response('Not Found', { status: 404 });
    }

    return Response.json(user);
  },
};
```

### Islands (Client Components)

Islands run in the browser - don't import server logging there. Keep logging in routes and middleware only.

## Oak Framework Integration

If using Oak (Deno's Express-like framework):

```typescript
// main.ts
import { Application, Router } from 'https://deno.land/x/oak/mod.ts';
import { LogTideClient } from 'npm:@logtide/sdk-node';

const client = new LogTideClient({
  apiUrl: Deno.env.get('LOGTIDE_API_URL')!,
  apiKey: Deno.env.get('LOGTIDE_API_KEY')!,
});

const app = new Application();

// Logging middleware
app.use(async (ctx, next) => {
  const start = performance.now();
  await next();
  const durationMs = Math.round(performance.now() - start);

  client.info('oak-api', `${ctx.request.method} ${ctx.request.url.pathname} ${ctx.response.status}`, {
    method: ctx.request.method,
    path: ctx.request.url.pathname,
    statusCode: ctx.response.status,
    durationMs,
  });
});

// Error handler
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    client.error('oak-api', 'Unhandled error', {
      error: error instanceof Error ? error.message : String(error),
      path: ctx.request.url.pathname,
    });
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal Server Error' };
  }
});

const router = new Router();
router.get('/users/:id', (ctx) => {
  client.info('oak-api', 'Fetching user', { userId: ctx.params.id });
  ctx.response.body = { id: ctx.params.id };
});

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
```

## Deno Deploy

Deno Deploy runs your code at the edge. LogTide works there with some considerations:

```typescript
// main.ts (for Deno Deploy)
import { LogTideClient } from 'npm:@logtide/sdk-node';

const client = new LogTideClient({
  apiUrl: Deno.env.get('LOGTIDE_API_URL')!,
  apiKey: Deno.env.get('LOGTIDE_API_KEY')!,
  // Smaller batches for edge (shorter-lived processes)
  batchSize: 10,
  flushInterval: 2000,
});

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const start = performance.now();

  const response = await handleRequest(req, url);
  const durationMs = Math.round(performance.now() - start);

  client.info('edge-api', `${req.method} ${url.pathname} ${response.status}`, {
    method: req.method,
    path: url.pathname,
    statusCode: response.status,
    durationMs,
    region: Deno.env.get('DENO_REGION') ?? 'unknown',
  });

  return response;
});
```

**Notes for Deploy:**
- Set `LOGTIDE_API_URL` and `LOGTIDE_API_KEY` in the Deno Deploy dashboard environment variables
- Use smaller batch sizes since edge functions may terminate quickly
- Network permissions are granted automatically on Deploy

## Permissions Reference

Deno requires explicit permissions. For LogTide:

```bash
# Minimum permissions
deno run \
  --allow-net=your-logtide-host:8080 \                # Network to LogTide
  --allow-env=LOGTIDE_API_URL,LOGTIDE_API_KEY,DENO_ENV \  # Environment variables
  main.ts

# Development (more permissive)
deno run --allow-net --allow-env --allow-read main.ts
```

## Docker Deployment

```dockerfile
FROM denoland/deno:2.0.0

WORKDIR /app

# Cache dependencies
COPY deno.json deno.lock ./
RUN deno install

# Copy application
COPY . .

# Cache the main module
RUN deno cache main.ts

ENV LOGTIDE_API_URL=""
ENV LOGTIDE_API_KEY=""

EXPOSE 8000
CMD ["deno", "run", "--allow-net", "--allow-env", "main.ts"]
```

## Performance

| Metric | Value |
|--------|-------|
| Startup time | ~100ms |
| Log call overhead | <0.3ms (batched) |
| Memory overhead | ~8MB |
| npm: specifier load | First run only (cached after) |

## Troubleshooting

### "Requires net access"

Run with `--allow-net` or specify your LogTide host:

```bash
deno run --allow-net=api.logtide.dev main.ts
```

### npm package not found

Ensure you're using the `npm:` prefix:

```typescript
// Correct
import { LogTideClient } from 'npm:@logtide/sdk-node';

// Wrong (won't resolve)
import { LogTideClient } from '@logtide/sdk-node';
```

### Slow first run

Deno downloads and caches npm packages on first run. Subsequent runs are fast. In Docker, use `RUN deno cache main.ts` to pre-cache.

## Next Steps

- [Node.js SDK Reference](/integrations/nodejs/) - Full SDK documentation
- [Docker Integration](/integrations/docker/) - Container deployments
- [Bun Integration](/integrations/bun/) - Alternative JS runtime
