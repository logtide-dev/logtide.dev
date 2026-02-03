---
title: "Laravel and PHP Logging Integration"
description: "Send structured logs from Laravel applications to LogTide using custom Monolog handlers and middleware."
category: "framework"
difficulty: "easy"
sdk: "php"
brandIcon: "simple-icons:laravel"
highlights:
  - "Custom Monolog channel"
  - "Request middleware"
  - "Queue job logging"
  - "Exception tracking"
relatedIntegrations:
  - "php"
  - "docker"
  - "nginx"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "laravel logging"
  - "php logging"
  - "monolog postgresql"
  - "laravel structured logging"
  - "php structured logs"
---

Laravel's logging system is built on Monolog, making it easy to add custom handlers. This guide shows you how to ship Laravel logs to LogTide with structured metadata, request context, and exception tracking.

## Why use LogTide with Laravel?

- **Structured logging**: JSON logs with full context, not just strings
- **Request correlation**: Track logs across the entire request lifecycle
- **Queue visibility**: See logs from background jobs alongside web requests
- **Exception tracking**: Automatic stack trace parsing and error grouping
- **GDPR compliance**: Self-hosted option for EU data residency

## Prerequisites

- PHP 8.1+
- Laravel 10.x or 11.x
- Composer
- LogTide instance with API key

## Installation

```bash
composer require logtide/laravel-sdk
```

Publish the configuration:

```bash
php artisan vendor:publish --tag=logtide-config
```

## Configuration

### Environment Variables

Add to your `.env` file:

```env
LOGTIDE_API_URL=https://api.logtide.dev
LOGTIDE_API_KEY=your-project-api-key
LOGTIDE_ENABLED=true
```

### config/logtide.php

```php
<?php

return [
    'enabled' => env('LOGTIDE_ENABLED', true),
    'api_url' => env('LOGTIDE_API_URL'),
    'api_key' => env('LOGTIDE_API_KEY'),

    // Batching configuration
    'batch_size' => 100,
    'flush_interval' => 5, // seconds

    // Default metadata added to all logs
    'metadata' => [
        'environment' => env('APP_ENV', 'production'),
        'app_name' => env('APP_NAME', 'Laravel'),
        'version' => env('APP_VERSION', '1.0.0'),
    ],

    // Request logging
    'log_requests' => true,
    'log_request_body' => false, // Be careful with sensitive data
    'log_response_body' => false,
    'skip_paths' => [
        'health',
        'ready',
        'metrics',
        '_debugbar/*',
    ],

    // Sensitive fields to redact
    'redact_fields' => [
        'password',
        'password_confirmation',
        'token',
        'api_key',
        'secret',
        'credit_card',
        'cvv',
    ],
];
```

### config/logging.php

Add the LogTide channel to your logging configuration:

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

        'logtide' => [
            'driver' => 'custom',
            'via' => \LogTide\Laravel\LogTideLoggerFactory::class,
            'level' => env('LOG_LEVEL', 'debug'),
        ],

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
use LogTide\Laravel\Facades\LogTide;

// Direct API access
LogTide::info('Custom event', ['key' => 'value']);

// With specific service name
LogTide::service('payment-processor')->info('Processing payment');

// Flush immediately (useful before long operations)
LogTide::flush();
```

## Request Logging Middleware

### Register Middleware

In `app/Http/Kernel.php` (Laravel 10) or `bootstrap/app.php` (Laravel 11):

```php
// Laravel 10
protected $middleware = [
    \LogTide\Laravel\Http\Middleware\LogRequests::class,
    // ... other middleware
];

// Laravel 11
->withMiddleware(function (Middleware $middleware) {
    $middleware->prepend(\LogTide\Laravel\Http\Middleware\LogRequests::class);
})
```

### What Gets Logged

Each request automatically logs:

```json
{
  "level": "info",
  "message": "HTTP GET /api/users/123",
  "service": "laravel",
  "metadata": {
    "method": "GET",
    "path": "/api/users/123",
    "status_code": 200,
    "duration_ms": 45,
    "client_ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "user_id": 456,
    "request_id": "abc123-def456"
  }
}
```

### Custom Request Context

Add custom context to request logs:

```php
use LogTide\Laravel\Facades\LogTide;

class OrderController extends Controller
{
    public function store(Request $request)
    {
        // Add context that will be included in all logs for this request
        LogTide::addContext([
            'order_id' => $order->id,
            'customer_tier' => $request->user()->tier,
        ]);

        // All subsequent logs include this context
        Log::info('Processing order');

        // ...
    }
}
```

## Queue Job Logging

### Automatic Job Logging

Jobs are automatically logged with context:

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

Produces logs with job context:

```json
{
  "level": "info",
  "message": "Processing order in background",
  "metadata": {
    "job_class": "App\\Jobs\\ProcessOrder",
    "job_id": "abc123",
    "queue": "orders",
    "attempt": 1,
    "order_id": 456
  }
}
```

### Failed Job Logging

Failed jobs are automatically logged with full exception details:

```php
public function failed(\Throwable $exception)
{
    // Automatically logged by LogTide with:
    // - Exception message and stack trace
    // - Job payload
    // - Attempt count
    // - Queue name
}
```

## Exception Handling

### Global Exception Logging

In `app/Exceptions/Handler.php`:

```php
use LogTide\Laravel\Facades\LogTide;

public function register()
{
    $this->reportable(function (Throwable $e) {
        LogTide::exception($e, [
            'url' => request()->fullUrl(),
            'user_id' => auth()->id(),
        ]);
    });
}
```

### Structured Exception Data

Exceptions are automatically parsed:

```json
{
  "level": "error",
  "message": "Payment processing failed",
  "metadata": {
    "exception": {
      "class": "App\\Exceptions\\PaymentException",
      "message": "Insufficient funds",
      "code": 402,
      "file": "/app/Services/PaymentService.php",
      "line": 45,
      "trace": [
        {"file": "PaymentService.php", "line": 45, "function": "charge"},
        {"file": "OrderController.php", "line": 23, "function": "processPayment"}
      ]
    }
  }
}
```

## User Context

### Automatic User Tracking

```php
// config/logtide.php
'user_resolver' => function () {
    $user = auth()->user();
    if (!$user) return null;

    return [
        'id' => $user->id,
        'email_hash' => hash('sha256', $user->email), // Don't log raw emails
        'role' => $user->role,
    ];
},
```

## Sensitive Data Redaction

### Automatic Field Redaction

```php
// These fields are automatically redacted in request logs
Log::info('User registered', [
    'email' => $user->email,        // Logged as-is
    'password' => $password,         // Redacted to [REDACTED]
    'credit_card' => $cardNumber,    // Redacted to [REDACTED]
]);
```

### Custom Redaction

```php
use LogTide\Laravel\Facades\LogTide;

LogTide::addRedactedFields(['ssn', 'tax_id', 'bank_account']);
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM php:8.2-fpm-alpine

# Install extensions
RUN docker-php-ext-install pdo pdo_mysql opcache

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copy application
COPY . .

# Install dependencies
RUN composer install --no-dev --optimize-autoloader

# Cache configuration
RUN php artisan config:cache
RUN php artisan route:cache
RUN php artisan view:cache

# Set permissions
RUN chown -R www-data:www-data storage bootstrap/cache

EXPOSE 9000
CMD ["php-fpm"]
```

### docker-compose.yml

```yaml
version: "3.8"

services:
  app:
    build: .
    environment:
      - APP_ENV=production
      - LOGTIDE_API_URL=https://api.logtide.dev
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    volumes:
      - ./storage:/var/www/html/storage
    depends_on:
      - mysql
      - redis

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./public:/var/www/html/public:ro
    depends_on:
      - app

  queue:
    build: .
    command: php artisan queue:work --tries=3
    environment:
      - APP_ENV=production
      - LOGTIDE_API_URL=https://api.logtide.dev
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    depends_on:
      - mysql
      - redis

  scheduler:
    build: .
    command: php artisan schedule:work
    environment:
      - APP_ENV=production
      - LOGTIDE_API_URL=https://api.logtide.dev
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
```

## Artisan Commands

### Test Connection

```bash
php artisan logtide:test
```

### Flush Logs

```bash
php artisan logtide:flush
```

### Check Status

```bash
php artisan logtide:status
```

## Performance

| Metric | Value |
|--------|-------|
| Memory overhead | ~5MB |
| Latency (batched) | <1ms per log |
| Network calls | 1 per batch (100 logs) |
| Queue job overhead | ~2ms |

## Detection Rules

Create alerts for Laravel-specific issues:

### High Error Rate

```
service:laravel AND level:error
```

### Slow Requests

```
service:laravel AND duration_ms:>3000
```

### Failed Jobs

```
service:laravel AND job_class:* AND level:error
```

### Authentication Failures

```
service:laravel AND message:"authentication failed"
```

## Troubleshooting

### Logs not appearing

1. Check configuration:
   ```bash
   php artisan config:show logtide
   ```

2. Test connection:
   ```bash
   php artisan logtide:test
   ```

3. Check Laravel logs for errors:
   ```bash
   tail -f storage/logs/laravel.log
   ```

### Missing request context

Ensure middleware is registered first:

```php
$middleware->prepend(\LogTide\Laravel\Http\Middleware\LogRequests::class);
```

### Queue logs not appearing

Queue workers need the same environment variables:

```bash
LOGTIDE_API_KEY=xxx php artisan queue:work
```

## Next Steps

- [nginx Integration](/integrations/nginx) - Web server logs
- [Docker Integration](/integrations/docker) - Container deployment
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy-compliant logging
