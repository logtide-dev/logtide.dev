---
title: "Remix Application Logging Integration"
description: "Send structured logs from Remix loaders and actions to LogTide with server-side request tracing and error boundary capture."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:remix"
highlights:
  - "Loader/action logging"
  - "Server-side tracing"
  - "Error boundary capture"
  - "Nested route context"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases:
  - "incident-response"
keywords:
  - "remix logging"
  - "remix server logging"
  - "remix error tracking"
  - "remix loader logging"
  - "remix action logging"
  - "remix observability"
faqs:
  - question: "How do I add LogTide logging to a Remix application?"
    answer: "Install @logtide/node, create a logtide.server.ts file using the .server.ts suffix so it is excluded from the client bundle, initialize LogTideClient with your DSN, then call logtide.info or logtide.error directly inside your loader and action functions."
  - question: "Do I need to change every loader and action to get request logging?"
    answer: "No. You can add automatic request logging to all routes by instrumenting entry.server.tsx, which captures the method, path, status code, and duration for every server-rendered request. For per-route control the guide also provides a withLogging wrapper you can apply selectively."
  - question: "How does LogTide handle logs from nested Remix route loaders?"
    answer: "Remix runs nested route loaders in parallel, so logs can appear out of order. The recommended pattern is to generate or propagate a traceId from the x-trace-id request header in each loader and include it in every log call, allowing you to filter by traceId in LogTide to reconstruct a full page load."
  - question: "What is the performance overhead of LogTide in a Remix application?"
    answer: "Each log call adds under 0.5 milliseconds of overhead, memory usage increases by approximately 8 MB, and logs are shipped in batches of up to 100 per network request using async shipping so SSR response times are not affected."
---

Remix runs loaders and actions on the server, making it a natural fit for structured logging. This guide shows you how to add LogTide to Remix for automatic request tracing, loader/action logging, and error boundary capture.

## Why use LogTide with Remix?

- **Server-side first**: Loaders and actions run on the server — log them with full context
- **Request tracing**: Correlate logs across nested route loaders in a single page load
- **Error boundaries**: Capture errors with the route context that triggered them
- **Action audit trail**: Log form submissions and mutations with user context
- **Non-blocking**: Async batching keeps loader response times fast

## Prerequisites

- Node.js 18+ or 20+
- Remix 2.x
- LogTide instance with a DSN or API key

## Installation

```bash
npm install @logtide/node
```

## Quick Start

### Initialize LogTide

```typescript
// app/lib/logtide.server.ts
import { LogTideClient } from '@logtide/node';

export const logtide = new LogTideClient({
  dsn: process.env.LOGTIDE_DSN!,
  service: 'remix-app',
  environment: process.env.NODE_ENV,
});
```

The `.server.ts` suffix ensures this module is never bundled into client code.

### Use in Loaders

```typescript
// app/routes/users.$id.tsx
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { logtide } from '~/lib/logtide.server';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const traceId = request.headers.get('x-trace-id') ?? crypto.randomUUID();

  logtide.info('Loading user profile', {
    userId: params.id,
    traceId,
  });

  const user = await db.user.findUnique({ where: { id: params.id } });

  if (!user) {
    logtide.warning('User not found', { userId: params.id, traceId });
    throw new Response('Not found', { status: 404 });
  }

  return json({ user }, { headers: { 'X-Trace-Id': traceId } });
}
```

### Use in Actions

```typescript
// app/routes/settings.tsx
import { redirect, type ActionFunctionArgs } from '@remix-run/node';
import { logtide } from '~/lib/logtide.server';

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request);
  const userId = session.get('userId');
  const formData = await request.formData();

  logtide.info('Settings updated', {
    userId,
    fields: [...formData.keys()],
  });

  await updateSettings(userId, Object.fromEntries(formData));
  return redirect('/settings');
}
```

## Request Tracing Middleware

For automatic logging of all requests, create a middleware using Remix's `entry.server.tsx`:

```typescript
// app/entry.server.tsx
import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { renderToPipeableStream } from 'react-dom/server';
import { logtide } from '~/lib/logtide.server';

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: any,
) {
  const url = new URL(request.url);
  const start = performance.now();
  const traceId = request.headers.get('x-trace-id') ?? crypto.randomUUID();

  // Skip static assets
  if (url.pathname.startsWith('/build/') || url.pathname === '/favicon.ico') {
    return defaultHandler(request, responseStatusCode, responseHeaders, remixContext);
  }

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} abortDelay={ABORT_DELAY} />,
      {
        onShellReady() {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html');
          responseHeaders.set('X-Trace-Id', traceId);

          const durationMs = Math.round(performance.now() - start);

          logtide.info(`${request.method} ${url.pathname} ${responseStatusCode}`, {
            method: request.method,
            path: url.pathname,
            statusCode: responseStatusCode,
            durationMs,
            traceId,
          });

          resolve(new Response(stream, {
            headers: responseHeaders,
            status: responseStatusCode,
          }));

          pipe(body);
        },
        onShellError(error) {
          logtide.error('Remix shell render error', {
            error: String(error),
            path: url.pathname,
            traceId,
          });
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          logtide.error('Remix render error', {
            error: String(error),
            path: url.pathname,
            traceId,
          });
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
```

## Error Boundary Logging

### Root Error Boundary

```typescript
// app/root.tsx
import { isRouteErrorResponse, useRouteError } from '@remix-run/react';

export function ErrorBoundary() {
  const error = useRouteError();

  // Server-side logging happens in entry.server.tsx
  // This component handles the client-side rendering

  if (isRouteErrorResponse(error)) {
    return (
      <div className="error-page">
        <h1>{error.status} {error.statusText}</h1>
        <p>{error.data}</p>
      </div>
    );
  }

  return (
    <div className="error-page">
      <h1>Something went wrong</h1>
      <p>Please try again later.</p>
    </div>
  );
}
```

### Server-Side Error Logging

Catch errors in loaders/actions with a utility:

```typescript
// app/lib/with-logging.server.ts
import { logtide } from '~/lib/logtide.server';

export function withLogging<T>(
  routeName: string,
  handler: (args: any) => Promise<T>,
) {
  return async (args: any) => {
    const start = performance.now();
    const traceId = args.request.headers.get('x-trace-id') ?? crypto.randomUUID();

    try {
      const result = await handler(args);
      const durationMs = Math.round(performance.now() - start);

      logtide.info(`${routeName} completed`, { durationMs, traceId });
      return result;
    } catch (error) {
      logtide.error(`${routeName} failed`, {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        traceId,
      });
      throw error;
    }
  };
}

// Usage
export const loader = withLogging('users.$id', async ({ params }: LoaderFunctionArgs) => {
  const user = await db.user.findUnique({ where: { id: params.id } });
  if (!user) throw new Response('Not found', { status: 404 });
  return json({ user });
});
```

## Session and Auth Context

```typescript
// app/lib/logtide.server.ts (extended)
import { type Session } from '@remix-run/node';

export function logWithSession(session: Session) {
  const userId = session.get('userId');
  const role = session.get('role');

  return {
    info(message: string, metadata?: Record<string, unknown>) {
      logtide.info(message, { userId, role, ...metadata });
    },
    warning(message: string, metadata?: Record<string, unknown>) {
      logtide.warning(message, { userId, role, ...metadata });
    },
    error(message: string, metadata?: Record<string, unknown>) {
      logtide.error(message, { userId, role, ...metadata });
    },
  };
}

// Usage in loader/action
export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request);
  const log = logWithSession(session);

  log.info('Deleting account', { reason: 'user_requested' });
  // ...
}
```

## Docker Deployment

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev

ENV NODE_ENV=production
ENV LOGTIDE_DSN=""

EXPOSE 3000
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOGTIDE_DSN=${LOGTIDE_DSN}
      - SESSION_SECRET=${SESSION_SECRET}
```

## Performance

| Metric | Value |
|--------|-------|
| Loader overhead | <0.5ms per log call |
| Memory overhead | ~8MB |
| Batch network calls | 1 per 100 logs |
| SSR impact | Negligible (async shipping) |

## Troubleshooting

### Logs not appearing

1. Ensure `logtide.server.ts` has the `.server.ts` suffix — without it, the client bundle may try to import server-only code
2. Check DSN is set: `echo $LOGTIDE_DSN`
3. Add `logtide.shutdown()` to your server's graceful shutdown handler

### "Cannot use import statement outside a module"

Ensure your `tsconfig.json` has `"module": "ESNext"` and your Remix config supports ESM.

### Logs from nested loaders appear out of order

Remix runs nested route loaders in parallel. Use the `traceId` to correlate them:

```
traceId:abc123 → root loader
traceId:abc123 → users layout loader
traceId:abc123 → users.$id loader
```

## Next Steps

- [Node.js SDK Reference](/integrations/nodejs/) - Full SDK documentation
- [Docker Integration](/integrations/docker/) - Container deployments
- [Incident Response](/use-cases/incident-response/) - Production debugging with traces
