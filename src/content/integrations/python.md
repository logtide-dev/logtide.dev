---
title: "Python SDK Integration"
description: "Send structured logs from Python applications to LogTide using the official SDK with sync & async clients, stdlib logging integration, and middleware."
category: "language"
difficulty: "easy"
sdk: "python"
brandIcon: "simple-icons:python"
highlights:
  - "Sync & async clients"
  - "stdlib logging handler"
  - "Automatic batching & retry"
  - "Circuit breaker pattern"
relatedIntegrations:
  - "docker"
  - "postgresql"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "python logging"
  - "python structured logs"
  - "async logging"
  - "aiohttp logging"
  - "python sdk"
  - "logtide python"
---

The LogTide Python SDK provides structured logging with automatic batching, sync and async clients, stdlib `logging` integration, payload limits, and middleware for Flask, Django, FastAPI, and Starlette.

## Why use the LogTide Python SDK?

- **Sync & async**: `LogTideClient` (requests) and `AsyncLogTideClient` (aiohttp) for every use case
- **stdlib `logging` integration**: Drop in `LogTideHandler` to any existing logging setup
- **Automatic batching**: Reduces network overhead with intelligent batching and configurable flush interval
- **Circuit breaker**: Prevents app crashes if LogTide is unreachable — logs are silently dropped, never blocking
- **Payload limits**: Truncate oversized fields, remove base64 blobs, exclude sensitive fields
- **Trace correlation**: Context managers for request-scoped trace IDs
- **Type hints**: Full typing support for Python 3.8+

## Prerequisites

- Python 3.8+
- pip or poetry
- LogTide instance with API key

## Installation

```bash
pip install logtide-sdk
```

With optional extras:

```bash
# Async client (AsyncLogTideClient)
pip install logtide-sdk[async]

# Flask middleware
pip install logtide-sdk[flask]

# Django middleware
pip install logtide-sdk[django]

# FastAPI middleware
pip install logtide-sdk[fastapi]

# Starlette middleware (standalone)
pip install logtide-sdk[starlette]
```

## Quick Start

```python
import os
from logtide_sdk import LogTideClient, ClientOptions

client = LogTideClient(
    ClientOptions(
        api_url=os.environ["LOGTIDE_API_URL"],
        api_key=os.environ["LOGTIDE_API_KEY"],
    )
)

# Send logs — args: service, message, metadata (dict or Exception)
client.info("api-gateway", "Server started", {"port": 3000})
client.error("database", "Connection failed", Exception("Timeout"))

# Graceful shutdown — also registered automatically via atexit
client.close()
```

### Environment Variables

```bash
# .env
LOGTIDE_API_URL=http://localhost:8080
LOGTIDE_API_KEY=lp_your_api_key_here
```

## Configuration Options

```python
import os
from logtide_sdk import LogTideClient, ClientOptions, PayloadLimitsOptions

client = LogTideClient(
    ClientOptions(
        # Required
        api_url=os.environ["LOGTIDE_API_URL"],
        api_key=os.environ["LOGTIDE_API_KEY"],

        # Performance
        batch_size=100,              # Flush after N logs (default: 100)
        flush_interval=5000,         # Auto-flush interval in ms (default: 5000)
        max_buffer_size=10000,       # Max buffered logs; excess silently dropped (default: 10000)

        # Reliability
        max_retries=3,               # Retry failed requests (default: 3)
        retry_delay_ms=1000,         # Initial retry delay in ms, doubles each attempt (default: 1000)
        circuit_breaker_threshold=5, # Open circuit after N consecutive failures (default: 5)
        circuit_breaker_reset_ms=30000, # Try half-open after N ms (default: 30000)

        # Metadata merged into every log
        global_metadata={
            "environment": os.environ.get("APP_ENV", "production"),
            "version": os.environ.get("APP_VERSION", "unknown"),
        },

        # Auto-generate a UUID trace ID for every log that has none (default: False)
        auto_trace_id=False,

        # Disable internal metrics collection if not needed (default: True)
        enable_metrics=True,

        # Payload safety
        payload_limits=PayloadLimitsOptions(
            max_field_size=10 * 1024,        # Truncate strings > 10 KB
            exclude_fields=["password"],     # Replace value with "[EXCLUDED]"
        ),

        debug=False,
    )
)
```

## Logging Methods

```python
# Log levels: debug, info, warn, error, critical
# Signature: client.<level>(service, message, metadata=None)

client.debug("worker", "Processing item", {"item_id": 42})
client.info("api-gateway", "Request received", {"method": "GET", "path": "/users"})
client.warn("cache", "Cache miss", {"key": "user:123"})
client.error("database", "Query failed", {"query": "SELECT *"})
client.critical("system", "Out of memory", {"used": "95%"})
```

### Exception Auto-Serialization

Pass an `Exception` directly as metadata — it is serialized automatically with full stack frames:

```python
try:
    raise RuntimeError("Database timeout")
except Exception as e:
    client.error("database", "Query failed", e)

# Produces metadata:
# {
#   "exception": {
#     "type": "RuntimeError",
#     "message": "Database timeout",
#     "language": "python",
#     "stacktrace": [{"file": "app.py", "function": "run_query", "line": 42}],
#     "raw": "Traceback (most recent call last): ..."
#   }
# }
```

## Async Client

Install aiohttp first: `pip install logtide-sdk[async]`

```python
import asyncio
import os
from logtide_sdk import AsyncLogTideClient, ClientOptions

async def main():
    async with AsyncLogTideClient(ClientOptions(
        api_url=os.environ["LOGTIDE_API_URL"],
        api_key=os.environ["LOGTIDE_API_KEY"],
    )) as client:
        await client.info("my-service", "Hello from async!")
        await client.error("my-service", "Something failed", Exception("oops"))

asyncio.run(main())
```

Manual lifecycle (without context manager):

```python
client = AsyncLogTideClient(options)
await client.start()   # starts background flush loop
try:
    await client.info("svc", "message")
finally:
    await client.close()
```

## stdlib `logging` Integration

`LogTideHandler` is a standard `logging.Handler` — drop it into any existing setup:

```python
import logging
import os
from logtide_sdk import LogTideClient, ClientOptions, LogTideHandler

client = LogTideClient(ClientOptions(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
))

handler = LogTideHandler(client=client, service="my-service")
handler.setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
logger.addHandler(handler)

# These are forwarded to LogTide automatically
logger.warning("Low disk space")
logger.error("Unhandled exception", exc_info=True)
```

Exception info is serialized with full structured stack frames when `exc_info=True` is used.

## Trace ID Context

### Manual Trace ID

```python
client.set_trace_id("request-123")

client.info("api", "Request received")
client.info("db", "Querying users")
client.info("api", "Response sent")

client.set_trace_id(None)  # clear
```

### Scoped Trace ID (Context Manager)

```python
with client.with_trace_id("request-456"):
    client.info("api", "Processing in context")
    client.warn("cache", "Cache miss")
# Trace ID automatically restored after block
```

### Auto-Generated Trace ID

```python
with client.with_new_trace_id():
    client.info("worker", "Background job started")
    client.info("worker", "Job completed")
```

## Payload Limits

```python
from logtide_sdk import PayloadLimitsOptions

# Configure in ClientOptions
payload_limits=PayloadLimitsOptions(
    max_field_size=5 * 1024,           # Truncate strings longer than 5 KB
    max_log_size=100 * 1024,           # Drop entries larger than 100 KB
    exclude_fields=["password", "token"],  # Replace with "[EXCLUDED]"
    truncation_marker="...[TRUNCATED]", # Appended to truncated strings
)

# Base64 strings (data URIs, long blobs) are replaced automatically with:
# "[BASE64 DATA REMOVED]"
```

## Internal Metrics

Monitor the health of the SDK at runtime:

```python
import threading
import time

def monitor():
    while True:
        m = client.get_metrics()
        if m.logs_dropped > 0:
            print(f"WARNING: {m.logs_dropped} logs dropped (buffer full)")
        if m.circuit_breaker_trips > 0:
            print("ERROR: Circuit breaker tripped")
        time.sleep(60)

threading.Thread(target=monitor, daemon=True).start()

# Get current circuit breaker state
print(client.get_circuit_breaker_state())  # CLOSED | OPEN | HALF_OPEN

# Available metrics
m = client.get_metrics()
print(m.logs_sent, m.logs_dropped, m.errors, m.retries, m.avg_latency_ms, m.circuit_breaker_trips)
client.reset_metrics()
```

## Production Best Practices

### 1. Always Flush on Shutdown

`client.close()` is registered automatically via `atexit`, but call it explicitly in signal handlers:

```python
import signal
import sys

def shutdown_handler(signum, frame):
    client.close()
    sys.exit(0)

signal.signal(signal.SIGTERM, shutdown_handler)
signal.signal(signal.SIGINT, shutdown_handler)
```

### 2. Use Environment-Specific Configuration

```python
import os

environment = os.environ.get("APP_ENV", "development")

client = LogTideClient(
    ClientOptions(
        api_url=os.environ["LOGTIDE_API_URL"],
        api_key=os.environ["LOGTIDE_API_KEY"],
        global_metadata={
            "environment": environment,
            "version": os.environ.get("APP_VERSION", "unknown"),
        },
        # Smaller batches in development for faster feedback
        batch_size=10 if environment == "development" else 100,
        debug=(environment == "development"),
    )
)
```

### 3. Don't Log Sensitive Data

Use `exclude_fields` in `PayloadLimitsOptions`, or mask data before logging:

```python
def mask_email(email: str) -> str:
    local, domain = email.split("@")
    return f"{local[0]}***@{domain}"

# Bad
client.info("auth", "User login", {"email": user.email, "password": password})

# Good
client.info("auth", "User login", {"user_id": user.id, "email": mask_email(user.email)})
```

### 4. Use Appropriate Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Detailed debugging info (disable in production) |
| `info` | Normal operations: requests, user actions |
| `warn` | Recoverable issues: rate limits, retries |
| `error` | Failures needing attention |
| `critical` | System failures requiring immediate action |

## Troubleshooting

### Logs not appearing

1. Enable debug mode to see what is happening:
   ```python
   ClientOptions(..., debug=True)
   ```

2. Ensure shutdown is called before process exit:
   ```python
   client.close()
   ```

3. Check circuit breaker state:
   ```python
   print(client.get_circuit_breaker_state())
   ```

### High memory usage

Reduce batch size or lower the buffer cap:

```python
ClientOptions(
    batch_size=50,
    flush_interval=2000,  # flush every 2s
    max_buffer_size=1000,
)
```

### Async event loop issues

Always use `async with` or call `await client.start()` before logging:

```python
async def main():
    async with AsyncLogTideClient(options) as client:
        await your_app(client)
```

## Next Steps

- [Flask Integration](/integrations/flask/) - Flask middleware and request logging
- [Django Integration](/integrations/django/) - Django middleware and Celery support
- [FastAPI Integration](/integrations/fastapi/) - Async middleware and dependency injection
- [Docker Integration](/integrations/docker/) - Containerized deployments
- [GDPR Compliance](/use-cases/gdpr-compliance/) - Privacy-compliant logging
