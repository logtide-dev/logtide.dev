---
title: "Go and Gin Framework Logging Integration"
description: "Send structured logs from Go applications to LogTide using slog, zerolog, or zap with Gin middleware support."
category: "language"
difficulty: "medium"
sdk: "go"
brandIcon: "simple-icons:go"
highlights:
  - "slog integration (Go 1.21+)"
  - "Gin middleware"
  - "Zero-allocation logging"
  - "Context propagation"
relatedIntegrations:
  - "docker"
  - "kubernetes"
relatedUseCases: []
keywords:
  - "golang logging"
  - "go slog"
  - "gin logging middleware"
  - "zerolog"
  - "zap logging"
  - "go structured logging"
---

Go's standard library now includes `slog` for structured logging. This guide shows you how to integrate Go applications with LogTide using slog, zerolog, or zap, with Gin middleware for HTTP request logging.

## Why use LogTide with Go?

- **Zero-allocation**: LogTide's Go SDK uses zero-allocation patterns for high performance
- **slog native**: First-class support for Go 1.21+ slog
- **Context propagation**: Trace requests across goroutines
- **Async batching**: Non-blocking log shipping
- **Type safety**: Strongly typed log fields

## Prerequisites

- Go 1.21+ (for slog) or Go 1.18+ (for zerolog/zap)
- LogTide instance with API key

## Installation

```bash
go get github.com/logtide/logtide-go
```

## Quick Start with slog

### Basic Setup

```go
package main

import (
    "context"
    "log/slog"
    "os"

    "github.com/logtide/logtide-go"
)

func main() {
    // Create LogTide handler
    handler, err := logtide.NewHandler(logtide.Config{
        APIURL: os.Getenv("LOGTIDE_API_URL"),
        APIKey: os.Getenv("LOGTIDE_API_KEY"),
        Service: "my-service",
        Environment: os.Getenv("ENVIRONMENT"),
    })
    if err != nil {
        panic(err)
    }
    defer handler.Close()

    // Set as default logger
    logger := slog.New(handler)
    slog.SetDefault(logger)

    // Log with structured data
    slog.Info("Application started",
        slog.String("version", "1.0.0"),
        slog.Int("port", 8080),
    )

    slog.Error("Failed to connect",
        slog.String("host", "db.example.com"),
        slog.Any("error", err),
    )
}
```

### Configuration Options

```go
handler, err := logtide.NewHandler(logtide.Config{
    // Required
    APIURL: os.Getenv("LOGTIDE_API_URL"),
    APIKey: os.Getenv("LOGTIDE_API_KEY"),

    // Service identification
    Service:     "api-server",
    Environment: "production",
    Version:     "1.2.3",

    // Batching
    BatchSize:     100,           // Flush after N logs
    FlushInterval: 5 * time.Second,

    // Reliability
    MaxRetries:   3,
    RetryBackoff: time.Second,

    // Performance
    AsyncMode:  true,             // Non-blocking (recommended)
    BufferSize: 10000,            // Channel buffer size

    // Filtering
    MinLevel: slog.LevelInfo,     // Minimum log level
})
```

## Gin Middleware

### Setup

```go
package main

import (
    "log/slog"
    "net/http"
    "os"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/logtide/logtide-go"
    "github.com/logtide/logtide-go/ginlog"
)

func main() {
    // Initialize LogTide
    handler, _ := logtide.NewHandler(logtide.Config{
        APIURL:  os.Getenv("LOGTIDE_API_URL"),
        APIKey:  os.Getenv("LOGTIDE_API_KEY"),
        Service: "api",
    })
    defer handler.Close()

    logger := slog.New(handler)
    slog.SetDefault(logger)

    // Create Gin router
    r := gin.New()

    // Add LogTide middleware
    r.Use(ginlog.Middleware(ginlog.Config{
        Logger:          logger,
        SkipPaths:       []string{"/health", "/ready", "/metrics"},
        LogRequestBody:  false,
        LogResponseBody: false,
    }))

    // Recovery middleware with logging
    r.Use(ginlog.Recovery(logger))

    // Routes
    r.GET("/users/:id", getUser)
    r.POST("/orders", createOrder)

    r.Run(":8080")
}
```

### Request Logging Output

```json
{
  "time": "2025-01-31T10:00:00.000Z",
  "level": "INFO",
  "msg": "HTTP GET /users/123",
  "service": "api",
  "method": "GET",
  "path": "/users/123",
  "status": 200,
  "latency_ms": 12,
  "client_ip": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "request_id": "abc123",
  "bytes_out": 256
}
```

### Request Context

Access the logger with request context:

```go
func getUser(c *gin.Context) {
    // Get logger with request context
    logger := ginlog.Logger(c)

    userID := c.Param("id")

    logger.Info("Fetching user",
        slog.String("user_id", userID),
    )

    user, err := db.GetUser(userID)
    if err != nil {
        logger.Error("Failed to fetch user",
            slog.String("user_id", userID),
            slog.Any("error", err),
        )
        c.JSON(500, gin.H{"error": "internal error"})
        return
    }

    logger.Info("User fetched successfully",
        slog.String("user_id", userID),
        slog.String("email", user.Email),
    )

    c.JSON(200, user)
}
```

## Zerolog Integration

For projects using zerolog:

```go
package main

import (
    "os"
    "time"

    "github.com/rs/zerolog"
    "github.com/rs/zerolog/log"
    "github.com/logtide/logtide-go/zerolog"
)

func main() {
    // Create LogTide writer
    writer, err := logtidezerolog.NewWriter(logtidezerolog.Config{
        APIURL:  os.Getenv("LOGTIDE_API_URL"),
        APIKey:  os.Getenv("LOGTIDE_API_KEY"),
        Service: "my-service",
    })
    if err != nil {
        panic(err)
    }
    defer writer.Close()

    // Configure zerolog
    log.Logger = zerolog.New(writer).
        With().
        Timestamp().
        Str("environment", os.Getenv("ENVIRONMENT")).
        Logger()

    // Use zerolog as normal
    log.Info().
        Str("user_id", "123").
        Msg("User logged in")

    log.Error().
        Err(err).
        Str("order_id", "456").
        Msg("Payment failed")
}
```

## Zap Integration

For projects using zap:

```go
package main

import (
    "os"

    "go.uber.org/zap"
    "go.uber.org/zap/zapcore"
    "github.com/logtide/logtide-go/zaplog"
)

func main() {
    // Create LogTide core
    core, err := zaplog.NewCore(zaplog.Config{
        APIURL:  os.Getenv("LOGTIDE_API_URL"),
        APIKey:  os.Getenv("LOGTIDE_API_KEY"),
        Service: "my-service",
    })
    if err != nil {
        panic(err)
    }

    // Create logger with LogTide core
    logger := zap.New(core,
        zap.AddCaller(),
        zap.AddStacktrace(zapcore.ErrorLevel),
    )
    defer logger.Sync()

    // Use zap as normal
    logger.Info("Application started",
        zap.String("version", "1.0.0"),
        zap.Int("port", 8080),
    )

    logger.Error("Database connection failed",
        zap.Error(err),
        zap.String("host", "db.example.com"),
    )
}
```

## Context Propagation

### Adding Context to Requests

```go
package main

import (
    "context"
    "log/slog"
)

// Context key for request-scoped logger
type loggerKey struct{}

// WithLogger adds a logger to the context
func WithLogger(ctx context.Context, logger *slog.Logger) context.Context {
    return context.WithValue(ctx, loggerKey{}, logger)
}

// LoggerFromContext retrieves the logger from context
func LoggerFromContext(ctx context.Context) *slog.Logger {
    if logger, ok := ctx.Value(loggerKey{}).(*slog.Logger); ok {
        return logger
    }
    return slog.Default()
}

// Middleware that adds request context
func RequestContextMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        requestID := c.GetHeader("X-Request-ID")
        if requestID == "" {
            requestID = uuid.New().String()
        }

        // Create logger with request context
        logger := slog.Default().With(
            slog.String("request_id", requestID),
            slog.String("path", c.Request.URL.Path),
            slog.String("method", c.Request.Method),
        )

        // Add to context
        ctx := WithLogger(c.Request.Context(), logger)
        c.Request = c.Request.WithContext(ctx)

        // Set response header
        c.Header("X-Request-ID", requestID)

        c.Next()
    }
}
```

### Using in Services

```go
type UserService struct{}

func (s *UserService) GetUser(ctx context.Context, id string) (*User, error) {
    logger := LoggerFromContext(ctx)

    logger.Info("Fetching user from database", slog.String("id", id))

    user, err := db.GetUser(ctx, id)
    if err != nil {
        logger.Error("Database query failed",
            slog.String("id", id),
            slog.Any("error", err),
        )
        return nil, err
    }

    logger.Info("User fetched", slog.String("id", id))
    return user, nil
}
```

## Error Handling

### Structured Error Logging

```go
func processOrder(ctx context.Context, orderID string) error {
    logger := LoggerFromContext(ctx)

    order, err := db.GetOrder(ctx, orderID)
    if err != nil {
        logger.Error("Failed to fetch order",
            slog.String("order_id", orderID),
            slog.Any("error", err),
        )
        return fmt.Errorf("fetch order: %w", err)
    }

    if err := paymentService.Charge(ctx, order); err != nil {
        // Log with full error context
        var paymentErr *PaymentError
        if errors.As(err, &paymentErr) {
            logger.Error("Payment failed",
                slog.String("order_id", orderID),
                slog.String("error_code", paymentErr.Code),
                slog.String("error_message", paymentErr.Message),
                slog.Float64("amount", order.Total),
            )
        }
        return fmt.Errorf("charge order: %w", err)
    }

    logger.Info("Order processed successfully",
        slog.String("order_id", orderID),
        slog.Float64("amount", order.Total),
    )
    return nil
}
```

### Panic Recovery with Logging

```go
func RecoveryMiddleware(logger *slog.Logger) gin.HandlerFunc {
    return func(c *gin.Context) {
        defer func() {
            if r := recover(); r != nil {
                // Get stack trace
                stack := debug.Stack()

                logger.Error("Panic recovered",
                    slog.Any("panic", r),
                    slog.String("stack", string(stack)),
                    slog.String("path", c.Request.URL.Path),
                    slog.String("method", c.Request.Method),
                )

                c.AbortWithStatusJSON(500, gin.H{
                    "error": "internal server error",
                })
            }
        }()

        c.Next()
    }
}
```

## Docker Deployment

### Dockerfile (Multi-stage)

```dockerfile
# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server

# Runtime stage
FROM alpine:3.19

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/server .

# Environment variables
ENV LOGTIDE_API_URL=""
ENV LOGTIDE_API_KEY=""

EXPOSE 8080

CMD ["./server"]
```

### docker-compose.yml

```yaml
version: "3.8"

services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - LOGTIDE_API_URL=https://api.logtide.dev
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
      - ENVIRONMENT=production
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Graceful Shutdown

```go
func main() {
    handler, _ := logtide.NewHandler(logtide.Config{...})

    // Create server
    srv := &http.Server{
        Addr:    ":8080",
        Handler: router,
    }

    // Start server in goroutine
    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            slog.Error("Server error", slog.Any("error", err))
        }
    }()

    // Wait for interrupt signal
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    slog.Info("Shutting down server...")

    // Graceful shutdown with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        slog.Error("Server forced to shutdown", slog.Any("error", err))
    }

    // Close LogTide handler (flushes remaining logs)
    if err := handler.Close(); err != nil {
        slog.Error("Failed to close LogTide handler", slog.Any("error", err))
    }

    slog.Info("Server stopped")
}
```

## Performance

| Metric | slog | zerolog | zap |
|--------|------|---------|-----|
| Allocations per log | 0-2 | 0 | 0-1 |
| Latency (batched) | <100ns | <50ns | <80ns |
| Memory overhead | ~5MB | ~3MB | ~4MB |
| Throughput | 500k logs/sec | 1M logs/sec | 800k logs/sec |

## Best Practices

### 1. Use Structured Fields

```go
// Bad: String interpolation
slog.Info(fmt.Sprintf("User %s logged in from %s", userID, ip))

// Good: Structured fields
slog.Info("User logged in",
    slog.String("user_id", userID),
    slog.String("ip", ip),
)
```

### 2. Consistent Field Names

```go
// Define constants for field names
const (
    FieldUserID    = "user_id"
    FieldOrderID   = "order_id"
    FieldRequestID = "request_id"
    FieldError     = "error"
)

slog.Info("Order created",
    slog.String(FieldUserID, userID),
    slog.String(FieldOrderID, orderID),
)
```

### 3. Log Levels

| Level | Use Case |
|-------|----------|
| `Debug` | Development debugging, verbose output |
| `Info` | Normal operations, request logs |
| `Warn` | Recoverable issues, deprecation notices |
| `Error` | Failures requiring attention |

## Troubleshooting

### Logs not appearing

1. Check configuration:
   ```go
   fmt.Printf("API URL: %s\n", os.Getenv("LOGTIDE_API_URL"))
   fmt.Printf("API Key set: %v\n", os.Getenv("LOGTIDE_API_KEY") != "")
   ```

2. Ensure handler is closed on shutdown:
   ```go
   defer handler.Close()
   ```

### High memory usage

Reduce buffer size:
```go
handler, _ := logtide.NewHandler(logtide.Config{
    BufferSize: 1000, // Reduce from default 10000
})
```

## Next Steps

- [Docker Integration](/integrations/docker/) - Container deployment
- [Kubernetes Integration](/integrations/kubernetes/) - Cluster logging
- [nginx Integration](/integrations/nginx/) - Reverse proxy logs
