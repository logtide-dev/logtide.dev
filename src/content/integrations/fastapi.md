---
title: "FastAPI Application Logging Integration"
description: "Add structured logging to FastAPI applications with the LogTide Python SDK — built-in async middleware, dependency injection, WebSocket support, and Uvicorn deployment."
category: "framework"
difficulty: "easy"
sdk: "python"
brandIcon: "simple-icons:fastapi"
highlights:
  - "Built-in async middleware"
  - "Dependency injection logging"
  - "WebSocket event tracing"
  - "Background task logging"
relatedIntegrations:
  - "python"
  - "docker"
  - "postgresql"
relatedUseCases:
  - "api-monitoring"
  - "security-monitoring"
keywords:
  - "fastapi logging"
  - "fastapi structured logging"
  - "fastapi middleware"
  - "fastapi request tracing"
  - "fastapi websocket logging"
  - "fastapi async logging"
---

LogTide's Python SDK ships a built-in FastAPI/Starlette middleware for automatic structured logging with timing and trace IDs. This guide covers middleware setup, dependency-based logging, WebSocket tracing, background tasks, and production deployment with Uvicorn.

## Why use LogTide with FastAPI?

- **Built-in async middleware**: `LogTideFastAPIMiddleware` handles request/response logging automatically
- **Async-native**: Uses `AsyncLogTideClient` for non-blocking log shipping
- **Dependency injection**: Inject a request-scoped logger into any endpoint via `Depends()`
- **WebSocket support**: Log WebSocket connection lifecycle and message events
- **Background tasks**: Trace background task execution back to the originating request
- **Zero overhead**: Background batching keeps endpoint latency unaffected

## Prerequisites

- Python 3.8+ (3.11+ recommended for performance)
- FastAPI 0.100+
- LogTide instance with API key

## Installation

```bash
pip install logtide-sdk[fastapi]
```

For the async client:

```bash
pip install logtide-sdk[fastapi,async]
```

## Quick Start

```python
# main.py
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from logtide_sdk import LogTideClient, ClientOptions
from logtide_sdk.middleware import LogTideFastAPIMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    client = LogTideClient(
        ClientOptions(
            api_url=os.environ["LOGTIDE_API_URL"],
            api_key=os.environ["LOGTIDE_API_KEY"],
            global_metadata={
                "environment": os.environ.get("APP_ENV", "production"),
                "version": os.environ.get("APP_VERSION", "unknown"),
            },
        )
    )
    app.state.logtide = client
    yield
    # Shutdown
    client.close()


app = FastAPI(title="My API", lifespan=lifespan)

app.add_middleware(LogTideFastAPIMiddleware, client=app.state.logtide, service_name="fastapi-app")


@app.get("/")
async def root():
    return {"message": "Hello, World!"}
```

> **Note**: Because `app.state.logtide` is not available at module load time, pass the client to the middleware inside the lifespan startup or use a factory function.

### Simpler Setup (Sync Client)

```python
import os
from fastapi import FastAPI
from logtide_sdk import LogTideClient, ClientOptions
from logtide_sdk.middleware import LogTideFastAPIMiddleware

app = FastAPI()
client = LogTideClient(ClientOptions(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
))

app.add_middleware(LogTideFastAPIMiddleware, client=client, service_name="fastapi-app")
```

### Environment Variables

```bash
export LOGTIDE_API_URL="http://your-logtide-instance:8080"
export LOGTIDE_API_KEY="lp_your_api_key_here"
uvicorn main:app --reload
```

## Request Logging Output

Each request automatically generates a structured log:

```json
{
  "level": "info",
  "message": "GET /api/users/42 200",
  "service": "fastapi-app",
  "metadata": {
    "method": "GET",
    "path": "/api/users/42",
    "status_code": 200,
    "duration_ms": 12.4,
    "trace_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

## Dependency Injection for Logging

Use FastAPI's dependency injection to provide a request-scoped logger with automatic trace context:

```python
# dependencies.py
from fastapi import Request, Depends
from logtide_sdk import LogTideClient


class RequestLogger:
    """Request-scoped logger that automatically includes trace context."""

    def __init__(self, client: LogTideClient, trace_id: str, service: str = "api"):
        self.client = client
        self._service = service
        self._trace_id = trace_id

    def info(self, message: str, metadata: dict = None):
        self.client.info(self._service, message, {**(metadata or {}), "trace_id": self._trace_id})

    def warn(self, message: str, metadata: dict = None):
        self.client.warn(self._service, message, {**(metadata or {}), "trace_id": self._trace_id})

    def error(self, message: str, metadata=None):
        self.client.error(self._service, message, metadata or {"trace_id": self._trace_id})

    def debug(self, message: str, metadata: dict = None):
        self.client.debug(self._service, message, {**(metadata or {}), "trace_id": self._trace_id})


async def get_logger(request: Request) -> RequestLogger:
    return RequestLogger(
        client=request.app.state.logtide,
        trace_id=request.headers.get("X-Trace-ID", "unknown"),
    )
```

### Using the Dependency in Routes

```python
# routes/users.py
from fastapi import APIRouter, Depends, HTTPException
from dependencies import RequestLogger, get_logger

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/{user_id}")
async def get_user(user_id: int, logger: RequestLogger = Depends(get_logger)):
    logger.info("Fetching user profile", {"user_id": user_id})

    user = await user_repository.get(user_id)
    if not user:
        logger.warn("User not found", {"user_id": user_id})
        raise HTTPException(status_code=404, detail="User not found")

    return user

@router.post("/")
async def create_user(data: CreateUserRequest, logger: RequestLogger = Depends(get_logger)):
    logger.info("Creating user", {"email": data.email})

    try:
        user = await user_repository.create(data)
        logger.info("User created", {"user_id": user.id})
        return user
    except DuplicateEmailError:
        logger.warn("Duplicate email", {"email": data.email})
        raise HTTPException(status_code=409, detail="Email already exists")
```

## Background Tasks Logging

Trace background tasks back to the originating request by passing the trace ID explicitly:

```python
# routes/orders.py
from fastapi import APIRouter, BackgroundTasks, Depends, Request
from logtide_sdk import LogTideClient

router = APIRouter(prefix="/api/orders", tags=["orders"])

async def process_order_background(order_id: int, trace_id: str, client: LogTideClient):
    with client.with_trace_id(trace_id):
        client.info("worker", "Processing order", {"order_id": order_id})
        try:
            await charge_payment(order_id)
            await send_confirmation_email(order_id)
            client.info("worker", "Order processed", {"order_id": order_id})
        except Exception as e:
            client.error("worker", "Order processing failed", e)


@router.post("/")
async def create_order(
    data: CreateOrderRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    client = request.app.state.logtide
    trace_id = request.headers.get("X-Trace-ID", "unknown")

    order = await order_repository.create(data)
    client.info("api", "Order created, queuing processing", {"order_id": order.id, "trace_id": trace_id})

    # Pass trace_id explicitly — background tasks run outside the request scope
    background_tasks.add_task(process_order_background, order.id, trace_id, client)

    return {"id": order.id, "status": "processing"}
```

## WebSocket Logging

Log WebSocket connection lifecycle and message events:

```python
# routes/websocket.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
import uuid

router = APIRouter()

@router.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str):
    client = websocket.app.state.logtide
    connection_id = str(uuid.uuid4())

    await websocket.accept()
    client.info("websocket", "Connection opened", {"connection_id": connection_id, "channel": channel})

    try:
        while True:
            data = await websocket.receive_text()
            client.debug("websocket", "Message received", {
                "connection_id": connection_id,
                "channel": channel,
                "size": len(data),
            })
            await websocket.send_text(f"Echo: {data}")

    except WebSocketDisconnect as e:
        client.info("websocket", "Connection closed", {
            "connection_id": connection_id,
            "channel": channel,
            "close_code": e.code,
        })
    except Exception as e:
        client.error("websocket", "Connection error", e)
```

## Exception Handlers

Register global exception handlers with structured logging:

```python
# main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from logtide_sdk import serialize_exception

def register_exception_handlers(app: FastAPI):
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        trace_id = request.headers.get("X-Trace-ID", "unknown")
        app.state.logtide.error(
            "api",
            f"Unhandled exception: {type(exc).__name__}",
            {**serialize_exception(exc), "path": request.url.path, "trace_id": trace_id},
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "trace_id": trace_id},
        )
```

## Async Client (High-Throughput)

For maximum async performance, use `AsyncLogTideClient`:

```python
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from logtide_sdk import AsyncLogTideClient, ClientOptions
from logtide_sdk.middleware import LogTideFastAPIMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncLogTideClient(ClientOptions(
        api_url=os.environ["LOGTIDE_API_URL"],
        api_key=os.environ["LOGTIDE_API_KEY"],
    )) as client:
        app.state.logtide = client
        yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(LogTideFastAPIMiddleware, client=..., service_name="fastapi-app")
```

## Uvicorn Deployment

### Run with Uvicorn

```bash
# Development
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 4 \
    --loop uvloop \
    --http httptools \
    --no-access-log
```

## Docker Deployment

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - APP_ENV=production
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
      - DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/myapp
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=myapp
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5
```

## Performance

| Metric | Value |
|--------|-------|
| Middleware overhead | <0.5ms per request |
| Memory overhead | ~8MB |
| Network calls | 1 per batch (100 logs default) |
| WebSocket event overhead | <0.2ms per message |
| Uvicorn worker compatibility | uvloop, asyncio |

## Troubleshooting

### Logs not appearing

1. Enable debug mode: `ClientOptions(..., debug=True)`
2. Verify the lifespan handler initializes the client before routes are called
3. Check circuit breaker state: `print(app.state.logtide.get_circuit_breaker_state())`

### Middleware not capturing requests

Add the middleware **after** creating the `FastAPI` instance but **before** including routers:

```python
app = FastAPI(lifespan=lifespan)
app.add_middleware(LogTideFastAPIMiddleware, client=client, service_name="fastapi-app")
app.include_router(users_router)
```

### Trace ID missing in background tasks

Background tasks run outside the request scope. Always pass `trace_id` explicitly:

```python
background_tasks.add_task(my_task, trace_id=request.headers.get("X-Trace-ID"))
```

### WebSocket logs flooding

For high-traffic WebSocket connections, use `debug` level for individual messages and `info` only for connection events. Set `debug=False` in production `ClientOptions`.

## Next Steps

- [Python SDK Reference](/integrations/python/) - Full SDK documentation
- [Docker Integration](/integrations/docker/) - Container deployment patterns
- [PostgreSQL Integration](/integrations/postgresql/) - Database logging correlation
- [API Monitoring](/use-cases/api-monitoring/) - Endpoint performance tracking
- [Security Monitoring](/use-cases/security-monitoring/) - Threat detection and alerting
