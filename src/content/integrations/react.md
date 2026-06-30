---
title: "React Error Tracking & Monitoring Integration"
description: "Professional React error tracking with automatic capture, Error Boundaries, Web Vitals, and session-based breadcrumbs."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:react"
highlights:
  - "React Error Boundary"
  - "Core Web Vitals collection"
  - "Session & Breadcrumbs"
  - "Vite & Webpack source maps"
relatedIntegrations:
  - "nextjs"
  - "remix"
  - "nodejs"
relatedUseCases: []
keywords:
  - "react error tracking"
  - "react logging"
  - "react monitor errors"
  - "react web vitals monitoring"
  - "react capture error"
faqs:
  - question: "How do I add error tracking to my React app with LogTide?"
    answer: "Install the @logtide/browser package, then call initLogtide with your DSN, service name, and environment in main.tsx or index.tsx before your app bootstraps. LogTide will automatically capture all unhandled exceptions and promise rejections from that point on."
  - question: "Do I need to change my existing React component code to use LogTide?"
    answer: "Not for automatic error capture. Wrapping your app or specific subtrees with LogtideErrorBoundary catches rendering errors at the component level without modifying individual components. For manual logging or breadcrumbs inside business logic, you can optionally call hub.captureError or hub.captureLog where needed."
  - question: "Does LogTide support Core Web Vitals monitoring for React apps?"
    answer: "Yes. The @logtide/browser SDK automatically collects LCP, FID, CLS, and INP metrics with no additional configuration. Results are visible in the LogTide Dashboard under the Metrics tab."
  - question: "How do I get readable stack traces instead of minified production code?"
    answer: "Upload your source maps during the build step using the @logtide/cli tool with the logtide sourcemaps upload command, providing the output directory, release version, and your API key. LogTide will then map production errors back to the original source lines."
---

LogTide's React integration provides professional-grade error tracking and performance monitoring for React applications. It includes automatic unhandled error capture, React Error Boundaries, and Core Web Vitals collection.

## Why use LogTide with React?

- **Automatic error capture**: Catches all unhandled exceptions and promise rejections.
- **Error Boundaries**: Component-level error catching with full stack traces.
- **Core Web Vitals**: Monitor LCP, FID, CLS, and INP to ensure a smooth UX.
- **Breadcrumbs**: Automatically track user clicks and network requests leading up to an error.
- **Source Maps**: See the original source code in your stack traces instead of minified production code.

## Prerequisites

- React 16.8+ (Hooks support)
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/browser
```

## Quick Setup

Initialize LogTide as early as possible in your `main.tsx` or `index.tsx`:

```typescript
// main.tsx
import { initLogtide } from '@logtide/browser';

initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'react-frontend',
  environment: 'production',
  release: '1.0.0',
});

// ... bootstrap your React app
```

## Using Error Boundaries

Wrap your application or specific components with an Error Boundary to capture rendering errors:

```tsx
import React from 'react';
import { LogtideErrorBoundary } from '@logtide/browser';

function MyErrorPage({ error }: { error: Error }) {
  return (
    <div className="error-container">
      <h2>Something went wrong!</h2>
      <pre>{error.message}</pre>
    </div>
  );
}

export default function App() {
  return (
    <LogtideErrorBoundary fallback={(error) => <MyErrorPage error={error} />}>
      <Dashboard />
    </LogtideErrorBoundary>
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
      hub.captureLog('info', 'Payment successful', { amount: 99.99 });
    } catch (error) {
      hub.captureError(error, {
        tags: { flow: 'checkout' },
        extra: { cartId: 'abc-123' }
      });
    }
  };

  return <button onClick={handleCheckout}>Pay Now</button>;
}
```

## Core Web Vitals

LogTide automatically tracks performance metrics. You can view these in your LogTide Dashboard under the **Metrics** tab to monitor your app's health in the real world.

## Source Map Uploads

To get readable stack traces, upload your source maps during your build process:

```bash
# Using @logtide/cli
logtide sourcemaps upload --path ./dist --release 1.0.0 --apiKey YOUR_API_KEY
```

## Next Steps

- [Browser SDK Docs](/docs/sdks/browser/) - Full browser SDK reference
- [Next.js Integration](/integrations/nextjs/) - For SSR and App Router
- [Remix Integration](/integrations/remix/) - Full-stack React monitoring
