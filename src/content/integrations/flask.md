---
title: "Flask Application Logging Integration"
description: "Add structured logging to Flask apps with the LogTide Python SDK — request middleware, blueprint support, error handlers, and Gunicorn deployment."
category: "framework"
difficulty: "easy"
sdk: "python"
brandIcon: "simple-icons:flask"
highlights:
  - "Built-in request middleware"
  - "Blueprint-scoped logging"
  - "Error handler integration"
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
  - "flask blueprint logging"
faqs:
  - question: "How do I add structured request logging to a Flask application?"
    answer: "Install logtide-sdk[flask], create a LogTideClient with your API URL and key, then pass it to LogTideFlaskMiddleware along with your app instance. Every request and response is automatically logged with timing, status code, and trace ID, with no changes needed to individual route functions."
  - question: "Does LogTide work with the Flask app factory pattern?"
    answer: "Yes. Instantiate LogTideClient and register LogTideFlaskMiddleware inside your create_app function, then attach the client to app.logtide so blueprints can access it via current_app.logtide. The guide includes a complete example with blueprint registration and error handlers all wired inside create_app."
  - question: "Does adding LogTide middleware slow down Flask responses?"
    answer: "No measurably. The middleware overhead is under 1ms per request because log entries are batched and shipped in the background, not inline with the request/response cycle. The SDK also works correctly with Gunicorn gthread, gevent, and sync workers."
  - question: "Can I use LogTide alongside Python stdlib logging in Flask?"
    answer: "Yes. The SDK ships a LogTideHandler that you attach to any Python logger with addHandler. This lets you keep existing logging.getLogger calls and have their output forwarded to LogTide alongside the automatic request logs from LogTideFlaskMiddleware."
---

LogTide's Python SDK ships a built-in Flask middleware that auto-logs every request and response with timing, status code, and trace IDs. This guide covers the app factory pattern, blueprint-scoped logging, error handling, and production deployment with Gunicorn.

## Why use LogTide with Flask?

- **Built-in middleware**: `LogTideFlaskMiddleware` handles request/response logging automatically
- **App factory support**: Initialize inside `create_app()` for clean configuration
- **Blueprint logging**: Scoped logging per blueprint with independent service names
- **Error handlers**: Capture unhandled exceptions with full request context
- **Non-blocking**: Background batching keeps response latency unaffected
- **Gunicorn ready**: Works correctly with pre-fork workers

## Prerequisites

- Python 3.8+ (3.11+ recommended)
- Flask 2.0+
- LogTide instance with API key

## Installation

```bash
pip install logtide-sdk[flask]
```

## Quick Start

```python
# app.py
import os
from flask import Flask
from logtide_sdk import LogTideClient, ClientOptions
from logtide_sdk.middleware import LogTideFlaskMiddleware

app = Flask(__name__)

client = LogTideClient(
    ClientOptions(
        api_url=os.environ["LOGTIDE_API_URL"],
        api_key=os.environ["LOGTIDE_API_KEY"],
    )
)

LogTideFlaskMiddleware(
    app,
    client=client,
    service_name="flask-app",
    log_requests=True,
    log_responses=True,
    skip_paths=["/health", "/healthz", "/metrics"],
)

@app.route("/")
def index():
    return "Hello, World!"

if __name__ == "__main__":
    app.run()
```

### Environment Variables

```bash
export LOGTIDE_API_URL="http://your-logtide-instance:8080"
export LOGTIDE_API_KEY="lp_your_api_key_here"
flask run
```

## App Factory Pattern

Initialize LogTide inside `create_app()` for clean configuration:

```python
# app/__init__.py
import os
import atexit
from flask import Flask
from logtide_sdk import LogTideClient, ClientOptions
from logtide_sdk.middleware import LogTideFlaskMiddleware


def create_app(config_name=None):
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    # Initialize LogTide client
    client = LogTideClient(
        ClientOptions(
            api_url=app.config["LOGTIDE_API_URL"],
            api_key=app.config["LOGTIDE_API_KEY"],
            global_metadata={
                "environment": app.config.get("ENV", "development"),
                "version": app.config.get("APP_VERSION", "unknown"),
            },
        )
    )
    app.logtide = client

    # Register middleware
    LogTideFlaskMiddleware(
        app,
        client=client,
        service_name="flask-app",
        skip_paths=["/health", "/healthz"],
    )

    # Register blueprints
    from app.routes.api import api_bp
    from app.routes.auth import auth_bp
    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/auth")

    # Register error handlers
    register_error_handlers(app)

    # Graceful shutdown
    atexit.register(client.close)

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

## Request Logging Output

Each request automatically generates a structured log:

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
    "trace_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

## Error Handling

Register centralized error handlers that capture exceptions with full context:

```python
# app/errors.py
from flask import Flask, request, g, jsonify
from logtide_sdk import serialize_exception

def register_error_handlers(app: Flask):
    @app.errorhandler(404)
    def not_found(error):
        app.logtide.warn(
            "flask-app",
            "Resource not found",
            {"path": request.path, "method": request.method},
        )
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def internal_error(error):
        app.logtide.error(
            "flask-app",
            "Internal server error",
            serialize_exception(error),
        )
        return jsonify({"error": "Internal server error"}), 500

    @app.errorhandler(Exception)
    def unhandled_exception(error):
        app.logtide.error(
            "flask-app",
            f"Unhandled exception: {type(error).__name__}",
            error,
        )
        return jsonify({"error": "Internal server error"}), 500
```

## Blueprint Logging

Log directly in blueprint handlers with scoped service names:

```python
# app/routes/api.py
from flask import Blueprint, request, g, jsonify, current_app

api_bp = Blueprint("api", __name__)

@api_bp.route("/users/<int:user_id>")
def get_user(user_id):
    client = current_app.logtide
    client.info("api", "Fetching user profile", {"user_id": user_id})

    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict())

@api_bp.route("/users", methods=["POST"])
def create_user():
    client = current_app.logtide
    data = request.get_json()

    client.info("api", "Creating user", {"email": data.get("email")})

    try:
        user = User(email=data["email"], name=data["name"])
        db.session.add(user)
        db.session.commit()
        client.info("api", "User created", {"user_id": user.id})
        return jsonify(user.to_dict()), 201
    except IntegrityError:
        db.session.rollback()
        client.warn("api", "Duplicate email", {"email": data.get("email")})
        return jsonify({"error": "Email already exists"}), 409
```

## stdlib `logging` Integration

If you prefer to use Python's stdlib `logging`, use `LogTideHandler`:

```python
import logging
from logtide_sdk import LogTideHandler

handler = LogTideHandler(client=app.logtide, service="flask-app")
handler.setLevel(logging.WARNING)

logging.getLogger("app").addHandler(handler)
```

## Trace ID Context

Use context managers to correlate all logs within a request:

```python
@api_bp.route("/orders/<int:order_id>")
def process_order(order_id):
    client = current_app.logtide
    with client.with_new_trace_id():
        client.info("orders", "Processing order", {"order_id": order_id})
        # ... all logs inside this block share the same trace_id
```

## SQLAlchemy Query Logging

Log slow queries using SQLAlchemy event listeners:

```python
# app/extensions.py
import time
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event

db = SQLAlchemy()

def init_query_logging(app):
    engine = db.engine
    slow_threshold_ms = app.config.get("SLOW_QUERY_THRESHOLD_MS", 100)

    @event.listens_for(engine, "before_cursor_execute")
    def before_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("query_start_time", []).append(time.monotonic())

    @event.listens_for(engine, "after_cursor_execute")
    def after_execute(conn, cursor, statement, parameters, context, executemany):
        total_ms = (time.monotonic() - conn.info["query_start_time"].pop()) * 1000
        if total_ms >= slow_threshold_ms:
            app.logtide.warn(
                "database",
                "Slow SQL query",
                {"query": statement[:500], "duration_ms": round(total_ms, 2)},
            )
```

## Gunicorn Deployment

```python
# gunicorn.conf.py
import multiprocessing
import os

workers = int(os.environ.get("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "gthread"
threads = int(os.environ.get("GUNICORN_THREADS", 4))
timeout = 120
bind = "0.0.0.0:8000"

def worker_exit(server, worker):
    """Flush pending logs when a worker exits."""
    from app import create_app
    app = create_app()
    if hasattr(app, "logtide"):
        app.logtide.close()
```

```bash
gunicorn "app:create_app()" --config gunicorn.conf.py --preload
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
CMD ["gunicorn", "app:create_app()", "--config", "gunicorn.conf.py"]
```

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
| Middleware overhead | <1ms per request |
| Memory overhead | ~8MB |
| Network calls | 1 per batch (100 logs default) |
| Gunicorn worker compatibility | gthread, gevent, sync |

## Troubleshooting

### Logs not appearing

1. Enable debug mode to see what is happening:
   ```python
   ClientOptions(..., debug=True)
   ```
2. Ensure `client.close()` is called on shutdown (see Gunicorn section).
3. Check the circuit breaker state: `print(client.get_circuit_breaker_state())`

### Duplicate request logs

Ensure you have not registered the middleware twice (e.g., both manually and via an extension). Use `LogTideFlaskMiddleware` only once.

### SQLAlchemy events not firing

Call `init_query_logging(app)` after `db.init_app(app)` and inside an app context:

```python
with app.app_context():
    init_query_logging(app)
```

### Gunicorn workers losing logs

With the `--preload` flag, the client is shared across forked workers. Ensure each worker calls `client.close()` on exit via the `worker_exit` hook in `gunicorn.conf.py`.

## Next Steps

- [Python SDK Reference](/integrations/python/) - Full SDK documentation
- [Docker Integration](/integrations/docker/) - Container deployment patterns
- [PostgreSQL Integration](/integrations/postgresql/) - Database logging correlation
- [GDPR Compliance](/use-cases/gdpr-compliance/) - Privacy-compliant logging
- [Security Monitoring](/use-cases/security-monitoring/) - Threat detection and alerting
