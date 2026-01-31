---
title: "Python and FastAPI Logging Integration"
description: "Send structured logs from Python and FastAPI applications to LogTide using structlog or loguru with async support."
category: "language"
difficulty: "easy"
sdk: "python"
brandIcon: "simple-icons:python"
highlights:
  - "Structlog & Loguru support"
  - "FastAPI middleware"
  - "Async logging patterns"
  - "Kubernetes sidecar ready"
relatedIntegrations:
  - "docker"
  - "postgresql"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "python logging"
  - "fastapi logging"
  - "structlog"
  - "loguru"
  - "async logging"
  - "python structured logs"
  - "uvicorn logging"
---

The LogTide Python SDK provides structured logging with automatic batching, async support, and seamless integration with FastAPI, structlog, and loguru. Ship logs from your Python applications with minimal configuration.

## Why use the LogTide Python SDK?

- **Framework agnostic**: Works with FastAPI, Flask, Django, and vanilla Python
- **Structlog & Loguru**: Native integration with popular logging libraries
- **Async-first**: Non-blocking log shipping for high-throughput applications
- **Automatic batching**: Reduces network overhead with intelligent batching
- **Zero-downtime**: Circuit breaker prevents app crashes if LogTide is unreachable
- **Request correlation**: Trace requests across services with context propagation
- **Type hints**: Full typing support for modern Python development

## Prerequisites

- Python 3.9+ (3.11+ recommended for performance)
- pip, poetry, or uv
- LogTide instance with API key

## Installation

```bash
pip install logtide
```

Or with poetry/uv:

```bash
poetry add logtide
uv add logtide
```

For structlog or loguru integration:

```bash
pip install logtide[structlog]
pip install logtide[loguru]
```

## Quick Start (5 minutes)

### Basic Setup

```python
import os
from logtide import LogTideClient

client = LogTideClient(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
)

# Send a log
client.info("Application started", version="1.0.0", environment="production")

# Different log levels
client.debug("Debug information")
client.info("User logged in", user_id="123")
client.warning("Rate limit approaching", current=90, max=100)
client.error("Failed to process payment", order_id="456")
client.critical("Database connection lost")

# Graceful shutdown - flush remaining logs
client.shutdown()
```

### Environment Variables

Store your credentials in environment variables:

```bash
# .env
LOGTIDE_API_URL=https://api.logtide.dev
LOGTIDE_API_KEY=your-project-api-key
```

## Configuration Options

```python
import socket
from logtide import LogTideClient

client = LogTideClient(
    # Required
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],

    # Batching (optional)
    batch_size=100,        # Flush after N logs (default: 100)
    flush_interval=5.0,    # Flush every N seconds (default: 5.0)

    # Reliability (optional)
    max_retries=3,                    # Retry failed requests (default: 3)
    retry_delay=1.0,                  # Initial retry delay in seconds
    circuit_breaker_threshold=5,      # Open circuit after N failures
    circuit_breaker_reset_time=30.0,  # Reset circuit after N seconds

    # Default metadata (optional)
    global_metadata={
        "environment": os.environ.get("ENVIRONMENT", "development"),
        "version": os.environ.get("APP_VERSION", "unknown"),
        "hostname": socket.gethostname(),
    },

    # Service name (optional, defaults to 'app')
    default_service="api-server",

    # Async mode (optional)
    async_mode=True,  # Use async HTTP client
)
```

## Structlog Integration

Structlog is the recommended logging library for Python. LogTide integrates seamlessly with structlog processors.

### Basic Structlog Setup

```python
import structlog
from logtide.integrations.structlog import LogTideProcessor

# Configure structlog with LogTide processor
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        LogTideProcessor(
            api_url=os.environ["LOGTIDE_API_URL"],
            api_key=os.environ["LOGTIDE_API_KEY"],
            service="api",
        ),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

# Use structlog as normal
logger = structlog.get_logger()

logger.info("User signed up", user_id="123", plan="premium")
logger.warning("API rate limit approaching", current=95, limit=100)
logger.error("Payment failed", order_id="456", error="insufficient_funds")
```

### Structlog with Context Variables

```python
import structlog
from structlog.contextvars import bind_contextvars, clear_contextvars

logger = structlog.get_logger()

def process_request(request_id: str, user_id: str):
    # Bind context for all logs in this request
    bind_contextvars(
        request_id=request_id,
        user_id=user_id,
    )

    try:
        logger.info("Processing request")
        # ... business logic ...
        logger.info("Request completed")
    finally:
        clear_contextvars()
```

## Loguru Integration

Loguru provides a simpler API with powerful features. LogTide offers a custom sink for loguru.

### Basic Loguru Setup

```python
from loguru import logger
from logtide.integrations.loguru import LogTideSink

# Add LogTide sink
sink = LogTideSink(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
    service="api",
)

logger.add(sink, format="{message}", serialize=True)

# Use loguru as normal
logger.info("Application started")
logger.bind(user_id="123").info("User logged in")
logger.error("Failed to process", order_id="456")
```

### Loguru with Structured Data

```python
from loguru import logger

# Bind persistent context
user_logger = logger.bind(user_id="123", session_id="abc")

user_logger.info("Viewing dashboard")
user_logger.info("Updated profile", fields_changed=["email", "name"])

# Exception logging with full traceback
try:
    process_payment(order_id="456")
except Exception:
    logger.exception("Payment processing failed")
```

## FastAPI Integration

### Middleware Setup

```python
from fastapi import FastAPI, Request
from logtide import LogTideClient
from logtide.integrations.fastapi import LogTideMiddleware
import uuid

app = FastAPI()

client = LogTideClient(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
)

# Add logging middleware
app.add_middleware(
    LogTideMiddleware,
    client=client,
    service="api",
    log_request_body=False,  # Be careful with sensitive data
    log_response_body=False,
    skip_paths=["/health", "/ready", "/metrics"],
)

@app.get("/users/{user_id}")
async def get_user(request: Request, user_id: str):
    # Access trace ID from request state
    trace_id = request.state.trace_id

    # Log with trace context
    client.info(
        "Fetching user",
        user_id=user_id,
        trace_id=trace_id,
    )

    return {"id": user_id}
```

### Request Logging Output

Each request automatically logs:

```json
{
  "time": "2025-01-31T10:00:00.000Z",
  "service": "api",
  "level": "info",
  "message": "HTTP GET /users/123",
  "metadata": {
    "method": "GET",
    "path": "/users/123",
    "status_code": 200,
    "duration_ms": 45,
    "client_ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "trace_id": "abc123-def456"
  }
}
```

### Error Handling

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    trace_id = getattr(request.state, "trace_id", "unknown")

    client.error(
        "Unhandled exception",
        error=str(exc),
        error_type=type(exc).__name__,
        path=request.url.path,
        method=request.method,
        trace_id=trace_id,
    )

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "trace_id": trace_id},
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code >= 500:
        client.error(
            "HTTP error",
            status_code=exc.status_code,
            detail=exc.detail,
            path=request.url.path,
            trace_id=request.state.trace_id,
        )

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )
```

## Async Logging Patterns

### Async Client

For high-throughput applications, use the async client:

```python
import asyncio
from logtide import AsyncLogTideClient

async def main():
    client = AsyncLogTideClient(
        api_url=os.environ["LOGTIDE_API_URL"],
        api_key=os.environ["LOGTIDE_API_KEY"],
    )

    # Async logging
    await client.info("Starting async process")

    tasks = [process_item(i) for i in range(100)]
    await asyncio.gather(*tasks)

    await client.info("Completed all tasks")
    await client.shutdown()

async def process_item(item_id: int):
    await client.debug("Processing item", item_id=item_id)
    # ... async work ...
```

### Background Task Logging

```python
from fastapi import FastAPI, BackgroundTasks
from logtide import LogTideClient

app = FastAPI()
client = LogTideClient(...)

async def send_email_task(email: str, trace_id: str):
    client.info("Starting email send", email=email, trace_id=trace_id)
    try:
        await send_email(email)
        client.info("Email sent successfully", email=email, trace_id=trace_id)
    except Exception as e:
        client.error("Email send failed", email=email, error=str(e), trace_id=trace_id)

@app.post("/users")
async def create_user(background_tasks: BackgroundTasks, request: Request):
    user = await create_user_in_db()
    trace_id = request.state.trace_id

    # Log in background task
    background_tasks.add_task(send_email_task, user.email, trace_id)

    return {"id": user.id}
```

### Context Propagation

```python
from contextvars import ContextVar
from logtide import LogTideClient

trace_id_var: ContextVar[str] = ContextVar("trace_id", default="")

class ContextAwareClient:
    def __init__(self, client: LogTideClient):
        self._client = client

    def info(self, message: str, **kwargs):
        kwargs["trace_id"] = trace_id_var.get()
        self._client.info(message, **kwargs)

    def error(self, message: str, **kwargs):
        kwargs["trace_id"] = trace_id_var.get()
        self._client.error(message, **kwargs)

# Usage in middleware
@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4()))
    trace_id_var.set(trace_id)
    response = await call_next(request)
    response.headers["X-Trace-ID"] = trace_id
    return response
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Environment variables (override in deployment)
ENV LOGTIDE_API_URL=https://api.logtide.dev
ENV LOGTIDE_API_KEY=""

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Compose

```yaml
version: "3.8"

services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - LOGTIDE_API_URL=https://api.logtide.dev
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
      - ENVIRONMENT=production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Graceful Shutdown with Docker

```python
import signal
import sys
from logtide import LogTideClient

client = LogTideClient(...)

def shutdown_handler(signum, frame):
    client.info("Received shutdown signal", signal=signum)
    client.shutdown()  # Flush remaining logs
    sys.exit(0)

signal.signal(signal.SIGTERM, shutdown_handler)
signal.signal(signal.SIGINT, shutdown_handler)
```

## Kubernetes Sidecar Approach

For Kubernetes deployments, you can use a sidecar pattern where your application writes logs to stdout/files and a sidecar container ships them to LogTide.

### Application Configuration

Configure your app to write JSON logs to stdout:

```python
import structlog
import sys

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
)

logger = structlog.get_logger()
logger.info("Application started", version="1.0.0")
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        # Main application container
        - name: api
          image: your-registry/api:latest
          ports:
            - containerPort: 8000
          volumeMounts:
            - name: logs
              mountPath: /var/log/app

        # LogTide sidecar
        - name: logtide-agent
          image: logtide/agent:latest
          env:
            - name: LOGTIDE_API_URL
              value: "https://api.logtide.dev"
            - name: LOGTIDE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: logtide-credentials
                  key: api-key
            - name: LOG_SOURCE
              value: "/var/log/app/*.log"
          volumeMounts:
            - name: logs
              mountPath: /var/log/app
              readOnly: true

      volumes:
        - name: logs
          emptyDir: {}
```

## Production Best Practices

### 1. Always Flush on Shutdown

```python
import atexit
from logtide import LogTideClient

client = LogTideClient(...)

# Register shutdown handler
atexit.register(client.shutdown)
```

### 2. Use Environment-Specific Configuration

```python
import os
from logtide import LogTideClient

environment = os.environ.get("ENVIRONMENT", "development")

client = LogTideClient(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
    global_metadata={
        "environment": environment,
        "version": os.environ.get("APP_VERSION", "unknown"),
        "pod_name": os.environ.get("POD_NAME", "local"),
    },
    # Smaller batches in development for faster feedback
    batch_size=10 if environment == "development" else 100,
)
```

### 3. Don't Log Sensitive Data

```python
import re

def mask_email(email: str) -> str:
    """Mask email for logging: user@example.com -> u***@example.com"""
    if "@" not in email:
        return "***"
    local, domain = email.split("@")
    return f"{local[0]}***@{domain}"

def mask_card(card_number: str) -> str:
    """Mask card number: 4111111111111111 -> ****1111"""
    return f"****{card_number[-4:]}"

# Bad: Logging sensitive data
client.info("User login", email=user.email, password=password)

# Good: Log only masked/safe data
client.info("User login", user_id=user.id, email=mask_email(user.email))
```

### 4. Use Appropriate Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Detailed debugging info (disabled in production) |
| `info` | Normal operations: requests, user actions |
| `warning` | Recoverable issues: rate limits, retries |
| `error` | Failures that need attention |
| `critical` | System failures requiring immediate action |

## Performance

| Metric | Value |
|--------|-------|
| Memory overhead | ~10MB |
| Latency (batched) | <1ms per log |
| Network calls | 1 per batch (100 logs default) |
| CPU impact | <0.1% |
| Async throughput | 10,000+ logs/sec |

## Troubleshooting

### Logs not appearing

1. Check API key is valid:
   ```python
   print(f"API URL: {os.environ.get('LOGTIDE_API_URL')}")
   print(f"API Key set: {bool(os.environ.get('LOGTIDE_API_KEY'))}")
   ```

2. Ensure shutdown is called:
   ```python
   client.shutdown()
   ```

3. Check for circuit breaker opening:
   ```python
   client.on_circuit_open(lambda: print("LogTide circuit breaker opened"))
   ```

### High memory usage

Reduce batch size if processing many logs:

```python
client = LogTideClient(
    batch_size=50,        # Smaller batches
    flush_interval=2.0,   # More frequent flushes
)
```

### Async event loop issues

If using the async client, ensure proper event loop handling:

```python
import asyncio
from logtide import AsyncLogTideClient

async def main():
    client = AsyncLogTideClient(...)
    try:
        await your_app()
    finally:
        await client.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
```

## Next Steps

- [Docker Integration](/integrations/docker) - Containerized deployments
- [PostgreSQL Integration](/integrations/postgresql) - Database query logging
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy-compliant logging
