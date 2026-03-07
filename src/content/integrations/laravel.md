---
title: "Laravel and PHP Logging Integration"
description: "Send structured logs from Laravel applications to LogTide with zero-config auto-discovery, middleware, log channel, and breadcrumb integrations."
category: "framework"
difficulty: "easy"
sdk: "php"
brandIcon: "simple-icons:laravel"
highlights:
  - "Zero-config auto-discovery"
  - "Automatic middleware"
  - "Custom log channel"
  - "Breadcrumb integrations"
relatedIntegrations:
  - "php"
  - "docker"
  - "nginx"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "laravel logging"
  - "php logging"
  - "laravel monolog"
  - "laravel structured logging"
  - "php structured logs"
---

The LogTide Laravel package provides a drop-in integration for Laravel 10, 11, and 12 with zero-configuration needed. It auto-registers middleware, a log channel, a Facade, and breadcrumb integrations for database queries, cache events, and queue jobs.

## Why use LogTide with Laravel?

- **Zero-config**: Auto-discovery registers the service provider and facade automatically
- **Automatic middleware**: Request tracing with distributed tracing (W3C traceparent) out of the box
- **Log channel**: Use Laravel's standard `Log::info()` to send logs to LogTide
- **Breadcrumbs**: Automatic breadcrumbs for DB queries, cache events, and queue jobs
- **Scoped context**: Per-request isolation with the Hub/Scope architecture
- **GDPR compliance**: Self-hosted option for EU data residency

## Prerequisites

- PHP 8.1+
- Laravel 10.x, 11.x, or 12.x
- Composer
- LogTide instance with DSN

## Installation

```bash
composer require logtide/logtide-laravel
```

The service provider and facade are registered automatically via Laravel's package auto-discovery.

Publish the configuration:

```bash
php artisan vendor:publish --tag=logtide-config
```

## Configuration

### Environment Variables

Add to your `.env` file:

```env
LOGTIDE_DSN=https://lp_your_key@api.logtide.dev
```

That's it! The SDK is now active with sensible defaults.

Optional environment variables:

```env
LOGTIDE_SERVICE=my-laravel-app        # default: APP_NAME
LOGTIDE_ENVIRONMENT=production         # default: APP_ENV
LOGTIDE_RELEASE=1.2.3
LOGTIDE_TRACES_SAMPLE_RATE=1.0
LOGTIDE_DEBUG=false
```

### config/logtide.php

```php
<?php

return [
    'dsn' => env('LOGTIDE_DSN'),

    'service' => env('LOGTIDE_SERVICE', env('APP_NAME', 'laravel')),
    'environment' => env('LOGTIDE_ENVIRONMENT', env('APP_ENV', 'production')),
    'release' => env('LOGTIDE_RELEASE'),

    // Batching
    'batch_size' => (int) env('LOGTIDE_BATCH_SIZE', 100),
    'flush_interval' => (int) env('LOGTIDE_FLUSH_INTERVAL', 5000),
    'max_buffer_size' => (int) env('LOGTIDE_MAX_BUFFER_SIZE', 10000),
    'max_retries' => (int) env('LOGTIDE_MAX_RETRIES', 3),

    // Tracing
    'traces_sample_rate' => (float) env('LOGTIDE_TRACES_SAMPLE_RATE', 1.0),

    // Privacy
    'send_default_pii' => (bool) env('LOGTIDE_SEND_DEFAULT_PII', false),

    // Breadcrumb integrations
    'breadcrumbs' => [
        'db_queries' => true,
        'cache' => true,
        'queue' => true,
        'http_client' => true,
    ],

    // Paths to skip in the HTTP middleware
    'skip_paths' => ['/health', '/healthz'],

    'debug' => (bool) env('LOGTIDE_DEBUG', false),
];
```

### config/logging.php

Add the LogTide channel to your logging stack:

```php
<?php

return [
    'default' => env('LOG_CHANNEL', 'stack'),

    'channels' => [
        'stack' => [
            'driver' => 'stack',
            'channels' => ['daily', 'logtide'],
            'ignore_exceptions' => false,
        ],

        // The 'logtide' channel is auto-registered by the service provider.
        // No manual configuration needed.

        // ... other channels
    ],
];
```

## Basic Usage

### Using the Logger

```php
use Illuminate\Support\Facades\Log;

// Simple messages
Log::info('User logged in');
Log::warning('Rate limit approaching');
Log::error('Payment failed');

// With structured context
Log::info('Order placed', [
    'order_id' => $order->id,
    'amount' => $order->total,
    'currency' => $order->currency,
    'user_id' => $order->user_id,
]);

// With exception
try {
    $this->processPayment($order);
} catch (PaymentException $e) {
    Log::error('Payment processing failed', [
        'order_id' => $order->id,
        'exception' => $e,
    ]);
}
```

### Using the Facade

```php
use LogTide\Laravel\LogtideFacade as Logtide;
use LogTide\Enum\LogLevel;

// Direct Hub API access
Logtide::captureLog(LogLevel::INFO, 'Custom event', ['key' => 'value']);

// Capture exceptions
Logtide::captureException($exception);

// Scoped context
Logtide::withScope(function () {
    Logtide::getScope()->setTag('handler', 'checkout');
    Logtide::captureLog(LogLevel::INFO, 'Checkout started');
});

// Tracing
$span = Logtide::startSpan('process.order');
// ... do work ...
if ($span !== null) {
    Logtide::finishSpan($span);
}

// Flush
Logtide::flush();
```

## Request Middleware

The HTTP middleware is **automatically registered** by the service provider. For each request it:

- Creates an isolated scope (tags and breadcrumbs don't leak between requests)
- Extracts incoming `traceparent` header for distributed tracing
- Starts a SERVER span with HTTP attributes (method, URL, user agent)
- Captures 5xx responses as error log events
- Catches and reports uncaught exceptions
- Injects `traceparent` into the response for trace correlation

Paths listed in `config('logtide.skip_paths')` are skipped (default: `/health`, `/healthz`).

## Breadcrumb Integrations

The service provider automatically registers breadcrumb integrations:

- **Database Queries** — Records `QueryExecuted` events with query, bindings, and duration
- **Cache Events** — Records cache hits, misses, writes, and deletes
- **Queue Jobs** — Records job processing events with job class, queue name, and attempt

Toggle them in `config/logtide.php` under the `breadcrumbs` key.

## Queue Job Logging

Jobs automatically have access to LogTide:

```php
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

class ProcessOrder implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Order $order
    ) {}

    public function handle()
    {
        Log::info('Processing order in background', [
            'order_id' => $this->order->id,
        ]);

        // Process order...

        Log::info('Order processed successfully');
    }
}
```

## Docker Deployment

```yaml
# docker-compose.yml
services:
  app:
    build: .
    environment:
      - APP_ENV=production
      - LOGTIDE_DSN=${LOGTIDE_DSN}
    depends_on:
      - mysql
      - redis

  queue:
    build: .
    command: php artisan queue:work --tries=3
    environment:
      - APP_ENV=production
      - LOGTIDE_DSN=${LOGTIDE_DSN}
    depends_on:
      - mysql
      - redis

  scheduler:
    build: .
    command: php artisan schedule:work
    environment:
      - APP_ENV=production
      - LOGTIDE_DSN=${LOGTIDE_DSN}
```

## Troubleshooting

### Logs not appearing

1. Check DSN is set:
   ```bash
   php artisan tinker --execute="dump(config('logtide.dsn'));"
   ```

2. Enable debug mode:
   ```env
   LOGTIDE_DEBUG=true
   ```

3. Check Laravel logs for errors:
   ```bash
   tail -f storage/logs/laravel.log
   ```

### Queue logs not appearing

Queue workers need the same environment variables:

```bash
LOGTIDE_DSN=xxx php artisan queue:work
```

## Next Steps

- [PHP SDK Reference](/docs/sdks/php) - Core SDK documentation
- [Symfony Integration](/docs/sdks/symfony) - Symfony Bundle integration
- [nginx Integration](/integrations/nginx) - Web server logs
- [Docker Integration](/integrations/docker) - Container deployment
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy-compliant logging
