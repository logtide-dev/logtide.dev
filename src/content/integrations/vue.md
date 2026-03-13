---
title: "Vue.js Error Tracking & Monitoring Integration"
description: "Professional Vue.js error tracking with automatic capture, Vue Error Handlers, Core Web Vitals, and breadcrumbs."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:vuedotjs"
highlights:
  - "Vue Global Error Handler"
  - "Core Web Vitals collection"
  - "Session tracking & Breadcrumbs"
  - "Source maps with Vite"
relatedIntegrations:
  - "nuxt"
  - "nodejs"
  - "browser"
relatedUseCases: []
keywords:
  - "vue error tracking"
  - "vue logging"
  - "vue monitoring"
  - "vue capture errors"
  - "vue global error handler"
---

LogTide's Vue.js integration provides professional-grade error tracking and performance monitoring for Vue applications. It includes automatic unhandled error capture, Vue global error handlers, and Core Web Vitals collection.

## Why use LogTide with Vue?

- **Global error handler**: Automatically captures all errors in components, watchers, and lifecycle hooks.
- **Core Web Vitals**: Monitor your app's performance metrics (LCP, FID, CLS) in the real world.
- **Breadcrumbs**: Track the clicks and network requests leading up to an error.
- **Session context**: Correlate all logs and errors for a single user session.
- **Source Maps**: Map production errors back to your original Vue SFC files.

## Prerequisites

- Vue 3.0+ (Composition or Options API)
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/browser
```

## Quick Setup

Initialize LogTide and register the Vue error handler in your `main.ts` or `main.js`:

```typescript
// main.ts
import { createApp } from 'vue';
import { initLogtide } from '@logtide/browser';
import App from './App.vue';

const app = createApp(App);

// Initialize LogTide
initLogtide({
  dsn: 'https://lp_abc123@api.logtide.dev',
  service: 'vue-frontend',
  environment: 'production',
  release: '1.0.0',
});

// Register the Vue global error handler
app.config.errorHandler = (err, instance, info) => {
  // Capture the error with Vue component context
  hub.captureError(err, {
    tags: { info, component: instance?.$options?.name },
  });
};

app.mount('#app');
```

## Manual Logging in Components

Using the Composition API:

```vue
<script setup>
import { hub } from '@logtide/core';

async function handleAction() {
  hub.addBreadcrumb({
    category: 'ui',
    message: 'User clicked action',
  });

  try {
    await performAction();
    hub.captureLog('info', 'Action success');
  } catch (err) {
    hub.captureError(err);
  }
}
</script>
```

Using the Options API:

```javascript
export default {
  methods: {
    handleAction() {
      this.$hub.addBreadcrumb({ ... });
      // or directly use 'hub' from '@logtide/core'
    }
  }
}
```

## Core Web Vitals

LogTide automatically tracks performance metrics. No additional configuration is required. View the metrics in your LogTide Dashboard under **Metrics**.

## Source Map Uploads

To get readable stack traces in production, upload your source maps during your Vite or Webpack build:

```bash
# Using @logtide/cli
logtide sourcemaps upload --path ./dist --release 1.0.0 --apiKey YOUR_API_KEY
```

## Next Steps

- [Browser SDK Docs](/docs/sdks/browser/) - Full browser SDK reference
- [Nuxt Integration](/integrations/nuxt/) - For SSR and full-stack Vue monitoring
- [Vite Setup](/integrations/vite/) - Best practices for Vite builds
