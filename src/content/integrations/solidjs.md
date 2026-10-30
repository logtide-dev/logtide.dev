---
title: "SolidJS Error Tracking & Monitoring Integration"
description: "Professional SolidJS error tracking with automatic capture, Error Boundaries, Web Vitals, and breadcrumbs."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:solid"
highlights:
  - "Solid Error Boundary"
  - "Core Web Vitals collection"
  - "Session tracking & Breadcrumbs"
  - "Native Vite source maps"
relatedIntegrations:
  - "react"
  - "nodejs"
  - "browser"
relatedUseCases: []
keywords:
  - "solidjs error tracking"
  - "solidjs logging"
  - "solidjs monitoring"
  - "solidjs capture errors"
  - "solidjs error boundary"
faqs:
  - question: "How do I add error tracking to a SolidJS application with LogTide?"
    answer: "Install @logtide/browser, then call initLogtide with your DSN, service name, and environment at the top of index.tsx before the render call. LogTide automatically captures all unhandled exceptions and promise rejections from that point forward."
  - question: "How does LogTide integrate with SolidJS ErrorBoundary?"
    answer: "Use SolidJS native ErrorBoundary from solid-js and call hub.captureError inside the fallback function, passing the caught error and any relevant tags. This lets Solid handle the UI recovery while LogTide records the full error context for your LogTide Dashboard."
  - question: "Does LogTide collect Core Web Vitals for SolidJS apps?"
    answer: "Yes, once enabled. Web Vitals are opt-in. Enable them with browser: { webVitals: true } in initLogtide and install the web-vitals package as a peer dependency. LCP, INP, and CLS are then sent as info logs (message 'Web Vital: LCP = ...') with a performance.metric field, so you can find them in the log search. They do not appear in a dedicated Metrics tab."

  - question: "Can I manually log custom events and breadcrumbs in SolidJS?"
    answer: "Yes. Import hub from @logtide/core and call hub.addBreadcrumb to record user interactions, or hub.captureLog to send structured log entries at any level. You can also capture try/catch errors with hub.captureError and attach extra metadata such as tags or a cart ID."
---

LogTide's SolidJS integration provides professional-grade error tracking and performance monitoring for Solid applications. It includes automatic unhandled error capture, Solid Error Boundaries, and Core Web Vitals collection.

## Why use LogTide with SolidJS?

- **Automatic error capture**: Catches all unhandled exceptions and promise rejections.
- **Error Boundaries**: Component-level error catching with Solid's native `ErrorBoundary`.
- **Core Web Vitals**: Monitor your app's performance metrics (LCP, INP, CLS) in the real world.
- **Breadcrumbs**: Track clicks and network requests leading up to an error.
- **Fine-grained Tracing**: Correlate all logs and errors for a single user session.

## Prerequisites

- SolidJS 1.0+
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/browser
```

## Quick Setup

Initialize LogTide as early as possible in your `index.tsx`:

```typescript
// index.tsx
import { render } from 'solid-js/web';
import { initLogtide } from '@logtide/browser';
import App from './App';

// Initialize LogTide
initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'solid-frontend',
  environment: 'production',
  release: '1.0.0',
});

render(() => <App />, document.getElementById('root') as HTMLElement);
```

## Using Error Boundaries

Wrap your application or specific components with Solid's native `ErrorBoundary` to capture rendering errors and report them to LogTide:

```tsx
import { ErrorBoundary } from 'solid-js';
import { hub } from '@logtide/core';

function App() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => {
        // Capture the error manually in the fallback
        hub.captureError(err, { tags: { boundary: 'main' } });

        return (
          <div>
            <h2>Something went wrong!</h2>
            <button onClick={reset}>Try again</button>
          </div>
        );
      }}
    >
      <MyDashboard />
    </ErrorBoundary>
  );
}
```

## Capture Errors Manually

You can use the `hub` API to capture errors from `try/catch` blocks or log custom events:

```tsx
import { hub } from '@logtide/core';

function CheckoutButton() {
  const handleCheckout = async () => {
    hub.addBreadcrumb({
      type: 'ui',
      category: 'ui',
      message: 'Checkout button clicked',
      timestamp: Date.now(),
    });

    try {
      await processPayment();
      hub.captureLog('info', 'Payment successful');
    } catch (err) {
      hub.captureError(err, {
        tags: { flow: 'checkout' },
        extra: { cartId: 'abc-123' }
      });
    }
  };

  return <button onClick={handleCheckout}>Pay Now</button>;
}
```

## Core Web Vitals

Web Vitals are opt-in. Enable them in `initLogtide`, and install the `web-vitals` package (an optional peer dependency of `@logtide/browser`):

```bash
npm install web-vitals
```

```typescript
initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'solid-frontend',
  browser: { webVitals: true },
});
```

LCP, INP, and CLS are sent as `info` logs (message `Web Vital: LCP = ...`) with a `performance.metric` field, so you can filter for them in the log search.

## Source Map Uploads

To get readable stack traces in production, upload your source maps during your Vite build:

```bash
# Using @logtide/cli
logtide sourcemaps upload --path ./dist --release 1.0.0 --apiKey YOUR_API_KEY
```

## Next Steps

- [Browser SDK Docs](/docs/sdks/browser/) - Full browser SDK reference
- [React Integration](/integrations/react/) - For React developers
- [Node.js Integration](/integrations/nodejs/) - For server-side monitoring
