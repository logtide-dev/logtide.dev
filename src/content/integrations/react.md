---
title: "React Error Tracking & Monitoring Integration"
description: "Track React errors with LogTide: error boundaries, React 19 root error callbacks, custom hooks, router breadcrumbs, and Web Vitals."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:react"
highlights:
  - "Error boundary with componentDidCatch"
  - "React 19 onCaughtError hook"
  - "Core Web Vitals collection"
  - "Source maps via CLI"
relatedIntegrations:
  - "nextjs"
  - "remix"
  - "nodejs"
relatedUseCases: []
keywords:
  - "react error tracking"
  - "react logging"
  - "react error boundary logging"
  - "react web vitals monitoring"
  - "react capture error"
faqs:
  - question: "How do I add error tracking to my React app with LogTide?"
    answer: "Install @logtide/browser and @logtide/core, then call initLogtide with your DSN, service name, and environment in main.tsx before you render the app. From that point LogTide captures unhandled exceptions and promise rejections. Errors thrown while rendering need an error boundary that reports them with hub.captureError."
  - question: "Is there a dedicated LogTide package for React?"
    answer: "No. The documented SDKs are @logtide/browser and @logtide/core, and the Browser SDK docs list dedicated packages only for Next.js, Nuxt, SvelteKit, and Angular. In React you write a small error boundary yourself and call hub.captureError from it, as shown on this page."
  - question: "Do I need to change my existing React component code to use LogTide?"
    answer: "Not for automatic capture of unhandled errors. To catch rendering errors you add one error boundary near the root, and optionally more around risky subtrees. For manual logging or breadcrumbs inside business logic you can call hub.captureError, hub.captureLog and hub.addBreadcrumb where needed."
  - question: "Does LogTide support Core Web Vitals monitoring for React apps?"
    answer: "Yes, once enabled. Web Vitals are opt-in. Enable them with browser: { webVitals: true } in initLogtide and install the web-vitals package as a peer dependency. LCP, INP, and CLS are then sent as info logs (message 'Web Vital: LCP = ...') with a performance.metric field, so you can find them in the log search. They do not appear in a dedicated Metrics tab."
  - question: "How do I get readable stack traces instead of minified production code?"
    answer: "Upload your source maps during the build step with the @logtide/cli tool, using the logtide sourcemaps upload command with the output directory, release version, and your API key. Use the same release value in initLogtide so errors are matched to the right maps."
---

React has no dedicated LogTide package. You use the Browser SDK (`@logtide/browser`) for initialization and automatic capture, and the `hub` from `@logtide/core` for manual calls. The React-specific part is how errors reach the hub: rendering errors only surface through an error boundary, so that is where most of this page focuses.

## What is captured and where

| Source of the error | Caught by | What you add |
|---|---|---|
| Unhandled exception, unhandled promise rejection | Browser SDK, automatically | Nothing |
| Error thrown while rendering a component | Nearest error boundary | A boundary that calls `hub.captureError` |
| Error thrown inside an event handler | Not an error boundary (React does not route these there) | `try/catch` plus `hub.captureError` |
| Failed `fetch` / XHR | Network breadcrumb on the next error | Nothing |

## Prerequisites

- React 16.8+ for the examples on this page. The `createRoot` callbacks below need React 19.
- A LogTide instance with a DSN

## Installation

```bash
npm install @logtide/browser @logtide/core
```

The Browser SDK depends on `@logtide/core`, but installing it explicitly makes the `hub` import resolve under strict package managers such as pnpm.

## Quick Setup

Initialize LogTide before the first render, in `main.tsx`:

```tsx
// main.tsx
import { createRoot } from 'react-dom/client';
import { initLogtide } from '@logtide/browser';
import App from './App';

initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'react-frontend',
  environment: 'production',
  release: '1.0.0',
});

createRoot(document.getElementById('root')!).render(<App />);
```

## An error boundary that reports to LogTide

React only supports error boundaries as class components, using `getDerivedStateFromError` to switch to a fallback UI and `componentDidCatch` for side effects such as reporting. React's documentation says side effects belong in `componentDidCatch`, while `getDerivedStateFromError` must stay pure.

```tsx
// LogtideBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { hub } from '@logtide/core';

type Props = {
  name: string; // which part of the UI this boundary guards
  fallback: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
};
type State = { error: Error | null };

export class LogtideBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    hub.captureError(error, {
      boundary: this.props.name,
      componentStack: info.componentStack,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
```

Use one boundary at the root and smaller ones around parts that can fail independently, so a broken widget does not blank the page:

```tsx
<LogtideBoundary name="app" fallback={(e, reset) => <CrashPage error={e} onRetry={reset} />}>
  <Header />
  <LogtideBoundary name="reports" fallback={() => <p>Reports are unavailable.</p>}>
    <Reports />
  </LogtideBoundary>
</LogtideBoundary>
```

In production builds the component names in `componentStack` are minified, so upload source maps (below) and set `release`.

## React 19: report from the root instead

React 19 adds callbacks to `createRoot` that fire for every error, so you can report from one place rather than in each boundary. `onCaughtError` runs when an error boundary caught the error, `onUncaughtError` when none did, and `onRecoverableError` when React recovered on its own. Each receives `(error, errorInfo)` with `errorInfo.componentStack`.

```tsx
createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    hub.captureError(error, { componentStack: errorInfo.componentStack, caught: true });
  },
}).render(<App />);
```

With this in place, your boundaries only need `getDerivedStateFromError` for the fallback UI, and you avoid reporting the same error twice. The example registers only `onCaughtError` because unhandled errors are already picked up by the Browser SDK's global handlers. If you add `onUncaughtError` as well, check in the log search that one crash does not appear twice.

## Reporting from event handlers and a custom hook

Error boundaries do not see errors thrown in event handlers, so wrap those yourself. A small hook keeps the breadcrumb, the logging and the error capture in one place:

```tsx
import { useCallback } from 'react';
import { hub } from '@logtide/core';

export function useTrackedAction<A extends unknown[], R>(
  name: string,
  action: (...args: A) => Promise<R>,
) {
  return useCallback(async (...args: A) => {
    hub.addBreadcrumb({ type: 'custom', category: 'action', message: name, timestamp: Date.now() });
    try {
      const result = await action(...args);
      hub.captureLog('info', `${name} succeeded`);
      return result;
    } catch (error) {
      hub.captureError(error, { action: name });
      throw error;
    }
  }, [name, action]);
}

function CheckoutButton() {
  const pay = useTrackedAction('checkout', processPayment);
  return <button onClick={() => pay().catch(() => {})}>Pay now</button>;
}
```

Keep `action` stable (defined outside the component or wrapped in `useCallback`), or the callback is recreated on every render.

## Router breadcrumbs

The Browser SDK records clicks and `fetch`/XHR calls as breadcrumbs, but client-side route changes are not part of the documented automatic breadcrumbs. If you want them in the trail leading to an error, add one with your router. With React Router:

```tsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { hub } from '@logtide/core';

export function RouteBreadcrumbs() {
  const location = useLocation();
  useEffect(() => {
    hub.addBreadcrumb({
      type: 'navigation',
      category: 'navigation',
      message: `Navigated to ${location.pathname}`,
      timestamp: Date.now(),
    });
  }, [location.pathname]);
  return null;
}
```

Render `<RouteBreadcrumbs />` once inside your router.

## Server rendering

`@logtide/browser` is a browser SDK, so call `initLogtide` only on the client (for example in the client entry, or behind a `typeof window !== 'undefined'` check). For server-rendered React use the framework pages: the [Next.js](/integrations/nextjs/) and [Remix](/integrations/remix/) guides cover both sides.

## Core Web Vitals

Web Vitals are opt-in. Enable them in `initLogtide`, and install the `web-vitals` package (an optional peer dependency of `@logtide/browser`):

```bash
npm install web-vitals
```

```tsx
initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'react-frontend',
  browser: { webVitals: true },
});
```

LCP, INP, and CLS are sent as `info` logs (message `Web Vital: LCP = ...`) with a `performance.metric` field, so you can filter for them in the log search.

## Source Map Uploads

Upload source maps during your build so stack traces point at your original files:

```bash
npm install -g @logtide/cli
logtide sourcemaps upload --path ./dist --release 1.0.0 --api-key YOUR_API_KEY
```

## Next Steps

- [Browser SDK Docs](/docs/sdks/browser/) - Full browser SDK reference
- [Next.js Integration](/integrations/nextjs/) - For SSR and App Router
- [Remix Integration](/integrations/remix/) - Full-stack React monitoring
