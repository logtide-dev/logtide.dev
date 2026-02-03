---
title: "PHP Logging Integration"
description: "Send structured logs from PHP applications to LogTide using PSR-3 compliant logging with Monolog handlers."
category: "language"
difficulty: "easy"
sdk: "php"
brandIcon: "simple-icons:php"
highlights:
  - "PSR-3 compliant"
  - "Monolog integration"
  - "No framework required"
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

The LogTide PHP SDK provides structured logging for any PHP application, whether you're using a framework or plain PHP. With PSR-3 compliance and Monolog integration, it fits naturally into your existing logging setup.

## Why send PHP logs to LogTide?

- **PSR-3 compliant**: Works with any PSR-3 compatible logger
- **Monolog handler**: Drop-in handler for existing Monolog setups
- **Automatic batching**: Reduces network overhead by batching log entries
- **Zero framework lock-in**: Works with plain PHP, Laravel, Symfony, or any framework
- **Request correlation**: Track requests across your entire application
- **Privacy-first**: Self-hosted option keeps logs in your infrastructure

## Prerequisites

- PHP 8.1 or higher
- Composer for dependency management
- LogTide instance (self-hosted or cloud)
- API key from your LogTide project

## Installation

Install the LogTide PHP SDK via Composer:

```bash
composer require logtide-dev/sdk-php
```

## Quick Start (5 minutes)

### Basic Setup

The simplest way to start logging:

```php
<?php

require_once __DIR__ . '/vendor/autoload.php';

use LogTide\Client;
use LogTide\LogLevel;

// Initialize the client
$logtide = new Client([
    'apiUrl' => getenv('LOGTIDE_API_URL') ?: 'https://api.logtide.dev',
    'apiKey' => getenv('LOGTIDE_API_KEY'),
]);

// Send logs at different levels
$logtide->info('Application started', [
    'php_version' => PHP_VERSION,
    'environment' => getenv('APP_ENV') ?: 'production',
]);

$logtide->debug('Processing request', ['uri' => $_SERVER['REQUEST_URI'] ?? '/']);
$logtide->warning('High memory usage', ['memory_mb' => memory_get_usage(true) / 1024 / 1024]);
$logtide->error('Failed to connect to external service', ['service' => 'payment-gateway']);

// Flush remaining logs on shutdown
register_shutdown_function(function() use ($logtide) {
    $logtide->flush();
});
```

### Environment Variables

Store your credentials securely:

```bash
# .env
LOGTIDE_API_URL=https://api.logtide.dev
LOGTIDE_API_KEY=your-project-api-key
APP_ENV=production
```

Load with `vlucas/phpdotenv` or your framework's environment handling.

## Configuration Options

```php
<?php

use LogTide\Client;

$logtide = new Client([
    // Required
    'apiUrl' => 'https://api.logtide.dev',
    'apiKey' => 'your-api-key',

    // Optional settings
    'batchSize' => 50,           // Logs per batch (default: 50)
    'flushInterval' => 5000,     // Auto-flush interval in ms (default: 5000)
    'timeout' => 3,              // HTTP timeout in seconds (default: 3)
    'retries' => 3,              // Retry attempts on failure (default: 3)
    'debug' => false,            // Enable debug output (default: false)

    // Default context added to all logs
    'defaultContext' => [
        'service' => 'my-php-app',
        'version' => '1.2.3',
        'hostname' => gethostname(),
    ],
]);
```

## Monolog Integration

If you already use Monolog, add LogTide as a handler:

### Installation

```bash
composer require logtide-dev/monolog-handler
```

### Configuration

```php
<?php

use Monolog\Logger;
use Monolog\Level;
use LogTide\Monolog\LogTideHandler;

// Create the handler
$handler = new LogTideHandler(
    apiUrl: getenv('LOGTIDE_API_URL'),
    apiKey: getenv('LOGTIDE_API_KEY'),
    level: Level::Debug, // Minimum log level
    bubble: true,
);

// Create or use existing logger
$logger = new Logger('my-app');
$logger->pushHandler($handler);

// Use standard Monolog methods
$logger->info('User logged in', ['user_id' => $userId]);
$logger->error('Payment failed', [
    'order_id' => $orderId,
    'error' => $exception->getMessage(),
]);
```

### Combining with Other Handlers

```php
<?php

use Monolog\Logger;
use Monolog\Handler\StreamHandler;
use Monolog\Handler\RotatingFileHandler;
use LogTide\Monolog\LogTideHandler;

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
$logger->pushHandler(new LogTideHandler(
    apiUrl: getenv('LOGTIDE_API_URL'),
    apiKey: getenv('LOGTIDE_API_KEY'),
    level: Level::Info,
));
```

## Request Correlation

Track requests across your application with trace IDs:

```php
<?php

use LogTide\Client;
use LogTide\Context;

$logtide = new Client([/* config */]);

// Generate or use existing trace ID
$traceId = $_SERVER['HTTP_X_TRACE_ID'] ?? bin2hex(random_bytes(16));

// Set context for all subsequent logs
Context::set([
    'trace_id' => $traceId,
    'request_id' => uniqid('req_', true),
    'user_id' => $_SESSION['user_id'] ?? null,
]);

// All logs now include trace context
$logtide->info('Processing order', ['order_id' => $orderId]);
// => {"trace_id": "abc123...", "request_id": "req_...", "order_id": "..."}
```

### Middleware Example

For custom middleware (works with any framework):

```php
<?php

function loggingMiddleware(callable $handler): callable
{
    return function($request) use ($handler) {
        $startTime = microtime(true);
        $traceId = $request->getHeader('X-Trace-ID')[0] ?? bin2hex(random_bytes(16));

        Context::set([
            'trace_id' => $traceId,
            'method' => $request->getMethod(),
            'uri' => $request->getUri()->getPath(),
        ]);

        global $logtide;
        $logtide->info('Request started');

        try {
            $response = $handler($request);

            $logtide->info('Request completed', [
                'status' => $response->getStatusCode(),
                'duration_ms' => (microtime(true) - $startTime) * 1000,
            ]);

            return $response->withHeader('X-Trace-ID', $traceId);
        } catch (Throwable $e) {
            $logtide->error('Request failed', [
                'error' => $e->getMessage(),
                'duration_ms' => (microtime(true) - $startTime) * 1000,
            ]);
            throw $e;
        }
    };
}
```

## Error and Exception Handling

Capture all PHP errors and exceptions:

```php
<?php

use LogTide\Client;

$logtide = new Client([/* config */]);

// Handle PHP errors
set_error_handler(function($severity, $message, $file, $line) use ($logtide) {
    $logtide->error('PHP Error', [
        'severity' => $severity,
        'message' => $message,
        'file' => $file,
        'line' => $line,
    ]);

    // Return false to let PHP handle the error as well
    return false;
});

// Handle uncaught exceptions
set_exception_handler(function(Throwable $e) use ($logtide) {
    $logtide->critical('Uncaught exception', [
        'exception' => get_class($e),
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString(),
    ]);

    // Flush before process ends
    $logtide->flush();
});

// Handle fatal errors
register_shutdown_function(function() use ($logtide) {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        $logtide->critical('Fatal error', [
            'type' => $error['type'],
            'message' => $error['message'],
            'file' => $error['file'],
            'line' => $error['line'],
        ]);
    }
    $logtide->flush();
});
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

# Configure PHP-FPM
COPY docker/php-fpm.conf /usr/local/etc/php-fpm.d/www.conf

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
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
      - APP_ENV=production
    volumes:
      - ./:/var/www/html
```

### nginx Configuration

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        root /var/www/html/public;
        index index.php;

        location / {
            try_files $uri $uri/ /index.php?$query_string;
        }

        location ~ \.php$ {
            fastcgi_pass php:9000;
            fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
            include fastcgi_params;

            # Pass trace ID to PHP
            fastcgi_param HTTP_X_TRACE_ID $request_id;
        }
    }
}
```

## Production Deployment

### systemd Service

For standalone PHP applications:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My PHP Application
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/myapp
ExecStart=/usr/bin/php /var/www/myapp/server.php
Restart=always
RestartSec=5

# Environment
Environment=APP_ENV=production
EnvironmentFile=/var/www/myapp/.env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable myapp
sudo systemctl start myapp
sudo systemctl status myapp
```

## Verification

Check logs are arriving in LogTide:

```php
<?php
// test-logging.php
require_once __DIR__ . '/vendor/autoload.php';

use LogTide\Client;

$logtide = new Client([
    'apiUrl' => getenv('LOGTIDE_API_URL'),
    'apiKey' => getenv('LOGTIDE_API_KEY'),
]);

$logtide->info('Test log from PHP', [
    'timestamp' => date('c'),
    'php_version' => PHP_VERSION,
    'test' => true,
]);

$logtide->flush();

echo "Log sent! Check LogTide dashboard.\n";
```

Run:

```bash
LOGTIDE_API_URL=https://api.logtide.dev LOGTIDE_API_KEY=your-key php test-logging.php
```

**Expected output in LogTide:**
```json
{
  "level": "info",
  "message": "Test log from PHP",
  "timestamp": "2025-02-03T10:00:00+00:00",
  "php_version": "8.3.0",
  "test": true
}
```

## Performance Impact

Measurements from production PHP application (Laravel):

| Metric | Without LogTide | With LogTide | Overhead |
|--------|-----------------|--------------|----------|
| Avg response time | 45ms | 46ms | +2.2% |
| Memory per request | 12MB | 12.5MB | +4.2% |
| P99 latency | 120ms | 125ms | +4.2% |
| CPU usage | 15% | 15.5% | +3.3% |

**Notes:**
- Batching reduces network overhead significantly
- Async flush prevents blocking on HTTP calls
- Memory overhead is constant regardless of log volume

## Troubleshooting

### Logs not appearing in LogTide

1. **Check API credentials:**
```php
$logtide = new Client(['debug' => true, /* ... */]);
// Look for error messages in stdout
```

2. **Verify network connectivity:**
```bash
curl -I https://api.logtide.dev/health
```

3. **Ensure flush is called:**
```php
// Always flush before script ends
register_shutdown_function(fn() => $logtide->flush());
```

### Memory issues with high volume

Reduce batch size and flush more frequently:

```php
$logtide = new Client([
    'batchSize' => 20,      // Smaller batches
    'flushInterval' => 2000, // Flush every 2 seconds
    /* ... */
]);
```

### SSL certificate errors

For self-hosted LogTide with self-signed certificates:

```php
$logtide = new Client([
    'verifySsl' => false, // Not recommended for production
    /* ... */
]);
```

Better: Add your CA certificate to the system trust store.

## Privacy Considerations

When logging in GDPR-regulated environments:

```php
<?php

use LogTide\Client;

// Create a privacy-aware logger
function sanitizeContext(array $context): array
{
    $sensitiveKeys = ['email', 'ip', 'password', 'credit_card', 'ssn'];

    foreach ($sensitiveKeys as $key) {
        if (isset($context[$key])) {
            $context[$key] = '[REDACTED]';
        }
    }

    // Hash user identifiers
    if (isset($context['user_id'])) {
        $context['user_id_hash'] = hash('sha256', $context['user_id']);
        unset($context['user_id']);
    }

    return $context;
}

$logtide->info('User action', sanitizeContext([
    'user_id' => '12345',
    'email' => 'user@example.com',
    'action' => 'purchase',
]));
// Logs: {"user_id_hash": "abc...", "email": "[REDACTED]", "action": "purchase"}
```

See our [GDPR compliance guide](/use-cases/gdpr-compliance) for complete implementation.

## Next Steps

- **[Laravel Integration](/integrations/laravel)** - Full Laravel framework integration with Facades and helpers
- **[Docker Setup](/integrations/docker)** - Container deployment best practices
- **[nginx Integration](/integrations/nginx)** - Combine PHP-FPM with nginx access logs
- **[GDPR Compliance](/use-cases/gdpr-compliance)** - Privacy-first logging implementation
