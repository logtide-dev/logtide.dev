---
title: "Django Application Logging Integration"
description: "Add structured logging to Django applications with automatic request tracing, middleware integration, and async task support."
category: "framework"
difficulty: "easy"
sdk: "python"
brandIcon: "simple-icons:django"
highlights:
  - "Django middleware support"
  - "Request/response tracing"
  - "Celery task logging"
  - "Admin action audit trail"
relatedIntegrations:
  - "python"
  - "docker"
  - "postgresql"
relatedUseCases:
  - "gdpr-compliance"
  - "security-monitoring"
keywords:
  - "django logging"
  - "django structured logging"
  - "django middleware logging"
  - "django request tracing"
  - "django celery logging"
  - "django audit log"
---

LogTide's Python SDK integrates with Django's middleware system for automatic request logging, per-request context, and structured output. This guide covers middleware setup, Celery task logging, and admin audit trails.

## Why use LogTide with Django?

- **Middleware integration**: Automatic request/response logging with zero code changes in views
- **Per-request context**: Attach user, tenant, and trace IDs to all logs in a request lifecycle
- **Celery support**: Trace async tasks back to the originating request
- **Admin audit trail**: Log all Django admin actions with user and object context
- **Structlog ready**: Works with Django's logging config and structlog processors
- **Non-blocking**: Async batching keeps request latency unaffected

## Prerequisites

- Python 3.9+ (3.11+ recommended)
- Django 4.2+ (5.x supported)
- LogTide instance with API key

## Installation

```bash
pip install logtide
```

Or with your preferred package manager:

```bash
poetry add logtide
uv add logtide
```

## Quick Start

### 1. Configure Settings

```python
# settings.py
import os

LOGTIDE_API_URL = os.environ["LOGTIDE_API_URL"]
LOGTIDE_API_KEY = os.environ["LOGTIDE_API_KEY"]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "logtide.django.LogTideMiddleware",  # Add early in the chain
    # ... other middleware
    "django.middleware.common.CommonMiddleware",
]
```

### 2. Initialize the Client

```python
# settings.py (continued)
from logtide import LogTideClient

LOGTIDE_CLIENT = LogTideClient(
    api_url=LOGTIDE_API_URL,
    api_key=LOGTIDE_API_KEY,
    global_metadata={
        "environment": os.environ.get("DJANGO_ENV", "development"),
        "version": os.environ.get("APP_VERSION", "unknown"),
    },
    default_service="django-app",
)
```

### 3. Use in Views

```python
# views.py
from django.conf import settings

def user_profile(request, user_id):
    client = settings.LOGTIDE_CLIENT

    client.info("Viewing user profile", user_id=user_id, viewer=request.user.id)

    user = get_object_or_404(User, pk=user_id)
    return render(request, "profile.html", {"user": user})
```

## Middleware Configuration

### Request Logging Middleware

Create a middleware that logs every request with timing and context:

```python
# middleware/logging.py
import time
import uuid
from django.conf import settings

class LogTideMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.client = settings.LOGTIDE_CLIENT

    def __call__(self, request):
        # Generate trace ID
        request.trace_id = request.META.get(
            "HTTP_X_TRACE_ID",
            str(uuid.uuid4())
        )

        start_time = time.monotonic()
        response = self.get_response(request)
        duration_ms = (time.monotonic() - start_time) * 1000

        # Skip health checks and static files
        if request.path in ("/health", "/ready") or request.path.startswith("/static"):
            return response

        self.client.info(
            f"{request.method} {request.path} {response.status_code}",
            method=request.method,
            path=request.path,
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2),
            user_id=str(request.user.id) if request.user.is_authenticated else None,
            ip=self._get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            trace_id=request.trace_id,
        )

        # Pass trace ID to response
        response["X-Trace-Id"] = request.trace_id
        return response

    def process_exception(self, request, exception):
        self.client.error(
            f"Unhandled exception: {type(exception).__name__}",
            error=str(exception),
            error_type=type(exception).__name__,
            path=request.path,
            method=request.method,
            trace_id=getattr(request, "trace_id", "unknown"),
            user_id=str(request.user.id) if request.user.is_authenticated else None,
        )

    def _get_client_ip(self, request):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")
```

### Request Logging Output

Each request generates a structured log:

```json
{
  "level": "info",
  "message": "GET /api/users/123 200",
  "service": "django-app",
  "metadata": {
    "method": "GET",
    "path": "/api/users/123",
    "status_code": 200,
    "duration_ms": 34.5,
    "user_id": "42",
    "ip": "192.168.1.1",
    "trace_id": "abc123-def456"
  }
}
```

## Django REST Framework Integration

```python
# views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from django.conf import settings

class OrderView(APIView):
    def post(self, request):
        client = settings.LOGTIDE_CLIENT

        client.info(
            "Creating order",
            user_id=str(request.user.id),
            items=len(request.data.get("items", [])),
            trace_id=request.trace_id,
        )

        try:
            order = create_order(request.user, request.data)
            client.info(
                "Order created",
                order_id=str(order.id),
                total=float(order.total),
                trace_id=request.trace_id,
            )
            return Response({"id": order.id}, status=201)

        except InsufficientStockError as e:
            client.warning(
                "Order failed: insufficient stock",
                product_id=str(e.product_id),
                requested=e.requested,
                available=e.available,
                trace_id=request.trace_id,
            )
            return Response({"error": str(e)}, status=400)
```

## Celery Task Logging

### Configure Celery with LogTide

```python
# celery.py
import os
from celery import Celery
from celery.signals import task_prerun, task_postrun, task_failure
from logtide import LogTideClient

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "myproject.settings")

app = Celery("myproject")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

client = LogTideClient(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
    default_service="celery-worker",
)

@task_prerun.connect
def task_started(sender=None, task_id=None, args=None, kwargs=None, **kw):
    client.info(
        f"Task started: {sender.name}",
        task_id=task_id,
        task_name=sender.name,
    )

@task_postrun.connect
def task_completed(sender=None, task_id=None, retval=None, state=None, **kw):
    client.info(
        f"Task completed: {sender.name}",
        task_id=task_id,
        task_name=sender.name,
        state=state,
    )

@task_failure.connect
def task_failed(sender=None, task_id=None, exception=None, traceback=None, **kw):
    client.error(
        f"Task failed: {sender.name}",
        task_id=task_id,
        task_name=sender.name,
        error=str(exception),
        error_type=type(exception).__name__,
    )
```

### Propagate Trace Context to Tasks

```python
# tasks.py
from celery import shared_task

@shared_task(bind=True)
def process_order(self, order_id: int, trace_id: str = None):
    client = settings.LOGTIDE_CLIENT

    client.info(
        "Processing order",
        order_id=order_id,
        task_id=self.request.id,
        trace_id=trace_id,
    )

    order = Order.objects.get(pk=order_id)
    # ... process order ...

    client.info(
        "Order processed",
        order_id=order_id,
        trace_id=trace_id,
    )

# In your view, pass the trace ID
def create_order_view(request):
    order = Order.objects.create(...)
    process_order.delay(order.id, trace_id=request.trace_id)
    return JsonResponse({"id": order.id})
```

## Admin Audit Trail

Log all Django admin actions:

```python
# admin.py
from django.contrib import admin
from django.conf import settings

class AuditedModelAdmin(admin.ModelAdmin):
    def save_model(self, request, obj, form, change):
        action = "updated" if change else "created"
        settings.LOGTIDE_CLIENT.info(
            f"Admin {action} {obj.__class__.__name__}",
            action=action,
            model=obj.__class__.__name__,
            object_id=str(obj.pk),
            admin_user=request.user.username,
            changed_fields=list(form.changed_data) if change else [],
            ip=request.META.get("REMOTE_ADDR"),
        )
        super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        settings.LOGTIDE_CLIENT.warning(
            f"Admin deleted {obj.__class__.__name__}",
            action="deleted",
            model=obj.__class__.__name__,
            object_id=str(obj.pk),
            admin_user=request.user.username,
            ip=request.META.get("REMOTE_ADDR"),
        )
        super().delete_model(request, obj)
```

## Django Logging Integration

Bridge Django's built-in logging framework to LogTide:

```python
# settings.py
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "logtide": {
            "class": "logtide.integrations.logging.LogTideHandler",
            "api_url": LOGTIDE_API_URL,
            "api_key": LOGTIDE_API_KEY,
            "service": "django-app",
        },
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console", "logtide"],
            "level": "WARNING",
        },
        "django.request": {
            "handlers": ["logtide"],
            "level": "ERROR",
            "propagate": False,
        },
        "myapp": {
            "handlers": ["console", "logtide"],
            "level": "INFO",
        },
    },
}
```

## Docker Deployment

```yaml
# docker-compose.yml
services:
  web:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DJANGO_ENV=production
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
      - DATABASE_URL=postgres://user:pass@db:5432/myapp
    command: gunicorn myproject.wsgi:application --bind 0.0.0.0:8000 --workers 4
    depends_on:
      - db

  celery:
    build: .
    environment:
      - DJANGO_ENV=production
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
      - DATABASE_URL=postgres://user:pass@db:5432/myapp
    command: celery -A myproject worker -l info
    depends_on:
      - db
      - redis

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=myapp
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

## Graceful Shutdown

Ensure logs are flushed when Django stops:

```python
# apps.py
from django.apps import AppConfig
import atexit

class MyAppConfig(AppConfig):
    name = "myapp"

    def ready(self):
        from django.conf import settings
        atexit.register(settings.LOGTIDE_CLIENT.shutdown)
```

## Performance

| Metric | Value |
|--------|-------|
| Middleware overhead | <1ms per request |
| Memory overhead | ~10MB |
| Network calls | 1 per batch (100 logs) |
| Celery task overhead | <0.5ms |

## Troubleshooting

### Logs not appearing

1. Check middleware order — `LogTideMiddleware` should be early in the chain
2. Verify environment variables are set:
   ```python
   python -c "import os; print(os.environ.get('LOGTIDE_API_URL'))"
   ```
3. Ensure `shutdown()` is called on exit (see Graceful Shutdown section)

### Duplicate request logs

If you see duplicate logs, check that you don't have both the custom middleware and Django `LOGGING` handler capturing requests. Use one approach, not both.

### Celery tasks missing logs

Ensure the Celery worker process has access to the LogTide environment variables. Check with:

```bash
celery -A myproject inspect conf | grep LOGTIDE
```

## Next Steps

- [Python SDK Reference](/integrations/python) - Full SDK documentation
- [Docker Integration](/integrations/docker) - Container deployments
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy-compliant logging
- [Security Monitoring](/use-cases/security-monitoring) - Admin audit alerts
