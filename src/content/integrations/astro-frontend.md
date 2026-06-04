---
title: "Astro Error Tracking & Logging Integration"
description: "Professional Astro logging and error tracking with automatic capture, server/client monitoring, and Web Vitals."
category: "framework"
difficulty: "medium"
sdk: "javascript"
brandIcon: "simple-icons:astro"
highlights:
  - "Server & Client monitoring"
  - "Astro Middleware integration"
  - "Core Web Vitals collection"
  - "Source maps with Vite"
relatedIntegrations:
  - "nodejs"
  - "browser"
  - "vercel"
relatedUseCases: []
keywords:
  - "astro error tracking"
  - "astro logging"
  - "astro monitoring"
  - "astro capture errors"
  - "astro middleware logging"
faqs:
  - question: "How do I monitor both server-side and client-side code in an Astro project?"
    answer: "Install @logtide/core and @logtide/browser. Initialize @logtide/browser inside a client-side script tag in your Layout.astro for island and browser monitoring, and initialize @logtide/core inside src/middleware.ts using Astro middleware for server-side request logging and error capture. Both sides report to the same LogTide instance."
  - question: "Does LogTide require changes to individual Astro page files?"
    answer: "No changes are required for automatic request logging. The onRequest middleware in src/middleware.ts intercepts every server-rendered request and logs its method, path, status, and duration automatically. You can optionally call hub.captureLog directly in any .astro file frontmatter for page-level events like missing resources."
  - question: "Can LogTide track Core Web Vitals for Astro sites?"
    answer: "Yes. Adding the @logtide/browser initialization script in your shared layout means the SDK automatically collects LCP, FID, and CLS on every page. Results appear in the LogTide Dashboard under the Metrics tab without any per-page configuration."
  - question: "How do I connect frontend errors to backend server logs in Astro?"
    answer: "The Astro middleware setup logs server-side requests and errors with the astro-server service name, while the client-side SDK logs with astro-frontend. Both share the same LogTide instance, so you can filter or correlate them in the dashboard. For deeper linking, the middleware example captures request URL and method alongside each error for end-to-end traceability."
---

LogTide's Astro integration provides professional-grade observability for both server-side and client-side code. It includes automatic unhandled error capture, middleware-based request logging, and Core Web Vitals collection.

## Why use LogTide with Astro?

- **Hybrid monitoring**: Track errors in server-side `Astro.js` components and client-side interactive islands.
- **Middleware logging**: Capture every request's status, duration, and potential errors automatically.
- **Core Web Vitals**: Monitor your app's performance (LCP, FID, CLS) as perceived by real users.
- **Breadcrumbs**: Automatically track clicks and network requests in the browser.
- **Distributed Tracing**: Connect frontend requests to backend logs for end-to-end visibility.

## Prerequisites

- Astro 3.0+ or 4.0+
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/core @logtide/browser
```

## Client-Side Setup

Initialize LogTide as early as possible in your layout or on specific pages using a `<script>` tag:

```astro
---
// src/layouts/Layout.astro
---
<script>
  import { initLogtide } from '@logtide/browser';

  initLogtide({
    dsn: import.meta.env.PUBLIC_LOGTIDE_DSN,
    service: 'astro-frontend',
    environment: import.meta.env.MODE,
    release: '1.0.0',
  });
</script>

<slot />
```

## Server-Side Setup (Middleware)

To capture server-side errors and request logs, use Astro middleware:

```typescript
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { hub } from '@logtide/core';

// Initialize core SDK for server-side
hub.init({
  dsn: import.meta.env.LOGTIDE_DSN,
  service: 'astro-server',
});

export const onRequest = defineMiddleware(async (context, next) => {
  const startTime = Date.now();
  
  try {
    const response = await next();
    
    // Log successful requests
    hub.captureLog('info', `Request: ${context.request.method} ${context.url.pathname}`, {
      status: response.status,
      duration: Date.now() - startTime,
    });
    
    return response;
  } catch (error) {
    // Capture server-side errors
    hub.captureError(error, {
      extra: { url: context.url.pathname, method: context.request.method }
    });
    throw error;
  }
});
```

## Logging in Astro Components

You can log directly from your `.astro` files (server-side):

```astro
---
// src/pages/post/[id].astro
import { hub } from '@logtide/core';

const { id } = Astro.params;

hub.captureLog('info', 'Loading post', { postId: id });

const post = await fetchPost(id);
if (!post) {
  hub.captureLog('warn', 'Post not found', { postId: id });
  return Astro.redirect('/404');
}
---
<h1>{post.title}</h1>
```

## Core Web Vitals

The `@logtide/browser` package automatically tracks performance metrics on the client. View these in your LogTide Dashboard under the **Metrics** tab.

## Source Map Uploads

To get readable stack traces in production, upload your source maps during your build:

```bash
# Using @logtide/cli
logtide sourcemaps upload --path ./dist --release 1.0.0 --apiKey YOUR_API_KEY
```

## Next Steps

- [Browser SDK Docs](/docs/sdks/browser/) - Full browser SDK reference
- [Node.js Integration](/integrations/nodejs/) - For SSR and API routes
- [Vite Setup](/integrations/vite/) - Best practices for Vite builds
