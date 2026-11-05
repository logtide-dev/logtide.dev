---
title: "Go Integration"
description: "Send structured logs from Go applications to LogTide using the official Go SDK."
category: "language"
difficulty: "easy"
sdk: "go"
brandIcon: "simple-icons:go"
highlights:
  - "DSN-based setup"
  - "log/slog handler"
  - "net/http middleware"
  - "OpenTelemetry support"
relatedIntegrations:
  - "docker"
  - "kubernetes"
relatedUseCases: []
keywords:
  - "golang logging"
  - "go sdk"
  - "go slog"
  - "opentelemetry go"
  - "net/http middleware"
faqs:
  - question: "How do I send Go application logs to LogTide?"
    answer: "Run go get github.com/logtide-dev/logtide-sdk-go, then call logtide.Init() with your DSN and service name. Use logtide.Info(), logtide.Error(), and similar functions, and defer the returned flush function to ensure buffered logs are flushed on shutdown."
  - question: "Does the Go SDK support structured log metadata?"
    answer: "Yes. Every log call accepts a map[string]any as its third argument, which is sent as structured JSON metadata alongside the service name, message, and log level."
  - question: "Can I keep using log/slog in my Go code?"
    answer: "Yes. The logtideslog integration provides a slog.Handler. Register it with slog.SetDefault and existing slog calls flow to LogTide, with attributes becoming metadata and error values promoted to structured exceptions."
  - question: "How do I add LogTide logging to a Go HTTP server without changing every handler?"
    answer: "Use the built-in net/http middleware by wrapping your mux with lnethttp.Middleware(mux). It handles scope isolation, HTTP tagging, and breadcrumbs per request automatically."
  - question: "Does LogTide integrate with OpenTelemetry in Go?"
    answer: "Yes. If an active OpenTelemetry span is present in the context passed to a log call, the SDK automatically extracts and attaches the trace_id and span_id to the log entry."
---

Send structured logs from any Go application to LogTide using the official SDK. It handles batching, retries, and circuit breaking automatically. This page covers the Go-specific patterns: where the client lives, how `context.Context` carries request state, how to plug in `log/slog`, and how to shut down without losing the last batch. The [Go SDK reference](/docs/sdks/go/) has the full API.

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

## Global Init or explicit client

The SDK supports two styles, and the choice mostly depends on how your code is structured.

| | `logtide.Init(...)` | `logtide.NewClient(opts)` |
|---|---|---|
| Access | Package functions (`logtide.Info`) | Methods on the client you pass around |
| Teardown | `defer flush()` | `defer client.Close()` |
| Good for | Small services, `main` packages | Libraries, tests, several clients in one process |
| Returns an error | No | Yes, so you can fail on a bad DSN |

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

## Passing context.Context

Every log call takes a `context.Context` as its first argument. That context is how the SDK finds the active OpenTelemetry span, so pass the request context (`r.Context()`), not `context.Background()`, whenever you have one. Two consequences follow:

- Trace and span IDs are attached automatically when the context carries an active span.
- The context is also where per-request state can live. The SDK offers `logtide.SetHubOnContext`, which stores a cloned hub in the context so downstream functions can use it.

```go
func ordersHandler(w http.ResponseWriter, r *http.Request) {
    hub := logtide.CurrentHub().Clone()
    hub.ConfigureScope(func(s *logtide.Scope) {
        s.SetTag("request_id", r.Header.Get("X-Request-ID"))
    })

    ctx := logtide.SetHubOnContext(r.Context(), hub)
    hub.Info(ctx, "request received", nil)

    if err := processOrder(ctx); err != nil {
        // client comes from logtide.NewClient; captures the error with a stack trace
        client.CaptureError(ctx, err, map[string]any{"handler": "orders"})
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }
}
```

If you use the `net/http` middleware below, per-request scope isolation is already done for you, so reach for a manual hub only when you run outside HTTP (a queue consumer, a cron job).

## Using log/slog

If your code already logs through the standard library's `log/slog`, you do not have to rewrite call sites. The `logtideslog` integration is a `slog.Handler`: attributes become entry metadata, slog groups become nested metadata objects, and attribute values that implement `error` are promoted to structured exceptions, which is what server-side error grouping needs.

```go
import (
    "log/slog"

    logtide "github.com/logtide-dev/logtide-sdk-go"
    "github.com/logtide-dev/logtide-sdk-go/integrations/logtideslog"
)

client, err := logtide.NewClient(logtide.ClientOptions{
    DSN:     "https://lp_your_api_key@api.logtide.dev",
    Service: "my-service",
})
if err != nil {
    log.Fatal(err)
}
defer client.Close()

handler := logtideslog.New(client, &logtideslog.Options{Level: slog.LevelDebug})
slog.SetDefault(slog.New(handler))

slog.Info("user signed in", "user_id", 42, "plan", "pro")
slog.Error("checkout failed", "err", err, "order_id", 1234)
```

A few slog habits pay off with this handler:

- Use the `...Context` variants (`slog.InfoContext(ctx, ...)`) so the request context reaches the handler.
- Use `logger.With("component", "billing")` to attach fixed attributes once instead of repeating them at each call.
- Pass errors as attributes (`"err", err`), not as formatted strings, so they are promoted to structured exceptions.
- Records go through the client's normal pipeline (scope merge, `BeforeSend`, sampling and batching), so the same sampling and filtering rules apply as for direct SDK calls.

The SDK documentation describes a slog handler but does not list adapters for other Go logging libraries such as zap or zerolog. If your code base is on one of those, you can call the LogTide client alongside it for the events you care about, or migrate gradually to slog, which the SDK supports directly.

## HTTP Middleware

The built-in `net/http` middleware handles scope isolation, HTTP tagging, `Traceparent` parsing, and request/response breadcrumbs per request:

```go
import lnethttp "github.com/logtide-dev/logtide-sdk-go/integrations/nethttp"

mux := http.NewServeMux()
mux.HandleFunc("GET /users/{id}", usersHandler)

http.ListenAndServe(":8080", lnethttp.Middleware(mux))
```

Because it wraps any `http.Handler`, it works the same way with the standard `ServeMux` as with routers that expose an `http.Handler`.

## Outbound calls

To keep a trace connected across services, wrap the transport of your `http.Client` with `logtide.WrapTransport`. It injects the W3C `traceparent` header on outbound requests when a trace is active:

```go
httpClient := &http.Client{Transport: logtide.WrapTransport(nil)} // nil uses http.DefaultTransport

req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.upstream.dev/users", nil)
resp, err := httpClient.Do(req)
```

Create the request with the request-scoped `ctx`, otherwise there is no trace context to propagate.

## OpenTelemetry

Trace and span IDs are extracted automatically from any active OTel span in the context:

```go
ctx, span := tracer.Start(ctx, "process-order")
defer span.End()

// trace_id and span_id included automatically
client.Info(ctx, "Order processed", map[string]any{"order_id": id})
```

The SDK also has span and metric exporters (`otelexport`, `otelmetric`); see the [Go SDK reference](/docs/sdks/go/) for setup.

## Graceful Shutdown

Logs are batched, so the last few entries sit in memory until the next flush. Stop the HTTP server first so no new requests produce logs, then let the deferred flush run:

```go
func main() {
    flush := logtide.Init(opts)
    defer flush() // runs last, after the server has stopped

    srv := &http.Server{Addr: ":8080", Handler: lnethttp.Middleware(mux)}

    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()

    go func() {
        if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            logtide.Error(context.Background(), "server failed", map[string]any{"err": err.Error()})
        }
    }()

    <-ctx.Done()

    shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    _ = srv.Shutdown(shutdownCtx)
}
```

Note that `os.Exit` and `log.Fatal` skip deferred functions, so do not call them after `Init` for normal shutdown paths. In containers, make sure the orchestrator's termination grace period is longer than your shutdown timeout. See the [Docker](/integrations/docker/) and [Kubernetes](/integrations/kubernetes/) guides.

## Next Steps

- [Go SDK reference](/docs/sdks/go/) - full API documentation
- [Docker Integration](/integrations/docker/) - container deployment
- [Kubernetes Integration](/integrations/kubernetes/) - cluster logging
