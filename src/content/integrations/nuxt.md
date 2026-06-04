---
title: "Nuxt Application Logging Integration"
description: "Add structured logging to Nuxt applications with a zero-config module, runtime config injection, and server/client support."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:nuxtdotjs"
highlights:
  - "Zero-config module"
  - "Runtime config injection"
  - "Server + client capture"
  - "Composable API"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases: []
keywords:
  - "nuxt logging"
  - "nuxt structured logging"
  - "nuxt error tracking"
  - "nuxt module logging"
  - "vue ssr logging"
faqs:
  - question: "How do I add LogTide logging to my Nuxt application?"
    answer: "Install @logtide/nuxt, add it to the modules array in nuxt.config.ts, and set the dsn option pointing to your LogTide DSN. The module handles initialization on both the server and client automatically with no additional setup required."
  - question: "Does @logtide/nuxt support separate logging for server-side and client-side code?"
    answer: "Yes. You can provide a separate clientDsn for browser-side logging and control each side independently with the clientEnabled and serverEnabled options. Server-side logs use LOGTIDE_DSN while client-side logs use NUXT_PUBLIC_LOGTIDE_DSN."
  - question: "How do I log events from Vue components in a Nuxt application?"
    answer: "Import useLogtide from #imports inside your Vue component, then call methods like captureLog, captureError, and addBreadcrumb on the returned composable. This works in both client-side and universal rendering contexts."
  - question: "Can I override the LogTide DSN at deploy time without rebuilding my Nuxt app?"
    answer: "Yes. The module injects configuration through Nuxt runtime config, so you can override the DSN by setting the LOGTIDE_DSN environment variable at deploy time without triggering a new build."
---

LogTide's Nuxt module provides zero-config structured logging for Nuxt applications with automatic server and client initialization, runtime config injection, and Vue composables.

## Why use LogTide with Nuxt?

- **Zero-config**: Add module to nuxt.config.ts and it works
- **Runtime config**: DSN injected via Nuxt runtime config, overridable at deploy time
- **Server + client**: Auto-initializes on both sides
- **Composable API**: `useLogtide()` composable for Vue components
- **Error capture**: Automatic on server and client

## Prerequisites

- Nuxt 3.x
- Node.js 18+
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/nuxt
```

## Quick Start

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@logtide/nuxt'],

  logtide: {
    dsn: process.env.LOGTIDE_DSN,
    service: 'nuxt-app',
    environment: process.env.NODE_ENV,
  },
});
```

That's all you need. The module handles initialization, error capture, and provides composables.

## Configuration

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@logtide/nuxt'],

  logtide: {
    dsn: process.env.LOGTIDE_DSN,
    service: 'nuxt-app',
    environment: process.env.NODE_ENV,
    release: '1.0.0',

    // Separate client DSN (optional)
    clientDsn: process.env.NUXT_PUBLIC_LOGTIDE_DSN,

    // Toggle sides (default: both true)
    clientEnabled: true,
    serverEnabled: true,

    // Tracing
    tracesSampleRate: 1.0,
  },
});
```

## Server-Side Usage

```typescript
// server/api/users/[id].get.ts
import { hub } from '@logtide/core';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  hub.captureLog('info', 'Fetching user', { userId: id });

  const user = await getUserById(id);
  return user;
});
```

## Client-Side Usage

```vue
<script setup>
import { useLogtide } from '#imports';

const logtide = useLogtide();

async function handleSubmit() {
  logtide.addBreadcrumb({
    category: 'ui',
    message: 'Form submitted',
  });

  try {
    await $fetch('/api/submit', { method: 'POST', body: formData });
    logtide.captureLog('info', 'Form submitted');
  } catch (error) {
    logtide.captureError(error);
  }
}
</script>
```

## Environment Variables

Override configuration at deploy time:

```bash
LOGTIDE_DSN=https://lp_abc123@api.logtide.dev
NUXT_PUBLIC_LOGTIDE_DSN=https://lp_client456@api.logtide.dev
```

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs/) - Core SDK reference
- [Nuxt SDK Reference](/docs/sdks/nuxt-sdk/) - Full API documentation
- [Docker Integration](/integrations/docker/) - Container deployments
