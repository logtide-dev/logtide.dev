---
title: "Next.js Application Logging Integration"
description: "Send structured logs from Next.js applications to LogTide with support for API routes, middleware, and Edge Runtime."
category: "framework"
difficulty: "medium"
sdk: "javascript"
brandIcon: "simple-icons:nextdotjs"
highlights:
  - "API route logging"
  - "Edge Runtime support"
  - "Middleware integration"
  - "Server Components ready"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases: []
keywords:
  - "nextjs logging"
  - "next.js api logging"
  - "vercel logs"
  - "nextjs structured logging"
  - "edge runtime logging"
---

Next.js runs in multiple environments: Node.js API routes, Edge Runtime middleware, and Server Components. This guide shows you how to log from all these contexts and ship logs to LogTide.

## Why use LogTide with Next.js?

- **Unified logging**: Same API for API routes, middleware, and Server Components
- **Edge Runtime**: Lightweight client for Edge functions
- **Request correlation**: Trace logs across the entire request lifecycle
- **Self-hosted option**: Keep logs in your infrastructure instead of Vercel
- **Development parity**: Same logging in dev and production

## Prerequisites

- Next.js 13.4+ (App Router recommended)
- Node.js 18+
- LogTide instance with API key

## Installation

```bash
npm install @logtide/sdk-node
# or
pnpm add @logtide/sdk-node
```

## Configuration

### Environment Variables

Add to `.env.local`:

```env
LOGTIDE_API_URL=https://api.logtide.dev
LOGTIDE_API_KEY=your-project-api-key
```

### Logger Setup

Create `lib/logger.ts`:

```typescript
import { LogTideClient } from '@logtide/sdk-node';

// Singleton client for Node.js runtime
let client: LogTideClient | null = null;

export function getLogger() {
  if (!client) {
    client = new LogTideClient({
      apiUrl: process.env.LOGTIDE_API_URL!,
      apiKey: process.env.LOGTIDE_API_KEY!,
      globalMetadata: {
        service: 'nextjs-app',
        environment: process.env.NODE_ENV,
        version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      },
    });
  }
  return client;
}

// For Edge Runtime (lightweight fetch-based client)
export function getEdgeLogger() {
  return {
    async log(level: string, message: string, metadata?: Record<string, unknown>) {
      await fetch(`${process.env.LOGTIDE_API_URL}/api/v1/ingest/single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.LOGTIDE_API_KEY!,
        },
        body: JSON.stringify({
          service: 'nextjs-edge',
          level,
          message,
          metadata: {
            ...metadata,
            runtime: 'edge',
            environment: process.env.NODE_ENV,
          },
        }),
      });
    },
    info: (msg: string, meta?: Record<string, unknown>) =>
      getEdgeLogger().log('info', msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) =>
      getEdgeLogger().log('error', msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      getEdgeLogger().log('warn', msg, meta),
  };
}
```

## API Route Logging

### App Router (Route Handlers)

```typescript
// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getLogger } from '@/lib/logger';

const logger = getLogger();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  logger.info('Fetching user', {
    userId: params.id,
    requestId,
    path: request.nextUrl.pathname,
  });

  try {
    const user = await db.user.findUnique({ where: { id: params.id } });

    if (!user) {
      logger.warn('User not found', {
        userId: params.id,
        requestId,
      });
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    logger.info('User fetched successfully', {
      userId: params.id,
      requestId,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(user);
  } catch (error) {
    logger.error('Failed to fetch user', {
      userId: params.id,
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

### Pages Router (API Routes)

```typescript
// pages/api/users/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getLogger } from '@/lib/logger';

const logger = getLogger();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();

  logger.info('API request', {
    method: req.method,
    path: req.url,
    userId: id,
    requestId,
  });

  if (req.method === 'GET') {
    try {
      const user = await getUser(id as string);

      logger.info('User fetched', { userId: id, requestId });
      res.status(200).json(user);
    } catch (error) {
      logger.error('Failed to fetch user', {
        userId: id,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      res.status(500).json({ error: 'Internal error' });
    }
  }
}
```

## Middleware Logging (Edge Runtime)

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = Date.now();

  // Log to LogTide (Edge-compatible)
  const logPromise = fetch(`${process.env.LOGTIDE_API_URL}/api/v1/ingest/single`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.LOGTIDE_API_KEY!,
    },
    body: JSON.stringify({
      service: 'nextjs-middleware',
      level: 'info',
      message: `${request.method} ${request.nextUrl.pathname}`,
      metadata: {
        method: request.method,
        path: request.nextUrl.pathname,
        requestId,
        userAgent: request.headers.get('user-agent'),
        ip: request.ip || request.headers.get('x-forwarded-for'),
        geo: request.geo,
      },
    }),
  }).catch(() => {}); // Don't block on logging errors

  // Continue with request
  const response = NextResponse.next();
  response.headers.set('x-request-id', requestId);

  // Log completion (fire and forget)
  logPromise.then(() => {
    fetch(`${process.env.LOGTIDE_API_URL}/api/v1/ingest/single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.LOGTIDE_API_KEY!,
      },
      body: JSON.stringify({
        service: 'nextjs-middleware',
        level: 'info',
        message: 'Request completed',
        metadata: {
          requestId,
          durationMs: Date.now() - startTime,
        },
      }),
    }).catch(() => {});
  });

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
```

## Server Components Logging

```typescript
// app/users/[id]/page.tsx
import { getLogger } from '@/lib/logger';
import { notFound } from 'next/navigation';

const logger = getLogger();

async function getUser(id: string) {
  logger.info('Server Component: Fetching user', { userId: id });

  const res = await fetch(`${process.env.API_URL}/users/${id}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    logger.warn('Server Component: User not found', { userId: id });
    return null;
  }

  const user = await res.json();
  logger.info('Server Component: User loaded', { userId: id });
  return user;
}

export default async function UserPage({ params }: { params: { id: string } }) {
  const user = await getUser(params.id);

  if (!user) {
    notFound();
  }

  return (
    <div>
      <h1>{user.name}</h1>
    </div>
  );
}
```

## Server Actions Logging

```typescript
// app/actions/user.ts
'use server';

import { getLogger } from '@/lib/logger';
import { revalidatePath } from 'next/cache';

const logger = getLogger();

export async function updateUser(formData: FormData) {
  const userId = formData.get('userId') as string;
  const name = formData.get('name') as string;

  logger.info('Server Action: Updating user', {
    userId,
    action: 'updateUser',
  });

  try {
    await db.user.update({
      where: { id: userId },
      data: { name },
    });

    logger.info('Server Action: User updated', { userId });
    revalidatePath(`/users/${userId}`);
    return { success: true };
  } catch (error) {
    logger.error('Server Action: Update failed', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return { success: false, error: 'Update failed' };
  }
}
```

## Request Context Wrapper

Create a higher-order function for consistent request logging:

```typescript
// lib/with-logging.ts
import { NextRequest, NextResponse } from 'next/server';
import { getLogger } from './logger';

type RouteHandler = (
  request: NextRequest,
  context: { params: Record<string, string> }
) => Promise<NextResponse>;

export function withLogging(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const logger = getLogger();
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    const startTime = Date.now();

    logger.info('Request started', {
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      params: context.params,
    });

    try {
      const response = await handler(request, context);

      logger.info('Request completed', {
        requestId,
        status: response.status,
        durationMs: Date.now() - startTime,
      });

      // Add request ID to response
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error) {
      logger.error('Request failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        durationMs: Date.now() - startTime,
      });

      return NextResponse.json(
        { error: 'Internal server error', requestId },
        { status: 500 }
      );
    }
  };
}
```

Usage:

```typescript
// app/api/orders/route.ts
import { withLogging } from '@/lib/with-logging';

export const POST = withLogging(async (request) => {
  const body = await request.json();
  // ... handle order creation
  return NextResponse.json({ orderId: '123' });
});
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: "3.8"

services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOGTIDE_API_URL=https://api.logtide.dev
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### next.config.js for Standalone

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
```

## Vercel Deployment

When deploying to Vercel, logs from Edge Runtime are limited. Use LogTide for persistence:

```typescript
// lib/logger.ts - Vercel-optimized version
import { LogTideClient } from '@logtide/sdk-node';

const isEdge = typeof EdgeRuntime !== 'undefined';

export function getLogger() {
  if (isEdge) {
    // Edge Runtime: use fetch-based logging
    return {
      info: async (message: string, metadata?: Record<string, unknown>) => {
        await fetch(process.env.LOGTIDE_API_URL + '/api/v1/ingest/single', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.LOGTIDE_API_KEY!,
          },
          body: JSON.stringify({
            service: 'nextjs',
            level: 'info',
            message,
            metadata: { ...metadata, runtime: 'edge', platform: 'vercel' },
          }),
        }).catch(console.error);
      },
      // ... other methods
    };
  }

  // Node.js Runtime: use full client
  return new LogTideClient({
    apiUrl: process.env.LOGTIDE_API_URL!,
    apiKey: process.env.LOGTIDE_API_KEY!,
    globalMetadata: {
      service: 'nextjs',
      runtime: 'nodejs',
      platform: process.env.VERCEL ? 'vercel' : 'self-hosted',
    },
  });
}
```

## Error Boundary Logging

```typescript
// app/error.tsx
'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to LogTide via API route
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        stack: error.stack,
      }),
    });
  }, [error]);

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

## Performance

| Context | Latency | Memory |
|---------|---------|--------|
| API Route (Node.js) | <1ms | ~10MB |
| Middleware (Edge) | ~5ms (network) | <1MB |
| Server Component | <1ms | ~10MB |
| Server Action | <1ms | ~10MB |

## Next Steps

- [Node.js SDK](/integrations/nodejs) - Full Node.js integration
- [Docker Integration](/integrations/docker) - Container deployment
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy-compliant logging
