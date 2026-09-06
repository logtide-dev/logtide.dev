---
title: "Ruby on Rails Logging Integration"
description: "Send structured logs, exceptions, and traces from Ruby on Rails to LogTide with the logtide gem - a Railtie installs per-request middleware automatically."
category: "framework"
difficulty: "easy"
sdk: "ruby"
brandIcon: "simple-icons:rubyonrails"
highlights:
  - "Railtie auto-installs middleware"
  - "Per-request scope isolation"
  - "Structured exception capture"
  - "Distributed tracing"
relatedIntegrations:
  - "docker"
  - "nginx"
  - "postgresql"
relatedUseCases:
  - "incident-response"
  - "microservices-observability"
keywords:
  - "rails logging"
  - "ruby on rails structured logging"
  - "rails error tracking"
  - "rails self-hosted logging"
  - "ruby logging gem"
faqs:
  - question: "How do I integrate LogTide with a Rails application?"
    answer: "Add gem \"logtide\" to your Gemfile and run bundle install, then create config/initializers/logtide.rb that calls Logtide.init with your DSN, service name, and release. The gem's Railtie installs the Rack middleware automatically, so per-request scope isolation, HTTP tags, traceparent parsing, and request/response breadcrumbs work with no further setup."
  - question: "Do I need to change my existing Rails.logger calls?"
    answer: "No. You can keep using Rails.logger as-is, or swap in Logtide::LoggerBridge, a drop-in replacement for the stdlib Logger that delivers entries to LogTide with the current scope context. For richer data, call Logtide.info/warn/error with a metadata hash, or Logtide.capture_exception to keep the cause chain and stack frames."
  - question: "Does the Rails integration support distributed tracing?"
    answer: "Yes. The Rack middleware reads inbound W3C traceparent headers and starts a server span per request; logs emitted during the request carry its trace_id and span_id. To propagate the trace to a downstream service, attach Logtide.trace_propagation_headers to your outbound HTTP call."
  - question: "Does the Ruby SDK have any runtime dependencies?"
    answer: "No. The logtide gem uses the Ruby standard library only (net/http, json, securerandom, zlib, logger), so it adds nothing to your dependency tree beyond the gem itself. It requires Ruby 3.1 or later."
---

The LogTide Ruby SDK (the `logtide` gem) provides a drop-in integration for Ruby on Rails. A Railtie installs the Rack middleware automatically, so each request gets an isolated scope, HTTP tags, `traceparent` parsing, and request/response breadcrumbs with no manual wiring. The SDK uses the standard library only - no runtime dependencies.

## Why use LogTide with Rails?

- **Zero-wiring middleware**: the Railtie installs the Rack middleware automatically
- **Per-request isolation**: tags, user, and breadcrumbs don't leak between requests
- **Structured exception capture**: cause chains and stack frames, not stringified messages
- **Distributed tracing**: W3C `traceparent` in and out, with log/trace correlation
- **stdlib `Logger` bridge**: keep your existing logging calls
- **Self-hosted**: keep log data on your own infrastructure, with no per-GB fees

## Prerequisites

- Ruby 3.1+
- Rails 6.1, 7.x, or 8.x
- Bundler
- A LogTide instance with a DSN

## Installation

Add the gem to your `Gemfile`:

```ruby
gem "logtide"
```

Then install it:

```bash
bundle install
```

## Configuration

Initialise the SDK in an initializer. The Railtie picks up the configured client and
installs the Rack middleware for you:

```ruby
# config/initializers/logtide.rb
Logtide.init(
  dsn: ENV["LOGTIDE_DSN"],
  service: "my-app",
  environment: Rails.env,
  release: ENV["GIT_SHA"]
)
```

Set the DSN in your environment:

```bash
LOGTIDE_DSN=https://lp_your_key@logs.example.com
```

That's it - the middleware is active with sensible defaults. See the
[Ruby SDK reference](/docs/sdks/ruby/) for the full list of configuration options
(batching, retry, circuit breaker, sampling, breadcrumbs, and PII handling).

## Basic Usage

### Logging

```ruby
Logtide.info("user signed in", { user_id: current_user.id })
Logtide.warn("rate limit approaching", { ip: request.remote_ip })
Logtide.error("payment failed", { order_id: order.id })
```

### Capturing exceptions

Use `capture_exception` so the cause chain and stack frames are preserved for grouping:

```ruby
class OrdersController < ApplicationController
  def create
    @order = Order.create!(order_params)
    charge_card!(@order)
  rescue Stripe::CardError => e
    Logtide.capture_exception(e, { order_id: @order&.id })
    redirect_to new_order_path, alert: "Payment failed"
  end
end
```

For app-wide error reporting, capture from `rescue_from`:

```ruby
class ApplicationController < ActionController::Base
  rescue_from StandardError do |e|
    Logtide.capture_exception(e)
    raise
  end
end
```

### stdlib Logger bridge

`Logtide::LoggerBridge` is a drop-in replacement for the stdlib `Logger`. Wire it as
the Rails logger to forward framework and application logs to LogTide:

```ruby
# config/initializers/logtide.rb
Rails.logger = Logtide::LoggerBridge.new
```

`fatal` calls are delivered as `critical` entries.

## Scope and breadcrumbs

The Rack middleware already isolates a scope per request. Add request-specific tags,
user, and breadcrumbs to enrich every entry within that request:

```ruby
class ApplicationController < ActionController::Base
  before_action do
    Logtide.configure_scope do |scope|
      scope.set_user(id: current_user&.id, email: current_user&.email)
      scope.set_tag("tenant", current_tenant.slug)
    end
  end
end
```

## Background jobs

The web middleware only covers HTTP requests. Wrap job execution in `with_scope` so
each job runs in its own isolated scope, and flush long-lived workers on shutdown:

```ruby
class ProcessOrderJob < ApplicationJob
  def perform(order_id)
    Logtide.with_scope do |scope|
      scope.set_tag("job", self.class.name)
      Logtide.info("processing order", { order_id: order_id })
      # ... work ...
    end
  end
end
```

For short-lived processes (rake tasks, one-off scripts), call `Logtide.flush` (or
`Logtide.close`) before exit so buffered entries are delivered. A best-effort
`at_exit` hook is installed, but an explicit flush is the safe choice.

## Distributed tracing

The middleware starts a server span per request and reads inbound `traceparent`
headers automatically. Logs emitted during the request carry the active
`trace_id` and `span_id`. To propagate the trace to a downstream service:

```ruby
headers = Logtide.trace_propagation_headers
# => { "traceparent" => "00-..." }

Net::HTTP.post(uri, payload.to_json, headers.merge("content-type" => "application/json"))
```

## Docker Deployment

```yaml
# docker-compose.yml
services:
  web:
    build: .
    environment:
      - RAILS_ENV=production
      - LOGTIDE_DSN=${LOGTIDE_DSN}
      - GIT_SHA=${GIT_SHA}
    depends_on:
      - postgres

  worker:
    build: .
    command: bundle exec sidekiq
    environment:
      - RAILS_ENV=production
      - LOGTIDE_DSN=${LOGTIDE_DSN}
    depends_on:
      - postgres
      - redis
```

## Troubleshooting

### Logs not appearing

1. Confirm the DSN is set: `bin/rails runner 'p ENV["LOGTIDE_DSN"]'`
2. Enable SDK debug output to log internals to stderr:

   ```ruby
   Logtide.init(dsn: ENV["LOGTIDE_DSN"], service: "my-app", debug: true)
   ```

3. Check `Logtide.get_metrics` - a rising `logs_dropped` means the buffer hit
   `max_buffer_size`; a non-zero `circuit_breaker_trips` means delivery is failing.

### Worker logs missing

Background workers need the same `LOGTIDE_DSN` in their environment, and long-lived
workers should not rely solely on `at_exit` - flush on shutdown where possible.

## Next Steps

- [Ruby SDK Reference](/docs/sdks/ruby/) - full SDK documentation
- [PostgreSQL Integration](/integrations/postgresql/) - database logs
- [Docker Integration](/integrations/docker/) - container deployment
- [Incident Response](/use-cases/incident-response/) - from log to root cause
