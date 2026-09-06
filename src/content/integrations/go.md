---
title: "Go Integration"
description: "Send structured logs from Go applications to LogTide using the official Go SDK."
category: "language"
difficulty: "easy"
sdk: "go"
brandIcon: "simple-icons:go"
highlights:
  - "DSN-based setup"
  - "Hub/Scope context isolation"
  - "net/http middleware"
  - "OpenTelemetry support"
relatedIntegrations:
  - "docker"
  - "kubernetes"
relatedUseCases: []
keywords:
  - "golang logging"
  - "go sdk"
  - "go structured logging"
  - "opentelemetry go"
  - "net/http middleware"
faqs:
  - question: "How do I send Go application logs to LogTide?"
    answer: "Run go get github.com/logtide-dev/logtide-sdk-go, then call logtide.Init() with your DSN and service name. Use logtide.Info(), logtide.Error(), and similar functions, and defer the returned flush function to ensure buffered logs are flushed on shutdown."
  - question: "Does the Go SDK support structured log metadata?"
    answer: "Yes. Every log call accepts a map[string]any as its third argument, which is sent as structured JSON metadata alongside the service name, message, and log level."
  - question: "How do I add LogTide logging to a Go HTTP server without changing every handler?"
    answer: "Use the built-in net/http middleware by wrapping your mux with lnethttp.Middleware(mux). It handles scope isolation, HTTP tagging, and breadcrumbs per request automatically."
  - question: "Does LogTide integrate with OpenTelemetry in Go?"
    answer: "Yes. If an active OpenTelemetry span is present in the context passed to a log call, the SDK automatically extracts and attaches the trace_id and span_id to the log entry."
---

Send structured logs from any Go application to LogTide using the official SDK. It handles batching, retries, and circuit breaking automatically.

## Installation

```bash
go get github.com/logtide-dev/logtide-sdk-go
```

Requires Go 1.23+.

## Quick Start

```go
package main

import (
    "context"
    logtide "github.com/logtide-dev/logtide-sdk-go"
)

func main() {
    flush := logtide.Init(logtide.ClientOptions{
        DSN:         "https://lp_your_api_key@api.logtide.dev",
        Service:     "my-service",
        Environment: "production",
    })
    defer flush()

    logtide.Info(context.Background(), "Application started", map[string]any{
        "version": "1.2.3",
    })
}
```

## Configuration

```go
opts := logtide.NewClientOptions()
opts.DSN         = "https://lp_your_api_key@api.logtide.dev"
opts.Service     = "my-service"
opts.Release     = "v1.2.3"
opts.Environment = "production"
opts.Tags        = map[string]string{"region": "eu-west-1"}

client, err := logtide.NewClient(opts)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

## HTTP Middleware

The built-in `net/http` middleware handles scope isolation, HTTP tagging, and breadcrumbs per request:

```go
import lnethttp "github.com/logtide-dev/logtide-sdk-go/integrations/nethttp"

mux := http.NewServeMux()
http.ListenAndServe(":8080", lnethttp.Middleware(mux))
```

## OpenTelemetry

Trace and span IDs are extracted automatically from any active OTel span in the context:

```go
ctx, span := tracer.Start(ctx, "process-order")
defer span.End()

// trace_id and span_id included automatically
client.Info(ctx, "Order processed", map[string]any{"order_id": id})
```

## Graceful Shutdown

```go
// Global Init pattern
flush := logtide.Init(opts)
defer flush() // flushes all buffered entries

// Explicit client pattern
client, _ := logtide.NewClient(opts)
defer client.Close()
```

## Next Steps

- [Go SDK reference](/docs/sdks/go/) - full API documentation
- [Docker Integration](/integrations/docker/) - container deployment
- [Kubernetes Integration](/integrations/kubernetes/) - cluster logging
