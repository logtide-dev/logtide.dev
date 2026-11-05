---
title: "Vue.js Error Tracking & Monitoring Integration"
description: "Send Vue 3 errors to LogTide with app.config.errorHandler, onErrorCaptured boundaries, composables, Vue Router hooks, and Web Vitals."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:vuedotjs"
highlights:
  - "app.config.errorHandler"
  - "onErrorCaptured boundaries"
  - "Composables and Vue Router"
  - "Core Web Vitals collection"
relatedIntegrations:
  - "nuxt"
  - "nodejs"
  - "browser"
relatedUseCases: []
keywords:
  - "vue error tracking"
  - "vue logging"
  - "vue monitoring"
  - "vue onErrorCaptured"
  - "vue global error handler"
faqs:
  - question: "How do I send Vue.js errors to LogTide?"
    answer: "Install @logtide/browser and @logtide/core, call initLogtide in main.ts before mounting your app, then assign a function to app.config.errorHandler that calls hub.captureError. Vue routes errors from component renders, event handlers, lifecycle hooks, setup(), watchers, custom directive hooks and transition hooks to that handler."
  - question: "Is there a dedicated LogTide package for Vue?"
    answer: "No. For plain Vue you use @logtide/browser and @logtide/core directly, as shown on this page. The dedicated framework packages in the docs are for Next.js, Nuxt, SvelteKit, and Angular, so use the Nuxt SDK if you run Vue through Nuxt."
  - question: "Does LogTide work with both the Composition API and the Options API?"
    answer: "Yes. hub is a plain import from @logtide/core, so you can call hub.captureError or hub.addBreadcrumb from a setup function, a composable, or an Options API method. The onErrorCaptured hook is available in both styles."
  - question: "Does LogTide support performance monitoring for Vue applications?"
    answer: "Yes, once enabled. Web Vitals are opt-in. Enable them with browser: { webVitals: true } in initLogtide and install the web-vitals package as a peer dependency. LCP, INP, and CLS are then sent as info logs (message 'Web Vital: LCP = ...') with a performance.metric field, so you can find them in the log search. They do not appear in a dedicated Metrics tab."
  - question: "Can I use LogTide alongside my existing Vue error monitoring tool?"
    answer: "Be careful here. app.config.errorHandler holds a single function, and setting it replaces Vue's default handler (which logs in production and rethrows in development). If another tool also sets it, call both from one handler. The @logtide/browser global handlers for unhandled errors are separate from Vue's handler."
---

Vue has no dedicated LogTide package. You use the Browser SDK (`@logtide/browser`) to initialize and capture unhandled errors, and the `hub` from `@logtide/core` for manual calls. What is Vue-specific is that Vue catches errors inside components itself, so they never reach the browser's global handlers. You have to forward them with `app.config.errorHandler`, or with `onErrorCaptured` for a boundary around part of the tree.

## What is captured and where

| Source of the error | Caught by | What you add |
|---|---|---|
| Unhandled exception outside Vue, unhandled promise rejection | Browser SDK, automatically | Nothing |
| Component render, `setup()`, lifecycle hooks, watchers, event handlers, directive and transition hooks | Vue, then `app.config.errorHandler` | A handler that calls `hub.captureError` |
| A subtree you want to isolate | `onErrorCaptured` in a parent component | A boundary component (below) |
| Router navigation failures | `router.onError` | A handler that calls `hub.captureError` |

## Prerequisites

- Vue 3 (Composition or Options API)
- A LogTide instance with a DSN

## Installation

```bash
npm install @logtide/browser @logtide/core
```

Installing `@logtide/core` explicitly makes the `hub` import resolve under strict package managers such as pnpm.

## Quick Setup

```typescript
// main.ts
import { createApp } from 'vue';
import { initLogtide } from '@logtide/browser';
import { hub } from '@logtide/core';
import App from './App.vue';

initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'vue-frontend',
  environment: 'production',
  release: '1.0.0',
});

const app = createApp(App);

app.config.errorHandler = (err, instance, info) => {
  hub.captureError(err, {
    vueInfo: info,
    component: instance?.$options?.name,
  });
  console.error(err); // keep Vue's own console output
};

app.mount('#app');
```

Two details from the Vue docs worth knowing. First, assigning `errorHandler` replaces the default behavior (rethrow in development, log in production), which is why the example logs to the console itself. Second, in production builds `info` is a short code instead of a readable string such as the lifecycle hook name. It is still useful as a grouping field, and Vue publishes a production error code reference to decode it.

## A boundary with onErrorCaptured

`onErrorCaptured` lets a parent component catch errors from its descendants and show a fallback. If the hook returns `false`, propagation stops and `app.config.errorHandler` is not called, so report to LogTide inside the hook:

```vue
<!-- LogtideBoundary.vue -->
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';
import { hub } from '@logtide/core';

const props = defineProps<{ name: string }>();
const error = ref<unknown>(null);

onErrorCaptured((err, _instance, info) => {
  hub.captureError(err, { boundary: props.name, vueInfo: info });
  error.value = err;
  return false; // handled here, do not bubble to app.config.errorHandler
});
</script>

<template>
  <slot v-if="!error" />
  <slot v-else name="fallback" :error="error" :reset="() => (error = null)">
    <p>Something went wrong.</p>
  </slot>
</template>
```

Vue warns that the fallback must not re-render the content that threw, or the component can loop. The `reset` function above clears the error so the default slot is tried again, so only expose it behind a user action such as a retry button.

## A composable for tracked actions

Composables are the natural place to share the breadcrumb, log and capture pattern:

```typescript
// useTrackedAction.ts
import { hub } from '@logtide/core';

export function useTrackedAction<A extends unknown[], R>(
  name: string,
  action: (...args: A) => Promise<R>,
) {
  return async (...args: A): Promise<R> => {
    hub.addBreadcrumb({ type: 'custom', category: 'action', message: name, timestamp: Date.now() });
    try {
      const result = await action(...args);
      hub.captureLog('info', `${name} succeeded`);
      return result;
    } catch (err) {
      hub.captureError(err, { action: name });
      throw err;
    }
  };
}
```

```vue
<script setup lang="ts">
import { useTrackedAction } from './useTrackedAction';
import { saveProfile } from './api';

const save = useTrackedAction('save-profile', saveProfile);
</script>

<template>
  <button @click="save()">Save</button>
</template>
```

Vue routes a rejected promise from a `@click` handler to `errorHandler`, so rethrowing here produces a second report for the same failure. If that bothers you, drop the `hub.captureError` call from the composable and let the global handler do it, or return a result instead of rethrowing.

In the Options API the same `hub` import works inside methods; there is no plugin to install.

## Vue Router

Router navigation errors do not go through `errorHandler`. Report them with `router.onError`, and use `afterEach` to add navigation breadcrumbs (the Browser SDK's automatic breadcrumbs cover clicks and network calls, not client-side route changes):

```typescript
import { hub } from '@logtide/core';

router.onError((err, to) => {
  hub.captureError(err, { route: to.fullPath });
});

router.afterEach((to) => {
  hub.addBreadcrumb({
    type: 'navigation',
    category: 'navigation',
    message: `Navigated to ${to.fullPath}`,
    timestamp: Date.now(),
  });
});
```

## Server rendering

`@logtide/browser` is for the browser. Call `initLogtide` only on the client side of an SSR app. If you use Nuxt, the [Nuxt integration](/integrations/nuxt/) and its dedicated SDK cover server and client together.

## Core Web Vitals

Web Vitals are opt-in. Enable them in `initLogtide`, and install the `web-vitals` package (an optional peer dependency of `@logtide/browser`):

```bash
npm install web-vitals
```

```typescript
initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'vue-frontend',
  browser: { webVitals: true },
});
```

LCP, INP, and CLS are sent as `info` logs (message `Web Vital: LCP = ...`) with a `performance.metric` field, so you can filter for them in the log search.

## Source Map Uploads

Upload source maps from your Vite or Webpack build so stack traces point at your `.vue` sources:

```bash
npm install -g @logtide/cli
logtide sourcemaps upload --path ./dist --release 1.0.0 --api-key YOUR_API_KEY
```

Use the same `release` value in `initLogtide`.

## Next Steps

- [Browser SDK Docs](/docs/sdks/browser/) - Full browser SDK reference
- [Nuxt Integration](/integrations/nuxt/) - For SSR and full-stack Vue monitoring
