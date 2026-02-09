---
title: "SvelteKit Application Logging Integration"
description: "Add structured logging to SvelteKit applications with server hooks, error handling, fetch instrumentation, and client init."
category: "framework"
difficulty: "medium"
sdk: "javascript"
brandIcon: "simple-icons:svelte"
highlights:
  - "Server hook integration"
  - "Fetch instrumentation"
  - "Form action logging"
  - "Client + server support"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases: []
keywords:
  - "sveltekit logging"
  - "svelte structured logging"
  - "sveltekit error tracking"
  - "sveltekit hooks logging"
  - "svelte server logging"
---

LogTide's SvelteKit SDK integrates through SvelteKit's hooks system — `handle`, `handleError`, and `handleFetch` — with support for both server-side and client-side error capture.

## Why use LogTide with SvelteKit?

- **Hook-based**: Integrates through SvelteKit's native hooks
- **Fetch instrumentation**: Trace propagation on server-side fetches
- **Form actions**: Capture errors in form action handlers
- **Client + server**: Error capture on both sides
- **Load functions**: Context available in server load functions

## Prerequisites

- SvelteKit 2.x
- Node.js 18+
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/sveltekit
```

## Quick Start

### Server Hooks

```typescript
// src/hooks.server.ts
import { logtideHandle, logtideHandleError } from '@logtide/sveltekit';

export const handle = logtideHandle({
  dsn: import.meta.env.LOGTIDE_DSN,
  service: 'sveltekit-app',
  environment: import.meta.env.MODE,
});
export const handleError = logtideHandleError();
```

### Client Hooks

```typescript
// src/hooks.client.ts
import { logtideHandleError } from '@logtide/sveltekit';

export const handleError = logtideHandleError();
```

## Composing with Other Hooks

```typescript
import { sequence } from '@sveltejs/kit/hooks';
import { logtideHandle } from '@logtide/sveltekit';

export const handle = sequence(
  logtideHandle({
    dsn: import.meta.env.LOGTIDE_DSN,
    service: 'sveltekit-app',
    environment: import.meta.env.MODE,
  }),
  ({ event, resolve }) => {
    // Your custom logic
    return resolve(event);
  }
);
```

## Fetch Instrumentation

```typescript
// src/hooks.server.ts
import { logtideHandleFetch } from '@logtide/sveltekit';

export const handleFetch = logtideHandleFetch();
// Outgoing fetches from load functions include traceparent headers
```

## Load Functions

```typescript
// src/routes/users/[id]/+page.server.ts
import { hub } from '@logtide/core';

export async function load({ params, fetch }) {
  hub.captureLog('info', 'Loading user', { userId: params.id });

  const res = await fetch(`/api/users/${params.id}`);
  if (!res.ok) {
    hub.captureLog('warn', 'User not found', { userId: params.id });
    throw error(404, 'Not found');
  }

  return { user: await res.json() };
}
```

## Form Actions

```typescript
// src/routes/settings/+page.server.ts
import { hub } from '@logtide/core';

export const actions = {
  update: async ({ request }) => {
    const data = await request.formData();

    hub.addBreadcrumb({
      category: 'form',
      message: 'Settings form submitted',
    });

    try {
      await updateSettings(Object.fromEntries(data));
      hub.captureLog('info', 'Settings updated');
      return { success: true };
    } catch (error) {
      hub.captureError(error);
      return fail(500, { message: 'Update failed' });
    }
  },
};
```

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs) - Core SDK reference
- [SvelteKit SDK Reference](/docs/sdks/sveltekit) - Full API documentation
- [Docker Integration](/integrations/docker) - Container deployments
