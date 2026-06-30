---
title: "Next.js Application Logging Integration"
description: "Send structured logs from Next.js applications to LogTide with instrumentation hooks, error boundaries, and navigation tracking."
category: "framework"
difficulty: "medium"
sdk: "javascript"
brandIcon: "simple-icons:nextdotjs"
highlights:
  - "Instrumentation hook"
  - "Error boundary component"
  - "Client + server support"
  - "Navigation tracking"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases: []
keywords:
  - "nextjs logging"
  - "next.js api logging"
  - "vercel logs"
  - "nextjs structured logging"
  - "nextjs error tracking"
faqs:
  - question: "How do I add LogTide logging to my Next.js application?"
    answer: "Install @logtide/nextjs, create an instrumentation.ts file that calls registerLogtide with your DSN, and enable the instrumentationHook in next.config.ts. Server-side errors in API routes, Server Components, and Server Actions are then captured automatically."
  - question: "Does @logtide/nextjs support both server-side and client-side logging?"
    answer: "Yes. You initialize the server side in instrumentation.ts using registerLogtide from @logtide/nextjs/server, and the client side in app/layout.tsx using initLogtide from @logtide/nextjs/client. You can use separate DSNs for each via LOGTIDE_DSN and NEXT_PUBLIC_LOGTIDE_DSN environment variables."
  - question: "How do I capture client-side React errors in Next.js with LogTide?"
    answer: "Wrap your component tree with the LogtideErrorBoundary component from @logtide/nextjs/client (for example in a client component rendered from app/layout.tsx). It automatically captures and forwards React rendering errors to LogTide, and accepts an optional fallback to render in place of the crashed subtree."
  - question: "Can I track page navigation as breadcrumbs in a Next.js App Router application?"
    answer: "Yes. Import trackNavigation from @logtide/nextjs/client and call it inside a useEffect that watches the pathname from usePathname. Place this LogtideNavigationTracker component in your providers or layout to record every client-side route change."
---

LogTide's Next.js SDK (`@logtide/nextjs`) provides server-side instrumentation, client-side error boundaries, and navigation tracking for Next.js App Router applications.

## Why use LogTide with Next.js?

- **Instrumentation hook**: Initialize once in `instrumentation.ts`, capture all server errors
- **Error boundaries**: Client-side React error capture with `LogtideErrorBoundary`
- **Navigation tracking**: Track client-side route changes as breadcrumbs
- **Server + client**: Separate DSNs for server and client-side logging
- **Self-hosted option**: Keep logs in your infrastructure

## Prerequisites

- Next.js 14+ (App Router)
- Node.js 18+
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/nextjs
```

## Server-Side Setup

Initialize LogTide via the instrumentation hook:

```typescript
// instrumentation.ts
import { registerLogtide } from '@logtide/nextjs/server';

export async function register() {
  registerLogtide({
    dsn: process.env.LOGTIDE_DSN!,
    service: 'nextjs-app',
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_VERSION,
  });
}
```

Enable the hook in `next.config.ts`:

```typescript
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
```

## Client-Side Setup

Initialize LogTide on the client:

```tsx
// app/layout.tsx
import { initLogtide } from '@logtide/nextjs/client';

initLogtide({
  dsn: process.env.NEXT_PUBLIC_LOGTIDE_DSN!,
  environment: process.env.NODE_ENV,
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

## Environment Variables

```env
# .env.local
LOGTIDE_DSN=https://lp_abc123@api.logtide.dev
NEXT_PUBLIC_LOGTIDE_DSN=https://lp_client456@api.logtide.dev
NEXT_PUBLIC_APP_VERSION=1.0.0
```

## Error Capture

Server-side errors in API routes, Server Components, and Server Actions are captured automatically via `captureRequestError`.

## Error Boundary

Use `LogtideErrorBoundary` for client-side React error capture:

`LogtideErrorBoundary` wraps your component tree and reports any rendering
error it catches to LogTide. It accepts an optional `fallback` (a node, or a
`(error) => node` function) to render in place of the crashed subtree:

```tsx
// app/providers.tsx
'use client';

import { LogtideErrorBoundary } from '@logtide/nextjs/client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LogtideErrorBoundary fallback={<div>Something went wrong</div>}>
      {children}
    </LogtideErrorBoundary>
  );
}
```

Then wrap your app with it in `app/layout.tsx`:

```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## Navigation Tracking

Track client-side navigation as breadcrumbs:

```tsx
// app/providers.tsx
'use client';

import { trackNavigation } from '@logtide/nextjs/client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function LogtideNavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    trackNavigation(pathname);
  }, [pathname]);
  return null;
}
```

## API Route Logging

```typescript
// app/api/users/[id]/route.ts
import { hub } from '@logtide/core';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  hub.captureLog('info', 'Fetching user', { userId: params.id });

  try {
    const user = await getUser(params.id);
    return Response.json(user);
  } catch (error) {
    hub.captureError(error, {
      extra: { userId: params.id },
    });
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

## Server Actions

```typescript
// app/actions/user.ts
'use server';

import { hub } from '@logtide/core';

export async function updateUser(formData: FormData) {
  const userId = formData.get('userId') as string;

  hub.addBreadcrumb({
    type: 'custom',
    category: 'action',
    message: 'Update user action triggered',
    timestamp: Date.now(),
  });

  try {
    await db.user.update({ where: { id: userId }, data: { name: formData.get('name') } });
    hub.captureLog('info', 'User updated', { userId });
    return { success: true };
  } catch (error) {
    hub.captureError(error, { extra: { userId } });
    return { success: false };
  }
}
```

## Docker Deployment

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
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs/) - Core SDK reference
- [Next.js SDK Reference](/docs/sdks/nextjs-sdk/) - Full API documentation
- [Docker Integration](/integrations/docker/) - Container deployment
- [GDPR Compliance](/use-cases/gdpr-compliance/) - Privacy-compliant logging
