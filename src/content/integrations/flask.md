---
title: "Flask Application Logging Integration"
description: "Add structured logging to Flask applications with request middleware, blueprint support, SQLAlchemy query logging, and Docker deployment."
category: "framework"
difficulty: "easy"
sdk: "python"
brandIcon: "simple-icons:flask"
highlights:
  - "Request logging middleware"
  - "Blueprint-scoped logging"
  - "SQLAlchemy query tracing"
  - "App factory pattern support"
relatedIntegrations:
  - "python"
  - "docker"
  - "postgresql"
relatedUseCases:
  - "gdpr-compliance"
  - "security-monitoring"
keywords:
  - "flask logging"
  - "flask structured logging"
  - "flask middleware logging"
  - "flask request tracing"
  - "flask sqlalchemy logging"
  - "flask blueprint logging"
---

LogTide's Python SDK integrates with Flask's request lifecycle for automatic structured logging, per-request context propagation, and SQLAlchemy query tracing. This guide covers the app factory pattern, blueprint-scoped logging, error handling, and production deployment with Gunicorn.

## Why use LogTide with Flask?

- **Request middleware**: Automatic request/response logging with timing, user context, and trace IDs
- **App factory support**: Initialize LogTide inside `create_app()` for clean configuration
- **Blueprint logging**: Scoped logging per blueprint with independent service names
- **SQLAlchemy tracing**: Log slow queries and ORM events with execution time
- **Error handlers**: Capture unhandled exceptions with full request context
- **Non-blocking**: Async batching keeps response latency unaffected
- **Gunicorn ready**: Works correctly with pre-fork workers and process recycling

## Prerequisites

- Python 3.9+ (3.11+ recommended)
- Flask 2.3+ (3.x supported)
- LogTide instance with API key

## Installation

```bash
pip install logtide flask
```

Or with your preferred package manager:

```bash
poetry add logtide flask
uv add logtide flask
```

## Quick Start

### 1. Basic Setup

```python
# app.py
import os
from flask import Flask
from logtide import LogTideClient

app = Flask(__name__)

client = LogTideClient(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
    default_service="flask-app",
)

@app.route("/")
def index():
    client.info("Homepage visited")
    return "Hello, World!"

if __name__ == "__main__":
    app.run()
```

### 2. Set Environment Variables

```bash
export LOGTIDE_API_URL="https://your-logtide-instance.example.com"
export LOGTIDE_API_KEY="lp_your_api_key_here"
flask run
```

## App Factory Pattern

For production Flask applications, initialize LogTide inside the app factory:

```python
# app/__init__.py
import os
from flask import Flask
from logtide import LogTideClient

logtide_client = None

def create_app(config_name=None):
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    # Initialize LogTide
    global logtide_client
    logtide_client = LogTideClient(
        api_url=app.config["LOGTIDE_API_URL"],
        api_key=app.config["LOGTIDE_API_KEY"],
        global_metadata={
            "environment": app.config.get("ENV", "development"),
            "version": app.config.get("APP_VERSION", "unknown"),
        },
        default_service="flask-app",
    )
    app.logtide = logtide_client

    # Register middleware
    register_middleware(app)

    # Register blueprints
    from app.routes.api import api_bp
    from app.routes.auth import auth_bp
    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/auth")

    # Register error handlers
    register_error_handlers(app)

    return app
```

### Configuration

```python
# config.py
import os

class Config:
    LOGTIDE_API_URL = os.environ.get("LOGTIDE_API_URL")
    LOGTIDE_API_KEY = os.environ.get("LOGTIDE_API_KEY")

class ProductionConfig(Config):
    ENV = "production"

class DevelopmentConfig(Config):
    ENV = "development"

def get_config(name=None):
    configs = {
        "production": ProductionConfig,
        "development": DevelopmentConfig,
    }
    return configs.get(name or os.environ.get("FLASK_ENV", "development"))
```

## Request Logging Middleware

Create middleware that logs every request with timing and context:

```python
# app/middleware.py
import time
import uuid
from flask import Flask, request, g

def register_middleware(app: Flask):
    @app.before_request
    def before_request():
        g.trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4()))
        g.start_time = time.monotonic()

    @app.after_request
    def after_request(response):
        # Skip health checks and static files
        if request.path in ("/health", "/ready") or request.path.startswith("/static"):
            return response

        duration_ms = (time.monotonic() - g.start_time) * 1000

        level = "info"
        if response.status_code >= 500:
            level = "error"
        elif response.status_code >= 400:
            level = "warning"

        app.logtide.log(
            level=level,
            message=f"{request.method} {request.path} {response.status_code}",
            method=request.method,
            path=request.path,
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2),
            user_id=getattr(g, "user_id", None),
            ip=get_client_ip(),
            user_agent=request.headers.get("User-Agent", ""),
            trace_id=g.trace_id,
            query_string=request.query_string.decode("utf-8") if request.query_string else None,
        )

        # Pass trace ID to response
        response.headers["X-Trace-Id"] = g.trace_id
        return response

def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr
```

### Request Logging Output

Each request generates a structured log:

```json
{
  "level": "info",
  "message": "GET /api/users/42 200",
  "service": "flask-app",
  "metadata": {
    "method": "GET",
    "path": "/api/users/42",
    "status_code": 200,
    "duration_ms": 18.3,
    "user_id": "42",
    "ip": "192.168.1.1",
    "trace_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

## Error Handling

Register centralized error handlers that capture exceptions with full context:

```python
# app/errors.py
from flask import Flask, request, g, jsonify

def register_error_handlers(app: Flask):
    @app.errorhandler(404)
    def not_found(error):
        app.logtide.warning(
            "Resource not found",
            path=request.path,
            method=request.method,
            ip=request.remote_addr,
            trace_id=getattr(g, "trace_id", "unknown"),
        )
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def internal_error(error):
        app.logtide.error(
            f"Internal server error: {error}",
            error=str(error),
            error_type=type(error).__name__,
            path=request.path,
            method=request.method,
            trace_id=getattr(g, "trace_id", "unknown"),
            user_id=getattr(g, "user_id", None),
        )
        return jsonify({"error": "Internal server error"}), 500

    @app.errorhandler(Exception)
    def unhandled_exception(error):
        app.logtide.error(
            f"Unhandled exception: {type(error).__name__}",
            error=str(error),
            error_type=type(error).__name__,
            path=request.path,
            method=request.method,
            trace_id=getattr(g, "trace_id", "unknown"),
            user_id=getattr(g, "user_id", None),
        )
        return jsonify({"error": "Internal server error"}), 500
```

## Blueprint Logging

Scope logs per blueprint to separate concerns in larger applications:

```python
# app/routes/api.py
from flask import Blueprint, request, g, jsonify, current_app

api_bp = Blueprint("api", __name__)

@api_bp.route("/users/<int:user_id>")
def get_user(user_id):
    logtide = current_app.logtide

    logtide.info(
        "Fetching user profile",
        user_id=user_id,
        trace_id=g.trace_id,
        blueprint="api",
    )

    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict())

@api_bp.route("/users", methods=["POST"])
def create_user():
    logtide = current_app.logtide
    data = request.get_json()

    logtide.info(
        "Creating user",
        email=data.get("email"),
        trace_id=g.trace_id,
        blueprint="api",
    )

    try:
        user = User(email=data["email"], name=data["name"])
        db.session.add(user)
        db.session.commit()

        logtide.info(
            "User created successfully",
            user_id=user.id,
            trace_id=g.trace_id,
            blueprint="api",
        )
        return jsonify(user.to_dict()), 201

    except IntegrityError:
        db.session.rollback()
        logtide.warning(
            "Duplicate user email",
            email=data.get("email"),
            trace_id=g.trace_id,
            blueprint="api",
        )
        return jsonify({"error": "Email already exists"}), 409
```

```python
# app/routes/auth.py
from flask import Blueprint, request, g, jsonify, current_app

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/login", methods=["POST"])
def login():
    logtide = current_app.logtide
    data = request.get_json()

    user = User.query.filter_by(email=data.get("email")).first()

    if user and user.check_password(data.get("password")):
        logtide.info(
            "User logged in",
            user_id=user.id,
            ip=request.remote_addr,
            trace_id=g.trace_id,
            blueprint="auth",
        )
        token = generate_token(user)
        return jsonify({"token": token})

    logtide.warning(
        "Failed login attempt",
        email=data.get("email"),
        ip=request.remote_addr,
        trace_id=g.trace_id,
        blueprint="auth",
    )
    return jsonify({"error": "Invalid credentials"}), 401
```

## SQLAlchemy Query Logging

Log slow queries and database events using SQLAlchemy event listeners:

```python
# app/extensions.py
import time
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event

db = SQLAlchemy()

def init_query_logging(app):
    engine = db.engine
    slow_query_threshold_ms = app.config.get("SLOW_QUERY_THRESHOLD_MS", 100)

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("query_start_time", []).append(time.monotonic())

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        total_ms = (time.monotonic() - conn.info["query_start_time"].pop()) * 1000

        if total_ms >= slow_query_threshold_ms:
            app.logtide.warning(
                "Slow SQL query detected",
                query=statement[:500],
                duration_ms=round(total_ms, 2),
                threshold_ms=slow_query_threshold_ms,
            )
        else:
            app.logtide.debug(
                "SQL query executed",
                query=statement[:200],
                duration_ms=round(total_ms, 2),
            )
```

### Usage in App Factory

```python
# app/__init__.py (add to create_app)
from app.extensions import db, init_query_logging

def create_app(config_name=None):
    app = Flask(__name__)
    # ... previous setup ...

    db.init_app(app)

    with app.app_context():
        init_query_logging(app)

    return app
```

## Authentication Middleware

Add user context to all logs from authenticated requests:

```python
# app/auth_middleware.py
from functools import wraps
from flask import request, g, jsonify, current_app
import jwt

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")

        if not token:
            current_app.logtide.warning(
                "Missing authentication token",
                path=request.path,
                ip=request.remote_addr,
                trace_id=g.trace_id,
            )
            return jsonify({"error": "Unauthorized"}), 401

        try:
            payload = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
            g.user_id = payload["sub"]
            g.user_role = payload.get("role", "user")
        except jwt.ExpiredSignatureError:
            current_app.logtide.warning(
                "Expired authentication token",
                path=request.path,
                ip=request.remote_addr,
                trace_id=g.trace_id,
            )
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            current_app.logtide.warning(
                "Invalid authentication token",
                path=request.path,
                ip=request.remote_addr,
                trace_id=g.trace_id,
            )
            return jsonify({"error": "Invalid token"}), 401

        return f(*args, **kwargs)
    return decorated
```

## Gunicorn Deployment

### Gunicorn Configuration

```python
# gunicorn.conf.py
import multiprocessing
import os

# Worker settings
workers = int(os.environ.get("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "gthread"
threads = int(os.environ.get("GUNICORN_THREADS", 4))
timeout = 120
keepalive = 5

# Binding
bind = "0.0.0.0:8000"

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Lifecycle hooks
def on_starting(server):
    """Called just before the master process is initialized."""
    pass

def post_fork(server, worker):
    """Called just after a worker has been forked."""
    server.log.info(f"Worker spawned (pid: {worker.pid})")

def worker_exit(server, worker):
    """Called when a worker exits. Flush pending logs."""
    from app import logtide_client
    if logtide_client:
        logtide_client.shutdown()
```

### Run with Gunicorn

```bash
gunicorn "app:create_app()" \
    --config gunicorn.conf.py \
    --preload
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

CMD ["gunicorn", "app:create_app()", "--config", "gunicorn.conf.py"]
```

### Docker Compose

```yaml
# docker-compose.yml
services:
  web:
    build: .
    ports:
      - "8000:8000"
    environment:
      - FLASK_ENV=production
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
      - DATABASE_URL=postgresql://user:pass@db:5432/myapp
      - SECRET_KEY=${SECRET_KEY}
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

## Graceful Shutdown

Ensure logs are flushed when the application stops:

```python
# app/__init__.py (add to create_app)
import atexit
import signal

def create_app(config_name=None):
    # ... previous setup ...

    def shutdown_handler(*args):
        if logtide_client:
            logtide_client.shutdown()

    atexit.register(shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    return app
```

## Performance

| Metric | Value |
|--------|-------|
| Middleware overhead | <1ms per request |
| Memory overhead | ~8MB |
| Network calls | 1 per batch (100 logs) |
| SQLAlchemy event overhead | <0.3ms per query |
| Gunicorn worker compatibility | gthread, gevent, sync |

## Troubleshooting

### Logs not appearing

1. Check that environment variables are set correctly:
   ```bash
   python -c "import os; print(os.environ.get('LOGTIDE_API_URL'))"
   ```
2. Verify the LogTide client is initialized inside the app factory, not at module level in production
3. Ensure `shutdown()` is called on exit (see Graceful Shutdown section)

### Duplicate request logs

If you see duplicate logs, check that you have not registered the middleware both manually and through a Flask extension. Use one approach.

### SQLAlchemy events not firing

Ensure `init_query_logging(app)` is called after `db.init_app(app)` and inside an app context:

```python
with app.app_context():
    init_query_logging(app)
```

### Gunicorn workers losing logs

With the `preload` flag, the LogTide client is shared across forked workers. If workers are recycled (`max-requests`), ensure each new worker re-initializes the client or use the `post_fork` hook.

## Next Steps

- [Python SDK Reference](/integrations/python/) - Full SDK documentation
- [Docker Integration](/integrations/docker/) - Container deployment patterns
- [PostgreSQL Integration](/integrations/postgresql/) - Database logging correlation
- [GDPR Compliance](/use-cases/gdpr-compliance/) - Privacy-compliant logging
- [Security Monitoring](/use-cases/security-monitoring/) - Threat detection and alerting
