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
---

LogTide's SolidJS integration provides professional-grade error tracking and performance monitoring for Solid applications. It includes automatic unhandled error capture, Solid Error Boundaries, and Core Web Vitals collection.

## Why use LogTide with SolidJS?

- **Automatic error capture**: Catches all unhandled exceptions and promise rejections.
- **Error Boundaries**: Component-level error catching with Solid's native `ErrorBoundary`.
- **Core Web Vitals**: Monitor your app's performance metrics (LCP, FID, CLS, INP) in the real world.
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
      category: 'ui',
      message: 'Checkout button clicked',
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

LogTide automatically tracks performance metrics. View the results in your LogTide Dashboard under the **Metrics** tab.

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
