---
title: "Node.js SDK Integration"
description: "Send structured logs from Node.js applications to LogTide with automatic batching, retries, and console interception."
category: "language"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:nodedotjs"
highlights:
  - "Automatic batching"
  - "Console interception"
  - "Express/Fastify middleware"
  - "TypeScript support"
relatedIntegrations:
  - "docker"
  - "nginx"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "nodejs logging"
  - "node.js logs"
  - "javascript logging"
  - "express logging"
  - "typescript logging"
---

The LogTide Node.js SDK provides structured logging with automatic batching, retries, and seamless integration with popular frameworks like Express and Fastify.

## Why use the LogTide Node.js SDK?

- **Structured by default**: JSON logs with consistent fields
- **Automatic batching**: Reduces network overhead with intelligent batching
- **Zero-downtime**: Circuit breaker prevents app crashes if LogTide is unreachable
- **Console interception**: Capture `console.log()` calls automatically
- **Request correlation**: Trace requests across services with trace IDs
- **TypeScript**: Full type definitions included

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm, yarn, or pnpm
- LogTide instance with API key

## Installation

```bash
npm install @logtide/sdk-node
```

Or with yarn/pnpm:

```bash
yarn add @logtide/sdk-node
pnpm add @logtide/sdk-node
```

## Quick Start (5 minutes)

### Basic Setup

```typescript
import { LogTideClient } from '@logtide/sdk-node';

const logtide = new LogTideClient({
  apiUrl: 'https://api.logtide.dev', // or your self-hosted URL
  apiKey: process.env.LOGTIDE_API_KEY!,
});

// Send a log
logtide.info('Application started', {
  version: '1.0.0',
  environment: process.env.NODE_ENV,
});

// Different log levels
logtide.debug('Debug information');
logtide.info('User logged in', { userId: '123' });
logtide.warn('Rate limit approaching', { current: 90, max: 100 });
logtide.error('Failed to process payment', { orderId: '456' });
logtide.critical('Database connection lost');

// Graceful shutdown - flush remaining logs
process.on('SIGTERM', async () => {
  await logtide.shutdown();
  process.exit(0);
});
```

### Environment Variables

Store your credentials in environment variables:

```bash
# .env
LOGTIDE_API_URL=https://api.logtide.dev
LOGTIDE_API_KEY=your-project-api-key
```

## Configuration Options

```typescript
const logtide = new LogTideClient({
  // Required
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,

  // Batching (optional)
  batchSize: 100,        // Flush after N logs (default: 100)
  flushInterval: 5000,   // Flush every N ms (default: 5000)

  // Reliability (optional)
  maxRetries: 3,                    // Retry failed requests (default: 3)
  retryDelay: 1000,                 // Initial retry delay in ms
  circuitBreakerThreshold: 5,       // Open circuit after N failures
  circuitBreakerResetTime: 30000,   // Reset circuit after N ms

  // Default metadata (optional)
  globalMetadata: {
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
    hostname: os.hostname(),
  },

  // Service name (optional, defaults to 'app')
  defaultService: 'api-server',

  // Trace ID generation (optional)
  autoTraceId: true,  // Generate trace IDs if not provided

  // Console interception (optional)
  interceptConsole: {
    enabled: true,
    service: 'console',  // Service name for intercepted logs
  },
});
```

## Express.js Integration

### Middleware Setup

```typescript
import express from 'express';
import { LogTideClient, expressMiddleware } from '@logtide/sdk-node';

const app = express();
const logtide = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
});

// Add logging middleware
app.use(expressMiddleware(logtide, {
  // Log all requests
  logRequests: true,

  // Include request body (be careful with sensitive data)
  logBody: false,

  // Custom service name
  service: 'api',

  // Skip health check endpoints
  skip: (req) => req.path === '/health',
}));

app.get('/users/:id', (req, res) => {
  // Access trace ID from request
  const traceId = req.traceId;

  // Log with trace context
  logtide.info('Fetching user', {
    userId: req.params.id,
    trace_id: traceId,
  });

  res.json({ id: req.params.id });
});

// Error handling with logging
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logtide.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    trace_id: req.traceId,
  });

  res.status(500).json({ error: 'Internal server error' });
});
```

### Request Logging Output

Each request automatically logs:

```json
{
  "time": "2025-01-31T10:00:00.000Z",
  "service": "api",
  "level": "info",
  "message": "HTTP GET /users/123",
  "metadata": {
    "method": "GET",
    "path": "/users/123",
    "status": 200,
    "duration_ms": 45,
    "ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "trace_id": "abc123"
  }
}
```

## Fastify Integration

```typescript
import Fastify from 'fastify';
import { LogTideClient, fastifyPlugin } from '@logtide/sdk-node';

const fastify = Fastify();
const logtide = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
});

// Register the plugin
fastify.register(fastifyPlugin, {
  client: logtide,
  service: 'api',
});

fastify.get('/users/:id', async (request, reply) => {
  // Log with request context
  request.logtide.info('Fetching user', {
    userId: request.params.id,
  });

  return { id: request.params.id };
});
```

## Structured Error Logging

The SDK automatically parses and structures JavaScript errors:

```typescript
try {
  await processPayment(orderId);
} catch (error) {
  // Error is automatically structured
  logtide.error('Payment processing failed', {
    orderId,
    error, // SDK extracts message, stack, and type
  });
}
```

This produces structured exception data in LogTide:

```json
{
  "level": "error",
  "message": "Payment processing failed",
  "metadata": {
    "orderId": "123",
    "exception": {
      "type": "PaymentError",
      "message": "Insufficient funds",
      "language": "nodejs",
      "stacktrace": [
        { "file": "payments.js", "line": 42, "function": "processPayment" },
        { "file": "orders.js", "line": 15, "function": "createOrder" }
      ]
    }
  }
}
```

## Console Interception

Capture existing `console.log()` calls without changing your code:

```typescript
const logtide = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
  interceptConsole: {
    enabled: true,
    service: 'console',
  },
});

// These are automatically captured and sent to LogTide
console.log('User signed up');           // → info level
console.warn('Disk space low');          // → warn level
console.error('Connection timeout');     // → error level
```

> **Note**: Console interception is useful for migrating existing apps. For new code, prefer using the SDK methods directly for better structure and performance.

## Trace ID Propagation

For distributed tracing across services:

```typescript
// Service A: Generate trace ID
const traceId = crypto.randomUUID();
logtide.info('Starting request', { trace_id: traceId });

// Pass trace ID to downstream service
const response = await fetch('http://service-b/api', {
  headers: {
    'X-Trace-ID': traceId,
  },
});

// Service B: Extract and use trace ID
app.use((req, res, next) => {
  req.traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  next();
});

app.get('/api', (req, res) => {
  logtide.info('Processing in Service B', { trace_id: req.traceId });
  // ...
});
```

## TypeScript Support

Full TypeScript support with proper types:

```typescript
import { LogTideClient, LogLevel, LogMetadata } from '@logtide/sdk-node';

interface UserLogMetadata extends LogMetadata {
  userId: string;
  action: 'login' | 'logout' | 'signup';
}

const logtide = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
});

// Type-safe logging
function logUserAction(metadata: UserLogMetadata) {
  logtide.info('User action', metadata);
}

logUserAction({
  userId: '123',
  action: 'login',
});
```

## Production Best Practices

### 1. Always Flush on Shutdown

```typescript
const shutdown = async () => {
  console.log('Shutting down...');
  await logtide.shutdown(); // Flush remaining logs
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### 2. Use Environment-Specific Configuration

```typescript
const logtide = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
  globalMetadata: {
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version,
    deploymentId: process.env.DEPLOYMENT_ID,
  },
  // Reduce batch size in development for faster feedback
  batchSize: process.env.NODE_ENV === 'development' ? 10 : 100,
});
```

### 3. Don't Log Sensitive Data

```typescript
// ❌ Bad: Logging sensitive data
logtide.info('User login', {
  email: user.email,
  password: req.body.password, // Never log passwords!
});

// ✅ Good: Log only identifiers
logtide.info('User login', {
  userId: user.id,
  email: maskEmail(user.email), // user@example.com → u***@example.com
});
```

### 4. Use Appropriate Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Detailed debugging info (disabled in production) |
| `info` | Normal operations: requests, user actions |
| `warn` | Recoverable issues: rate limits, retries |
| `error` | Failures that need attention |
| `critical` | System failures requiring immediate action |

## Performance

| Metric | Value |
|--------|-------|
| Memory overhead | ~5MB |
| Latency (batched) | <1ms per log |
| Network calls | 1 per batch (100 logs default) |
| CPU impact | <0.1% |

## Troubleshooting

### Logs not appearing

1. Check API key is valid:
   ```typescript
   console.log('API URL:', process.env.LOGTIDE_API_URL);
   // Don't log full key, just check it exists
   console.log('API Key set:', !!process.env.LOGTIDE_API_KEY);
   ```

2. Ensure shutdown is called:
   ```typescript
   await logtide.shutdown();
   ```

3. Check for circuit breaker opening:
   ```typescript
   logtide.on('circuitOpen', () => {
     console.warn('LogTide circuit breaker opened - check connectivity');
   });
   ```

### High memory usage

Reduce batch size if processing many logs:

```typescript
const logtide = new LogTideClient({
  batchSize: 50, // Smaller batches
  flushInterval: 2000, // More frequent flushes
});
```

## Next Steps

- [Docker Integration](/integrations/docker) - Containerized deployments
- [nginx Integration](/integrations/nginx) - Correlate with web server logs
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy-compliant logging
