---
title: "Structured Logging and Error Tracking for Ruby and Rails"
description: "Ship structured logs, exceptions, and traces from Ruby and Rails with the new LogTide Ruby SDK — a stdlib-only gem with Rack and Rails middleware."
pubDate: 2026-06-20
author: "LogTide Team"
tags:
  - "ruby"
  - "rails"
  - "observability"
keywords:
  - "ruby structured logging"
  - "rails error tracking"
  - "rails logging"
  - "ruby logging gem"
  - "rails self-hosted logging"
faqs:
  - question: "What is the LogTide Ruby SDK?"
    answer: "It is the official logtide gem for Ruby 3.1+ that sends structured logs, exceptions, and traces to a LogTide instance. It implements the LogTide SDK spec v1.0 with leveled logging, structured exception capture, a Hub/Scope model, distributed tracing, Rack middleware, a Rails Railtie, and a stdlib Logger bridge — using the standard library only, with no runtime dependencies."
  - question: "How do I add LogTide to a Rails app?"
    answer: "Add gem \"logtide\" to your Gemfile, run bundle install, and create config/initializers/logtide.rb that calls Logtide.init with your DSN and service name. The Railtie installs the Rack middleware automatically, giving you per-request scope isolation, HTTP tags, traceparent parsing, and breadcrumbs without further configuration."
  - question: "Does structured logging in Ruby require extra dependencies?"
    answer: "Not with the LogTide gem. It is built on the Ruby standard library (net/http, json, securerandom, zlib, logger), so it adds nothing to your dependency tree beyond the gem itself. It batches entries, retries with backoff, and uses a circuit breaker and bounded buffer so logging never blocks or destabilises your app."
  - question: "Is LogTide cheaper than hosted log management for Ruby apps?"
    answer: "LogTide is self-hosted, so you pay infrastructure costs only — there are no per-GB ingestion or retention surcharges. For high-volume Ruby and Rails services this is typically far cheaper than usage-priced SaaS log platforms, while keeping log data on your own infrastructure for data-residency and compliance reasons."
---

Ruby's built-in `Logger` is fine until you need to *find* something. Plain text lines don't carry the structure you want when an incident hits at 2am: which user, which request, which trace, what was the exception's cause chain. The **LogTide Ruby SDK** — the new `logtide` gem — adds that structure without changing how you write Ruby, and ships it to a log backend you host yourself.

This post walks through getting structured logs, exception capture, and distributed tracing out of a Ruby or Rails app, end to end.

## What you get

The `logtide` gem implements the LogTide SDK spec v1.0:

- **Leveled logging** — `debug`, `info`, `warn`, `error`, `critical`, plus `capture_exception`
- **Structured exception capture** with cause chains and stack frames
- **Hub / Scope model** — per-request isolation for tags, user, and breadcrumbs
- **Distributed tracing** — spans, OTLP export, and W3C `traceparent` in and out
- **Rack middleware + Rails Railtie** — request instrumentation with no wiring
- **stdlib `Logger` bridge** — a drop-in replacement for `Logger`
- **Reliability** — batching, exponential-backoff retry, a circuit breaker, and a bounded buffer

And it uses the **standard library only** — no runtime dependencies, and it requires Ruby 3.1+.

## Install

```ruby
# Gemfile
gem "logtide"
```

```bash
bundle install
```

## Plain Ruby in two minutes

Initialise once with your DSN, then log:

```ruby
require "logtide"

Logtide.init(
  dsn: "https://lp_your_key@logs.example.com",
  service: "checkout",
  environment: "production"
)

Logtide.info("order placed", { order_id: 42, amount: 19.99 })

begin
  charge_card!
rescue => e
  Logtide.capture_exception(e)
end

Logtide.flush
```

The second argument to any log method is a metadata hash — that's the "structured" part. Instead of interpolating values into a string, you attach them as fields you can later filter and aggregate on.

`capture_exception` is the one to reach for on errors: it serialises the exception, its cause chain, and (when `attach_stacktrace` is on, which it is by default) the stack frames — far more useful than `Logtide.error(e.message)`.

For short-lived scripts and rake tasks, call `Logtide.flush` before exit so buffered entries are delivered. A best-effort `at_exit` hook exists, but an explicit flush is the safe choice.

## Rails: the Railtie does the wiring

In Rails you don't touch Rack at all. Add an initializer and the Railtie installs the middleware for you:

```ruby
# config/initializers/logtide.rb
Logtide.init(
  dsn: ENV["LOGTIDE_DSN"],
  service: "my-app",
  environment: Rails.env,
  release: ENV["GIT_SHA"]
)
```

From here, every request gets an isolated scope, HTTP tags, inbound `traceparent` parsing, and request/response breadcrumbs — automatically.

### Enrich the request scope

Attach the current user and any request-specific tags once, and every log entry within that request carries them:

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

### Capture exceptions app-wide

```ruby
class ApplicationController < ActionController::Base
  rescue_from StandardError do |e|
    Logtide.capture_exception(e)
    raise
  end
end
```

### Keep your existing logger

If you'd rather not change call sites, swap the Rails logger for the bridge — a drop-in replacement for the stdlib `Logger`:

```ruby
Rails.logger = Logtide::LoggerBridge.new
```

`fatal` calls arrive as `critical` entries.

## Background jobs

The web middleware only covers HTTP requests, so wrap job execution in `with_scope` to keep each job isolated:

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

## Distributed tracing

Logs inside a span automatically carry its `trace_id` and `span_id`, so you can jump from a log line to the full trace. Create spans explicitly where it helps:

```ruby
Logtide.start_span("checkout", kind: :server) do |span|
  span.set_attribute("cart.size", 3)
  Logtide.info("processing") # carries the span's trace_id / span_id
end
```

To continue a trace across services, attach the propagation headers to your outbound call:

```ruby
headers = Logtide.trace_propagation_headers
# => { "traceparent" => "00-..." }

Net::HTTP.post(uri, body, headers)
```

The Rack middleware reads inbound `traceparent` headers automatically, so the other side of that call picks the trace back up with no extra code.

## Why self-hosted

Hosted log platforms price by the gigabyte, and Ruby apps under load generate a lot of gigabytes. LogTide is self-hosted: you run it on your own infrastructure and pay for that infrastructure, not for ingestion or retention. At meaningful volume that's a large saving, and your log data — which often contains user and request detail — never leaves systems you control. That matters for data residency and compliance as much as for cost.

## Next steps

- [Ruby SDK reference](/docs/sdks/ruby/) — every method and configuration option
- [Rails integration guide](/integrations/rails/) — the full Rails walkthrough
- [Self-hosted log management](/self-hosted-log-management/) — how LogTide is deployed
