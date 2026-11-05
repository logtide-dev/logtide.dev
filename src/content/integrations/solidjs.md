---
title: "SolidJS Error Tracking & Monitoring Integration"
description: "Report SolidJS errors to LogTide with ErrorBoundary and reset, reactive effects for breadcrumbs, resource errors, router hooks, and Web Vitals."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:solid"
highlights:
  - "ErrorBoundary with reset"
  - "Reactive breadcrumbs with effects"
  - "Resource and async errors"
  - "Core Web Vitals collection"
relatedIntegrations:
  - "react"
  - "nodejs"
  - "browser"
relatedUseCases: []
keywords:
  - "solidjs error tracking"
  - "solidjs logging"
  - "solidjs monitoring"
  - "solidjs error boundary"
  - "solid createResource errors"
faqs:
  - question: "How do I add error tracking to a SolidJS application with LogTide?"
    answer: "Install @logtide/browser and @logtide/core, then call initLogtide with your DSN, service name, and environment at the top of index.tsx before the render call. From then on LogTide captures unhandled exceptions and promise rejections. For errors thrown during rendering, wrap parts of the tree in Solid's ErrorBoundary and report from a fallback component."
  - question: "Is there a dedicated LogTide package for SolidJS?"
    answer: "No. The documented SDKs are @logtide/browser and @logtide/core, and the dedicated framework packages in the docs are for Next.js, Nuxt, SvelteKit, and Angular. In Solid you use the browser SDK and the hub directly, as shown on this page."
  - question: "How does LogTide integrate with SolidJS ErrorBoundary?"
    answer: "Use ErrorBoundary from solid-js. Its fallback receives the error and a reset function. Render a small component as the fallback and call hub.captureError from onMount inside it, so the report is made once when the fallback appears and not every time the fallback function is evaluated."
  - question: "Does ErrorBoundary catch errors from event handlers?"
    answer: "No. Solid's ErrorBoundary catches errors thrown while rendering and while updating reactive computations in its subtree. Errors in event handlers and in callbacks scheduled outside Solid's flow are not caught, so wrap those in try/catch and call hub.captureError, or rely on the Browser SDK's global handlers for unhandled ones."
  - question: "Does LogTide collect Core Web Vitals for SolidJS apps?"
    answer: "Yes, once enabled. Web Vitals are opt-in. Enable them with browser: { webVitals: true } in initLogtide and install the web-vitals package as a peer dependency. LCP, INP, and CLS are then sent as info logs (message 'Web Vital: LCP = ...') with a performance.metric field, so you can find them in the log search. They do not appear in a dedicated Metrics tab."
---

Solid has no dedicated LogTide package. You use the Browser SDK (`@logtide/browser`) for initialization and unhandled-error capture, and the `hub` from `@logtide/core` for manual calls. The Solid-specific part is that components run once and updates happen in reactive computations, so you report errors from `ErrorBoundary` fallbacks and use effects, not re-renders, to drive breadcrumbs.

## What is captured and where

| Source of the error | Caught by | What you add |
|---|---|---|
| Unhandled exception, unhandled promise rejection | Browser SDK, automatically | Nothing |
| Error while rendering JSX or updating a reactive computation | Nearest `ErrorBoundary` | A fallback that reports with `hub.captureError` |
| Error from a `createResource` fetcher that is read in the tree | Nearest `ErrorBoundary`, when the resource is read | The same fallback |
| Error in an event handler or an out-of-flow callback | Not an `ErrorBoundary` | `try/catch` plus `hub.captureError` |

## Prerequisites

- SolidJS 1.x
- A LogTide instance with a DSN

## Installation

```bash
npm install @logtide/browser @logtide/core
```

Installing `@logtide/core` explicitly makes the `hub` import resolve under strict package managers such as pnpm.

## Quick Setup

```tsx
// index.tsx
import { render } from 'solid-js/web';
import { initLogtide } from '@logtide/browser';
import App from './App';

initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'solid-frontend',
  environment: 'production',
  release: '1.0.0',
});

render(() => <App />, document.getElementById('root') as HTMLElement);
```

## ErrorBoundary that reports once

`ErrorBoundary` takes a `fallback` that is either an element or a function `(err, reset) => JSX`. The cleanest way to run a side effect is to make the fallback a component and report in `onMount`:

```tsx
import { ErrorBoundary, onMount, type Component } from 'solid-js';
import { hub } from '@logtide/core';

const ErrorFallback: Component<{ err: unknown; reset: () => void; boundary: string }> = (props) => {
  onMount(() => {
    hub.captureError(props.err, { boundary: props.boundary });
  });

  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <button onClick={props.reset}>Try again</button>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary fallback={(err, reset) => <ErrorFallback err={err} reset={reset} boundary="app" />}>
      <Dashboard />
    </ErrorBoundary>
  );
}
```

`reset` clears the error state and renders the children again. Each retry that fails again mounts a new fallback and sends a new report, which is usually what you want to see. Nest boundaries around independent parts of the page. An error thrown by a fallback itself can be caught by a parent boundary.

## Resource errors

An error in a `createResource` fetcher is raised when the resource is read, so an `ErrorBoundary` above the reading component catches it and the same fallback reports it. If you want to log the failure without a boundary, read the resource's `error` property in an effect:

```tsx
import { createEffect, createResource } from 'solid-js';
import { hub } from '@logtide/core';

function Profile(props: { id: string }) {
  const [user] = createResource(() => props.id, fetchUser);

  createEffect(() => {
    const err = user.error;
    if (err) hub.captureError(err, { resource: 'user', id: props.id });
  });

  return <div>{user()?.name}</div>;
}
```

## Event handlers

`ErrorBoundary` does not see errors thrown in event handlers, so handle them where they happen:

```tsx
import { hub } from '@logtide/core';

function CheckoutButton() {
  const handleCheckout = async () => {
    hub.addBreadcrumb({
      type: 'custom',
      category: 'ui',
      message: 'Checkout button clicked',
      timestamp: Date.now(),
    });

    try {
      await processPayment();
      hub.captureLog('info', 'Payment successful');
    } catch (err) {
      hub.captureError(err, { flow: 'checkout', cartId: 'abc-123' });
    }
  };

  return <button onClick={handleCheckout}>Pay now</button>;
}
```

## Reactive breadcrumbs and router changes

Because effects re-run when the signals they read change, they are a good way to record state transitions as breadcrumbs. With `@solidjs/router`, track the location:

```tsx
import { createEffect, on } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { hub } from '@logtide/core';

export function RouteBreadcrumbs() {
  const location = useLocation();

  createEffect(
    on(
      () => location.pathname,
      (path) =>
        hub.addBreadcrumb({
          type: 'navigation',
          category: 'navigation',
          message: `Navigated to ${path}`,
          timestamp: Date.now(),
        }),
    ),
  );

  return null;
}
```

The Browser SDK's automatic breadcrumbs cover clicks and `fetch`/XHR calls, not client-side route changes, so this fills that gap. Render the component once inside your `Router`.

## Server rendering

`@logtide/browser` is a browser SDK. In a server-rendered Solid app (for example SolidStart), run `initLogtide` only on the client side, in the client entry, and do not call it during server render. There is no documented LogTide server package for Solid, so server-side logging would use the [Node.js SDK](/docs/sdks/nodejs/) directly.

## Core Web Vitals

Web Vitals are opt-in. Enable them in `initLogtide`, and install the `web-vitals` package (an optional peer dependency of `@logtide/browser`):

```bash
npm install web-vitals
```

```tsx
initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'solid-frontend',
  browser: { webVitals: true },
});
```

LCP, INP, and CLS are sent as `info` logs (message `Web Vital: LCP = ...`) with a `performance.metric` field, so you can filter for them in the log search.

## Source Map Uploads

Upload source maps from your Vite build so stack traces point at your original files:

```bash
npm install -g @logtide/cli
logtide sourcemaps upload --path ./dist --release 1.0.0 --api-key YOUR_API_KEY
```

## Next Steps

- [Browser SDK Docs](/docs/sdks/browser/) - Full browser SDK reference
- [React Integration](/integrations/react/) - For React developers
- [Node.js Integration](/integrations/nodejs/) - For server-side monitoring
