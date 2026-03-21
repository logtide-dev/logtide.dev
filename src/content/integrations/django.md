---
title: "Django Application Logging Integration"
description: "Add structured logging to Django applications with the LogTide Python SDK — built-in middleware, Celery support, admin audit trail, and stdlib logging bridge."
category: "framework"
difficulty: "easy"
sdk: "python"
brandIcon: "simple-icons:django"
highlights:
  - "Built-in Django middleware"
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

LogTide's Python SDK ships a built-in Django middleware that hooks into Django's middleware system for automatic request logging, per-request context, and structured output. This guide covers middleware setup, Celery task logging, admin audit trails, and stdlib logging integration.

## Why use LogTide with Django?

- **Built-in middleware**: `LogTideDjangoMiddleware` handles request/response logging automatically
- **Per-request context**: Attach trace IDs to all logs in a request lifecycle
- **Celery support**: Trace async tasks back to the originating request
- **Admin audit trail**: Log all Django admin actions with user and object context
- **Stdlib logging bridge**: Use `LogTideHandler` with Django's `LOGGING` config
- **Non-blocking**: Background batching keeps request latency unaffected

## Prerequisites

- Python 3.8+ (3.11+ recommended)
- Django 3.2+
- LogTide instance with API key

## Installation

```bash
pip install logtide-sdk[django]
```

## Quick Start

### 1. Configure Settings

```python
# settings.py
import os
from logtide_sdk import LogTideClient, ClientOptions

LOGTIDE_CLIENT = LogTideClient(
    ClientOptions(
        api_url=os.environ["LOGTIDE_API_URL"],
        api_key=os.environ["LOGTIDE_API_KEY"],
        global_metadata={
            "environment": os.environ.get("DJANGO_ENV", "production"),
            "version": os.environ.get("APP_VERSION", "unknown"),
        },
    )
)

LOGTIDE_SERVICE_NAME = "django-app"

# Optional: paths to skip (health checks are skipped by default)
LOGTIDE_SKIP_PATHS = ["/health", "/healthz", "/metrics"]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "logtide_sdk.middleware.LogTideDjangoMiddleware",  # early in the chain
    # ... other middleware
    "django.middleware.common.CommonMiddleware",
]
```

### 2. Use in Views

```python
# views.py
from django.conf import settings
from django.shortcuts import get_object_or_404, render

def user_profile(request, user_id):
    client = settings.LOGTIDE_CLIENT

    client.info("django-app", "Viewing user profile", {"user_id": user_id})

    user = get_object_or_404(User, pk=user_id)
    return render(request, "profile.html", {"user": user})
```

### Environment Variables

```bash
export LOGTIDE_API_URL="http://your-logtide-instance:8080"
export LOGTIDE_API_KEY="lp_your_api_key_here"
```

## Request Logging Output

Each request automatically generates a structured log:

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
    "trace_id": "abc123-def456"
  }
}
```

## Trace ID Context

Use context managers to correlate all logs within a request:

```python
# views.py
from django.conf import settings
import uuid

def process_order(request, order_id):
    client = settings.LOGTIDE_CLIENT
    trace_id = request.META.get("HTTP_X_TRACE_ID", str(uuid.uuid4()))

    with client.with_trace_id(trace_id):
        client.info("orders", "Processing order", {"order_id": order_id})
        # ... all logs inside this block share the same trace_id
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
            "api",
            "Creating order",
            {"user_id": str(request.user.id), "items": len(request.data.get("items", []))},
        )

        try:
            order = create_order(request.user, request.data)
            client.info("api", "Order created", {"order_id": str(order.id)})
            return Response({"id": order.id}, status=201)

        except InsufficientStockError as e:
            client.warn(
                "api",
                "Order failed: insufficient stock",
                {"product_id": str(e.product_id), "requested": e.requested},
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

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "myproject.settings")

app = Celery("myproject")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

@task_prerun.connect
def task_started(sender=None, task_id=None, args=None, kwargs=None, **kw):
    from django.conf import settings
    settings.LOGTIDE_CLIENT.info(
        "celery",
        f"Task started: {sender.name}",
        {"task_id": task_id, "task_name": sender.name},
    )

@task_postrun.connect
def task_completed(sender=None, task_id=None, retval=None, state=None, **kw):
    from django.conf import settings
    settings.LOGTIDE_CLIENT.info(
        "celery",
        f"Task completed: {sender.name}",
        {"task_id": task_id, "task_name": sender.name, "state": state},
    )

@task_failure.connect
def task_failed(sender=None, task_id=None, exception=None, traceback=None, **kw):
    from django.conf import settings
    settings.LOGTIDE_CLIENT.error(
        "celery",
        f"Task failed: {sender.name}",
        exception,
    )
```

### Propagate Trace Context to Tasks

```python
# tasks.py
from celery import shared_task
from django.conf import settings

@shared_task(bind=True)
def process_order(self, order_id: int, trace_id: str = None):
    client = settings.LOGTIDE_CLIENT

    with client.with_trace_id(trace_id or self.request.id):
        client.info("celery", "Processing order", {"order_id": order_id})

        order = Order.objects.get(pk=order_id)
        # ... process order ...

        client.info("celery", "Order processed", {"order_id": order_id})


# In your view, pass the trace ID
def create_order_view(request):
    order = Order.objects.create(...)
    trace_id = request.META.get("HTTP_X_TRACE_ID", str(uuid.uuid4()))
    process_order.delay(order.id, trace_id=trace_id)
    return JsonResponse({"id": order.id})
```

## Admin Audit Trail

Log all Django admin actions with full context:

```python
# admin.py
from django.contrib import admin
from django.conf import settings

class AuditedModelAdmin(admin.ModelAdmin):
    def save_model(self, request, obj, form, change):
        action = "updated" if change else "created"
        settings.LOGTIDE_CLIENT.info(
            "admin",
            f"Admin {action} {obj.__class__.__name__}",
            {
                "action": action,
                "model": obj.__class__.__name__,
                "object_id": str(obj.pk),
                "admin_user": request.user.username,
                "changed_fields": list(form.changed_data) if change else [],
            },
        )
        super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        settings.LOGTIDE_CLIENT.warn(
            "admin",
            f"Admin deleted {obj.__class__.__name__}",
            {
                "action": "deleted",
                "model": obj.__class__.__name__,
                "object_id": str(obj.pk),
                "admin_user": request.user.username,
            },
        )
        super().delete_model(request, obj)
```

## stdlib `logging` Integration

Bridge Django's built-in logging framework to LogTide via `LogTideHandler`:

```python
# settings.py
from logtide_sdk import LogTideClient, ClientOptions, LogTideHandler
import logging

LOGTIDE_CLIENT = LogTideClient(ClientOptions(
    api_url=os.environ["LOGTIDE_API_URL"],
    api_key=os.environ["LOGTIDE_API_KEY"],
))

# Add handler programmatically
_handler = LogTideHandler(client=LOGTIDE_CLIENT, service="django-app")
_handler.setLevel(logging.WARNING)

logging.getLogger("django.request").addHandler(_handler)
logging.getLogger("myapp").addHandler(_handler)
```

Or via Django's `LOGGING` dict (requires a custom handler class in your codebase):

```python
# myapp/logging.py
from logtide_sdk import LogTideHandler as _LogTideHandler

class DjangoLogTideHandler(_LogTideHandler):
    """Wrapper so it can be referenced from LOGGING config."""
    pass
```

```python
# settings.py
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "logtide": {
            "()": "myapp.logging.DjangoLogTideHandler",
            "client": LOGTIDE_CLIENT,
            "service": "django-app",
            "level": "WARNING",
        },
        "console": {"class": "logging.StreamHandler"},
    },
    "loggers": {
        "django.request": {
            "handlers": ["logtide", "console"],
            "level": "ERROR",
            "propagate": False,
        },
        "myapp": {
            "handlers": ["logtide", "console"],
            "level": "INFO",
        },
    },
}
```

## Graceful Shutdown

Ensure logs are flushed when Django stops:

```python
# apps.py
import atexit
from django.apps import AppConfig

class MyAppConfig(AppConfig):
    name = "myapp"

    def ready(self):
        from django.conf import settings
        atexit.register(settings.LOGTIDE_CLIENT.close)
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
    command: celery -A myproject worker -l info
    depends_on:
      - db
      - redis

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=myapp
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass

  redis:
    image: redis:7-alpine
```

## Performance

| Metric | Value |
|--------|-------|
| Middleware overhead | <1ms per request |
| Memory overhead | ~10MB |
| Network calls | 1 per batch (100 logs default) |
| Celery task overhead | <0.5ms |

## Troubleshooting

### Logs not appearing

1. Enable debug mode: `ClientOptions(..., debug=True)`
2. Check middleware order — `LogTideDjangoMiddleware` should be near the top of `MIDDLEWARE`
3. Ensure `LOGTIDE_CLIENT.close()` is called on exit (see Graceful Shutdown section)
4. Check circuit breaker state: `print(settings.LOGTIDE_CLIENT.get_circuit_breaker_state())`

### Duplicate request logs

If you see duplicate logs, check that you are not capturing requests both via `LogTideDjangoMiddleware` and via the stdlib `LOGGING` config. Use one approach.

### Celery tasks missing logs

Ensure the Celery worker process has access to the LogTide environment variables:

```bash
celery -A myproject inspect conf
```

## Next Steps

- [Python SDK Reference](/integrations/python/) - Full SDK documentation
- [Docker Integration](/integrations/docker/) - Container deployments
- [GDPR Compliance](/use-cases/gdpr-compliance/) - Privacy-compliant logging
- [Security Monitoring](/use-cases/security-monitoring/) - Admin audit alerts
