---
title: "PHP Logging Integration"
description: "Send structured logs from PHP applications to LogTide using the official SDK with Hub/Scope architecture, tracing, and Monolog handlers."
category: "language"
difficulty: "easy"
sdk: "php"
brandIcon: "simple-icons:php"
highlights:
  - "Hub/Scope architecture"
  - "Built-in Monolog handlers"
  - "W3C distributed tracing"
  - "Async batching"
relatedIntegrations:
  - "laravel"
  - "docker"
  - "nginx"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "php logging"
  - "php monolog"
  - "psr-3 logger"
  - "php structured logging"
  - "php observability"
  - "php logging best practices"
---

The LogTide PHP SDK provides structured logging for any PHP application, whether you're using a framework or plain PHP. With DSN-based configuration, Hub/Scope architecture, and built-in Monolog handlers, it fits naturally into your existing logging setup.

## Why send PHP logs to LogTide?

- **Hub/Scope architecture**: Per-request context isolation with tags, breadcrumbs, and user data
- **Built-in Monolog handlers**: Drop-in `LogtideHandler` and `BreadcrumbHandler` for existing Monolog setups
- **Distributed tracing**: W3C Trace Context (traceparent) propagation across services
- **Automatic batching**: Reduces network overhead by batching log entries
- **Zero framework lock-in**: Works with plain PHP, Laravel, Symfony, Slim, or WordPress
- **Privacy-first**: Self-hosted option keeps logs in your infrastructure

## Prerequisites

- PHP 8.1 or higher
- Composer for dependency management
- LogTide instance (self-hosted or cloud)
- DSN from your LogTide project settings

## Installation

Install the LogTide PHP SDK via Composer:

```bash
composer require logtide/logtide
```

For framework-specific integrations, install the corresponding package instead:

```bash
composer require logtide/logtide-laravel    # Laravel 10/11/12
composer require logtide/logtide-symfony    # Symfony 6.4/7.x
composer require logtide/logtide-slim       # Slim 4
composer require logtide/logtide-wordpress  # WordPress
```

## Quick Start (5 minutes)

### Basic Setup

The simplest way to start logging:

```php
<?php

require_once __DIR__ . '/vendor/autoload.php';

use function LogTide\{init, info, error, warn, debug, critical, flush};

// Initialize the SDK with your DSN
init([
    'dsn' => getenv('LOGTIDE_DSN') ?: 'https://lp_your_key@api.logtide.dev',
    'service' => 'my-php-app',
    'environment' => getenv('APP_ENV') ?: 'production',
]);

// Send logs at different levels
info('Application started', [
    'php_version' => PHP_VERSION,
    'environment' => getenv('APP_ENV') ?: 'production',
]);

debug('Processing request', ['uri' => $_SERVER['REQUEST_URI'] ?? '/']);
warn('High memory usage', ['memory_mb' => memory_get_usage(true) / 1024 / 1024]);
error('Failed to connect to external service', ['service' => 'payment-gateway']);

// Shutdown is auto-handled via register_shutdown_function
```

### Environment Variables

Store your credentials securely:

```bash
# .env
LOGTIDE_DSN=https://lp_your_key@api.logtide.dev
APP_ENV=production
```

Load with `vlucas/phpdotenv` or your framework's environment handling.

## Configuration Options

```php
<?php

use function LogTide\init;

init([
    // Required
    'dsn' => 'https://lp_your_key@api.logtide.dev',

    // Recommended
    'service' => 'my-php-app',
    'environment' => 'production',
    'release' => '1.2.3',

    // Batching
    'batch_size' => 100,              // Logs per batch (default: 100)
    'flush_interval' => 5000,         // Flush interval in ms (default: 5000)
    'max_buffer_size' => 10000,       // Max logs in buffer (default: 10000)

    // Reliability
    'max_retries' => 3,               // Retry attempts on failure (default: 3)
    'retry_delay_ms' => 1000,         // Initial retry delay in ms (default: 1000)
    'circuit_breaker_threshold' => 5, // Failures before circuit opens (default: 5)

    // Tracing
    'traces_sample_rate' => 1.0,      // 0.0-1.0, sample rate for traces

    // Debug
    'debug' => false,
]);
```

## Monolog Integration

The SDK includes built-in Monolog handlers. No separate package needed:

```php
<?php

use Monolog\Logger;
use Monolog\Level;
use LogTide\Monolog\LogtideHandler;
use LogTide\Monolog\BreadcrumbHandler;

// Initialize the SDK first
\LogTide\init(['dsn' => getenv('LOGTIDE_DSN')]);

$logger = new Logger('my-app');

// Low-level logs become breadcrumbs (trail of events)
$logger->pushHandler(new BreadcrumbHandler(Level::Debug));

// Important logs are sent as events to LogTide
$logger->pushHandler(new LogtideHandler(Level::Warning));

// Use standard Monolog methods
$logger->info('Cache hit', ['key' => 'user:123']);       // → breadcrumb
$logger->error('Payment failed', ['order_id' => 456]);   // → LogTide event
```

### Combining with Other Handlers

```php
<?php

use Monolog\Logger;
use Monolog\Handler\StreamHandler;
use Monolog\Handler\RotatingFileHandler;
use LogTide\Monolog\LogtideHandler;

$logger = new Logger('my-app');

// Local file logging (for debugging)
if (getenv('APP_ENV') === 'development') {
    $logger->pushHandler(new StreamHandler('php://stdout', Level::Debug));
}

// Rotating file for persistent local logs
$logger->pushHandler(new RotatingFileHandler(
    '/var/log/myapp/app.log',
    14, // Keep 14 days
    Level::Warning
));

// LogTide for centralized logging
$logger->pushHandler(new LogtideHandler(Level::Info));
```

## Scopes & Context

Track requests across your application with scoped context:

```php
<?php

use function LogTide\{withScope, configureScope, info, captureException};

// Set global context
configureScope(function (\LogTide\State\Scope $scope): void {
    $scope->setTag('region', 'eu-west-1');
    $scope->setUser(['id' => $_SESSION['user_id'] ?? null]);
});

// Isolated scope for a block of code
withScope(function () {
    \LogTide\LogtideSdk::getCurrentHub()->getScope()->setTag('handler', 'checkout');

    info('Processing order', ['order_id' => $orderId]);
    // This event includes the 'handler' tag
});

info('Back to global scope');
// This event does NOT include the 'handler' tag
```

## Distributed Tracing

Propagate trace context across services using W3C traceparent:

```php
<?php

use function LogTide\{continueTrace, getTraceparent, startSpan, finishSpan};

// Continue a trace from an incoming request
$traceparent = $_SERVER['HTTP_TRACEPARENT'] ?? '';
if (!empty($traceparent)) {
    continueTrace($traceparent);
}

// Create spans for operations
$span = startSpan('db.query', ['kind' => \LogTide\Enum\SpanKind::CLIENT]);
// ... do work ...
if ($span !== null) {
    finishSpan($span);
}

// Propagate to outgoing requests
$outgoingTraceparent = getTraceparent();
```

## Docker Setup

### PHP-FPM Container

```dockerfile
# Dockerfile
FROM php:8.3-fpm-alpine

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Install dependencies
WORKDIR /var/www/html
COPY composer.json composer.lock ./
RUN composer install --no-dev --optimize-autoloader

# Copy application
COPY . .

EXPOSE 9000
CMD ["php-fpm"]
```

### Docker Compose with nginx

```yaml
# docker-compose.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./public:/var/www/html/public:ro
    depends_on:
      - php

  php:
    build: .
    environment:
      - LOGTIDE_DSN=${LOGTIDE_DSN}
      - APP_ENV=production
    volumes:
      - ./:/var/www/html
```

## Verification

Check logs are arriving in LogTide:

```php
<?php
// test-logging.php
require_once __DIR__ . '/vendor/autoload.php';

\LogTide\init([
    'dsn' => getenv('LOGTIDE_DSN'),
    'service' => 'test',
]);

\LogTide\info('Test log from PHP', [
    'timestamp' => date('c'),
    'php_version' => PHP_VERSION,
    'test' => true,
]);

\LogTide\flush();

echo "Log sent! Check LogTide dashboard.\n";
```

Run:

```bash
LOGTIDE_DSN=https://lp_your_key@api.logtide.dev php test-logging.php
```

## Troubleshooting

### Logs not appearing in LogTide

1. **Check DSN:**
```php
\LogTide\init(['dsn' => '...', 'debug' => true]);
// Look for error messages in stdout
```

2. **Verify network connectivity:**
```bash
curl -I https://api.logtide.dev/health
```

3. **Flush is automatic** &mdash; the SDK registers a shutdown function. For long-running processes, call `\LogTide\flush()` manually.

### Memory issues with high volume

Reduce buffer size:

```php
\LogTide\init([
    'dsn' => '...',
    'batch_size' => 50,
    'max_buffer_size' => 5000,
]);
```

## Next Steps

- **[Laravel Integration](/docs/sdks/laravel/)** - Auto-discovery, Facade, log channel, breadcrumbs
- **[Symfony Integration](/docs/sdks/symfony/)** - Bundle with semantic config and event subscribers
- **[Slim Integration](/docs/sdks/slim/)** - PSR-15 middleware for Slim 4
- **[WordPress Integration](/docs/sdks/wordpress/)** - WordPress hooks and database monitoring
- **[Docker Setup](/integrations/docker/)** - Container deployment best practices
- **[GDPR Compliance](/use-cases/gdpr-compliance/)** - Privacy-first logging implementation
