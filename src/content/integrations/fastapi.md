---
title: "FastAPI Application Logging Integration"
description: "Add structured logging to FastAPI applications with async middleware, dependency injection, WebSocket support, and Uvicorn deployment."
category: "framework"
difficulty: "easy"
sdk: "python"
brandIcon: "simple-icons:fastapi"
highlights:
  - "Async middleware support"
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

LogTide's Python SDK integrates with FastAPI's async middleware, dependency injection system, and lifecycle events for automatic structured logging. This guide covers middleware setup, dependency-based logging, WebSocket tracing, background tasks, and production deployment with Uvicorn.

## Why use LogTide with FastAPI?

- **Async-native**: Non-blocking log shipping that matches FastAPI's async architecture
- **Dependency injection**: Inject a request-scoped logger into any endpoint via `Depends()`
- **Middleware integration**: Automatic request/response logging with timing and trace IDs
- **WebSocket support**: Log WebSocket connection lifecycle and message events
- **Background tasks**: Trace background task execution back to the originating request
- **OpenAPI aware**: Log route names and operation IDs for better searchability
- **Zero overhead**: Async batching keeps endpoint latency unaffected

## Prerequisites

- Python 3.9+ (3.11+ recommended for performance)
- FastAPI 0.100+ (0.115+ recommended)
- LogTide instance with API key

## Installation

```bash
pip install logtide fastapi uvicorn[standard]
```

Or with your preferred package manager:

```bash
poetry add logtide fastapi "uvicorn[standard]"
uv add logtide fastapi "uvicorn[standard]"
```

## Quick Start

### 1. Basic Setup

```python
# main.py
import os
from fastapi import FastAPI
from logtide import LogTideClient

app = FastAPI()

client = LogTideClient(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
    default_service="fastapi-app",
)

@app.get("/")
async def root():
    client.info("Homepage visited")
    return {"message": "Hello, World!"}

@app.on_event("shutdown")
async def shutdown():
    client.shutdown()
```

### 2. Set Environment Variables

```bash
export LOGTIDE_API_URL="https://your-logtide-instance.example.com"
export LOGTIDE_API_KEY="lp_your_api_key_here"
uvicorn main:app --reload
```

## Async Middleware

Create middleware that logs every request with timing, trace IDs, and user context:

```python
# middleware.py
import time
import uuid
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

class LogTideMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: FastAPI, logtide_client):
        super().__init__(app)
        self.client = logtide_client

    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate or extract trace ID
        trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4()))
        request.state.trace_id = trace_id

        start_time = time.monotonic()

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = (time.monotonic() - start_time) * 1000
            self.client.error(
                f"{request.method} {request.url.path} 500",
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_ms=round(duration_ms, 2),
                error=str(exc),
                error_type=type(exc).__name__,
                trace_id=trace_id,
                ip=self._get_client_ip(request),
            )
            raise

        duration_ms = (time.monotonic() - start_time) * 1000

        # Skip health checks and docs
        skip_paths = {"/health", "/ready", "/docs", "/openapi.json", "/redoc"}
        if request.url.path not in skip_paths:
            level = "info"
            if response.status_code >= 500:
                level = "error"
            elif response.status_code >= 400:
                level = "warning"

            self.client.log(
                level=level,
                message=f"{request.method} {request.url.path} {response.status_code}",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
                trace_id=trace_id,
                ip=self._get_client_ip(request),
                user_agent=request.headers.get("user-agent", ""),
                route=request.scope.get("route", {}).get("name", "unknown") if hasattr(request.scope.get("route", {}), "get") else "unknown",
            )

        response.headers["X-Trace-Id"] = trace_id
        return response

    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
```

### Register Middleware

```python
# main.py
from middleware import LogTideMiddleware

app = FastAPI(title="My API", version="1.0.0")

client = LogTideClient(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
    default_service="fastapi-app",
    global_metadata={
        "environment": os.environ.get("APP_ENV", "development"),
        "version": os.environ.get("APP_VERSION", "unknown"),
    },
)

app.add_middleware(LogTideMiddleware, logtide_client=client)
```

### Request Logging Output

Each request generates a structured log:

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
    "trace_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "ip": "192.168.1.1",
    "environment": "production"
  }
}
```

## Dependency Injection for Logging

Use FastAPI's dependency injection to provide a request-scoped logger:

```python
# dependencies.py
from fastapi import Request, Depends
from logtide import LogTideClient

class RequestLogger:
    """Request-scoped logger that automatically includes trace context."""

    def __init__(self, client: LogTideClient, trace_id: str, ip: str, path: str):
        self.client = client
        self.context = {
            "trace_id": trace_id,
            "ip": ip,
            "path": path,
        }

    def info(self, message: str, **kwargs):
        self.client.info(message, **self.context, **kwargs)

    def warning(self, message: str, **kwargs):
        self.client.warning(message, **self.context, **kwargs)

    def error(self, message: str, **kwargs):
        self.client.error(message, **self.context, **kwargs)

    def debug(self, message: str, **kwargs):
        self.client.debug(message, **self.context, **kwargs)

async def get_logger(request: Request) -> RequestLogger:
    return RequestLogger(
        client=request.app.state.logtide,
        trace_id=getattr(request.state, "trace_id", "unknown"),
        ip=request.client.host if request.client else "unknown",
        path=request.url.path,
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
    logger.info("Fetching user profile", user_id=user_id)

    user = await user_repository.get(user_id)
    if not user:
        logger.warning("User not found", user_id=user_id)
        raise HTTPException(status_code=404, detail="User not found")

    return user

@router.post("/")
async def create_user(data: CreateUserRequest, logger: RequestLogger = Depends(get_logger)):
    logger.info("Creating user", email=data.email)

    try:
        user = await user_repository.create(data)
        logger.info("User created successfully", user_id=user.id)
        return user
    except DuplicateEmailError:
        logger.warning("Duplicate email address", email=data.email)
        raise HTTPException(status_code=409, detail="Email already exists")
```

### Initialize Client on App State

```python
# main.py
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.logtide = LogTideClient(
        api_url=os.environ["LOGTIDE_API_URL"],
        api_key=os.environ["LOGTIDE_API_KEY"],
        default_service="fastapi-app",
    )
    yield
    # Shutdown
    app.state.logtide.shutdown()

app = FastAPI(lifespan=lifespan)
```

## Background Tasks Logging

Trace background tasks back to the originating request:

```python
# routes/orders.py
from fastapi import APIRouter, BackgroundTasks, Depends
from dependencies import RequestLogger, get_logger

router = APIRouter(prefix="/api/orders", tags=["orders"])

async def process_order_background(order_id: int, trace_id: str, client):
    """Background task that inherits the request trace ID."""
    client.info(
        "Processing order in background",
        order_id=order_id,
        trace_id=trace_id,
        task="process_order",
    )

    try:
        await charge_payment(order_id)
        await send_confirmation_email(order_id)
        client.info(
            "Order processed successfully",
            order_id=order_id,
            trace_id=trace_id,
            task="process_order",
        )
    except Exception as e:
        client.error(
            f"Order processing failed: {type(e).__name__}",
            order_id=order_id,
            trace_id=trace_id,
            error=str(e),
            task="process_order",
        )

@router.post("/")
async def create_order(
    data: CreateOrderRequest,
    background_tasks: BackgroundTasks,
    logger: RequestLogger = Depends(get_logger),
):
    logger.info("Creating order", items=len(data.items))

    order = await order_repository.create(data)
    logger.info("Order created, queuing background processing", order_id=order.id)

    # Pass trace_id to background task for correlation
    background_tasks.add_task(
        process_order_background,
        order_id=order.id,
        trace_id=logger.context["trace_id"],
        client=logger.client,
    )

    return {"id": order.id, "status": "processing"}
```

## WebSocket Logging

Log WebSocket connection lifecycle and message events:

```python
# routes/websocket.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import uuid

router = APIRouter()

@router.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str):
    client = websocket.app.state.logtide
    connection_id = str(uuid.uuid4())
    client_ip = websocket.client.host if websocket.client else "unknown"

    await websocket.accept()

    client.info(
        "WebSocket connected",
        connection_id=connection_id,
        channel=channel,
        ip=client_ip,
    )

    try:
        while True:
            data = await websocket.receive_text()

            client.debug(
                "WebSocket message received",
                connection_id=connection_id,
                channel=channel,
                message_size=len(data),
            )

            # Process and echo
            await websocket.send_text(f"Echo: {data}")

    except WebSocketDisconnect as e:
        client.info(
            "WebSocket disconnected",
            connection_id=connection_id,
            channel=channel,
            close_code=e.code,
            ip=client_ip,
        )
    except Exception as e:
        client.error(
            f"WebSocket error: {type(e).__name__}",
            connection_id=connection_id,
            channel=channel,
            error=str(e),
            ip=client_ip,
        )
```

## Exception Handlers

Register global exception handlers with structured logging:

```python
# exceptions.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

def register_exception_handlers(app: FastAPI):
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        trace_id = getattr(request.state, "trace_id", "unknown")

        app.state.logtide.error(
            f"Unhandled exception: {type(exc).__name__}",
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

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        trace_id = getattr(request.state, "trace_id", "unknown")

        app.state.logtide.warning(
            f"Validation error: {exc}",
            error=str(exc),
            path=request.url.path,
            method=request.method,
            trace_id=trace_id,
        )

        return JSONResponse(
            status_code=422,
            content={"detail": str(exc), "trace_id": trace_id},
        )
```

## Uvicorn Deployment

### Production Configuration

```python
# uvicorn_config.py
import os

host = "0.0.0.0"
port = int(os.environ.get("PORT", 8000))
workers = int(os.environ.get("WEB_WORKERS", 4))
loop = "uvloop"
http = "httptools"
log_level = "info"
access_log = True
```

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

### Dockerfile

```dockerfile
FROM python:3.12-slim AS base

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--loop", "uvloop"]
```

### Docker Compose

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
      - WEB_WORKERS=4
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=myapp
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

## Performance

| Metric | Value |
|--------|-------|
| Middleware overhead | <0.5ms per request |
| Memory overhead | ~8MB |
| Network calls | 1 per batch (100 logs) |
| WebSocket event overhead | <0.2ms per message |
| Background task overhead | <0.3ms |
| Uvicorn worker compatibility | uvloop, asyncio |

## Troubleshooting

### Logs not appearing

1. Check that environment variables are set correctly:
   ```bash
   python -c "import os; print(os.environ.get('LOGTIDE_API_URL'))"
   ```
2. Verify the lifespan handler is initializing the client on `app.state`
3. Ensure `shutdown()` is called during the lifespan teardown phase

### Middleware not capturing requests

Ensure the middleware is added **after** the app is created but **before** routes are included:

```python
app = FastAPI(lifespan=lifespan)
app.add_middleware(LogTideMiddleware, logtide_client=client)
app.include_router(users_router)
```

### Trace ID missing in background tasks

Background tasks run outside the request scope. Always pass `trace_id` explicitly as a function argument rather than relying on `request.state`.

### WebSocket logs flooding

For high-traffic WebSocket connections, log at the `debug` level for individual messages and use `info` only for connection/disconnection events. Adjust the LogTide client batch size accordingly.

## Next Steps

- [Python SDK Reference](/integrations/python/) - Full SDK documentation
- [Docker Integration](/integrations/docker/) - Container deployment patterns
- [PostgreSQL Integration](/integrations/postgresql/) - Database logging correlation
- [API Monitoring](/use-cases/api-monitoring/) - Endpoint performance tracking
- [Security Monitoring](/use-cases/security-monitoring/) - Threat detection and alerting
