---
title: "Docker Compose Logging Integration"
description: "Centralized logging for Docker Compose stacks using Fluent Bit to collect and ship logs from all services to LogTide."
category: "container"
difficulty: "easy"
brandIcon: "simple-icons:docker"
highlights:
  - "Zero code changes"
  - "Service auto-tagging"
  - "Multi-container support"
  - "Production-ready config"
relatedIntegrations:
  - "docker"
  - "nginx"
  - "nodejs"
  - "python"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "docker compose logging"
  - "compose centralized logs"
  - "docker compose fluent bit"
  - "multi-container logging"
  - "docker stack logging"
  - "container log aggregation"
---

Docker Compose makes it easy to run multi-container applications, but logs are scattered across containers. This guide shows you how to centralize all your Docker Compose logs in LogTide without modifying your application code.

## Why centralize Docker Compose logs?

- **Zero code changes**: Collect logs from any container without SDK integration
- **Automatic service tagging**: Logs are tagged with service name, container ID, and compose project
- **Unified view**: See all your services' logs in one place
- **Persistent logging**: Logs survive container restarts and redeployments
- **Production-ready**: Battle-tested configuration for high-volume logging

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2 (comes with Docker Desktop)
- LogTide instance with API key
- Basic understanding of Docker Compose

## Quick Start (5 minutes)

Here's a minimal working example with nginx and a Node.js app:

### docker-compose.yml

```yaml
services:
  # Your application services
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: "docker.{{.Name}}"
    depends_on:
      - fluent-bit
      - app

  app:
    build: .
    environment:
      - NODE_ENV=production
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: "docker.{{.Name}}"
    depends_on:
      - fluent-bit

  # Log collector
  fluent-bit:
    image: fluent/fluent-bit:latest
    volumes:
      - ./fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
    ports:
      - "24224:24224"
    environment:
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
```

### fluent-bit.conf

```ini
[SERVICE]
    Flush         1
    Log_Level     info
    Daemon        off
    Parsers_File  parsers.conf

[INPUT]
    Name          forward
    Listen        0.0.0.0
    Port          24224

[FILTER]
    Name          record_modifier
    Match         docker.*
    Record        hostname ${HOSTNAME}
    Record        environment production

[OUTPUT]
    Name          http
    Match         *
    Host          ${LOGTIDE_API_URL}
    Port          443
    URI           /api/v1/ingest/single
    Format        json
    Header        X-API-Key ${LOGTIDE_API_KEY}
    Header        Content-Type application/json
    tls           On
    tls.verify    On
```

### Start the Stack

```bash
# Set environment variables
export LOGTIDE_API_URL=api.logtide.dev
export LOGTIDE_API_KEY=your-api-key

# Start all services
docker compose up -d

# Check logs are flowing
docker compose logs fluent-bit
```

## Production Configuration

For production deployments, use this enhanced configuration:

### docker-compose.production.yml

```yaml
services:
  # Reverse proxy
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: "{{.Name}}"
        fluentd-async: "true"
        fluentd-buffer-limit: "1048576"
    depends_on:
      fluent-bit:
        condition: service_healthy
    networks:
      - frontend
      - backend

  # Application
  app:
    build:
      context: .
      dockerfile: Dockerfile.production
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@postgres:5432/app
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: "{{.Name}}"
        fluentd-async: "true"
    depends_on:
      fluent-bit:
        condition: service_healthy
      postgres:
        condition: service_healthy
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    networks:
      - backend

  # Background worker
  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    restart: unless-stopped
    environment:
      - QUEUE_URL=redis://redis:6379
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: "{{.Name}}"
        fluentd-async: "true"
    depends_on:
      - fluent-bit
      - redis
    networks:
      - backend

  # Database
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
      - POSTGRES_DB=app
    volumes:
      - postgres_data:/var/lib/postgresql/data
    secrets:
      - db_password
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: "{{.Name}}"
        fluentd-async: "true"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d app"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  # Cache
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: "{{.Name}}"
        fluentd-async: "true"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  # Log collector
  fluent-bit:
    image: fluent/fluent-bit:latest
    restart: unless-stopped
    volumes:
      - ./config/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
      - ./config/parsers.conf:/fluent-bit/etc/parsers.conf:ro
      - fluent_buffer:/var/log/fluent-bit
    ports:
      - "24224:24224"
    environment:
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
      - COMPOSE_PROJECT=${COMPOSE_PROJECT_NAME:-myapp}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:2020/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - frontend
      - backend

networks:
  frontend:
  backend:

volumes:
  postgres_data:
  redis_data:
  fluent_buffer:

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### Production Fluent Bit Configuration

```ini
# config/fluent-bit.conf
[SERVICE]
    Flush             5
    Grace             30
    Log_Level         info
    Daemon            off
    Parsers_File      parsers.conf
    HTTP_Server       On
    HTTP_Listen       0.0.0.0
    HTTP_Port         2020
    Health_Check      On
    HC_Errors_Count   5
    HC_Retry_Failure_Count  5
    HC_Period         60
    storage.path      /var/log/fluent-bit/
    storage.sync      normal
    storage.checksum  off
    storage.backlog.mem_limit 50M

[INPUT]
    Name              forward
    Listen            0.0.0.0
    Port              24224
    Buffer_Chunk_Size 1M
    Buffer_Max_Size   6M

# Parse JSON logs from applications
[FILTER]
    Name              parser
    Match             *
    Key_Name          log
    Parser            docker_json
    Reserve_Data      On
    Preserve_Key      Off

# Add metadata
[FILTER]
    Name              record_modifier
    Match             *
    Record            project ${COMPOSE_PROJECT}
    Record            environment production

# Extract service name from container name
[FILTER]
    Name              lua
    Match             *
    script            /fluent-bit/etc/extract_service.lua
    call              extract_service

# Retry on failure with exponential backoff
[OUTPUT]
    Name              http
    Match             *
    Host              ${LOGTIDE_API_URL}
    Port              443
    URI               /api/v1/ingest/single
    Format            json
    Header            X-API-Key ${LOGTIDE_API_KEY}
    Header            Content-Type application/json
    tls               On
    tls.verify        On
    Retry_Limit       5
    storage.total_limit_size  100M
```

### Lua Script for Service Extraction

```lua
-- config/extract_service.lua
function extract_service(tag, timestamp, record)
    -- Container name format: project-service-1
    local container = record["container_name"] or ""
    local service = container:match("^[^-]+-([^-]+)")
    if service then
        record["service"] = service
    end
    return 1, timestamp, record
end
```

### Parsers Configuration

```ini
# config/parsers.conf
[PARSER]
    Name        docker_json
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L
    Time_Keep   On

[PARSER]
    Name        nginx_access
    Format      regex
    Regex       ^(?<remote>[^ ]*) - (?<user>[^ ]*) \[(?<time>[^\]]*)\] "(?<method>\S+)(?: +(?<path>[^"]*) +\S*)?" (?<code>[^ ]*) (?<size>[^ ]*)(?: "(?<referer>[^"]*)" "(?<agent>[^"]*)")?$
    Time_Key    time
    Time_Format %d/%b/%Y:%H:%M:%S %z

[PARSER]
    Name        postgres
    Format      regex
    Regex       ^(?<time>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \w+) \[(?<pid>\d+)\] (?<level>\w+):  (?<message>.*)$
    Time_Key    time
    Time_Format %Y-%m-%d %H:%M:%S.%L %Z
```

## Logging Driver Options

The fluentd logging driver supports several useful options:

```yaml
logging:
  driver: fluentd
  options:
    # Fluent Bit address
    fluentd-address: localhost:24224

    # Tag for routing
    tag: "{{.Name}}"  # or "docker.{{.ImageName}}.{{.ID}}"

    # Async mode (recommended for production)
    fluentd-async: "true"

    # Buffer settings
    fluentd-buffer-limit: "1048576"  # 1MB buffer
    fluentd-retry-wait: "1s"
    fluentd-max-retries: "3"

    # Sub-second precision
    fluentd-sub-second-precision: "true"
```

### Available Tag Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{.ID}}` | Container ID (12 chars) | `abc123def456` |
| `{{.FullID}}` | Full container ID | `abc123...xyz` |
| `{{.Name}}` | Container name | `myapp-web-1` |
| `{{.ImageID}}` | Image ID | `sha256:abc...` |
| `{{.ImageName}}` | Image name | `nginx:alpine` |
| `{{.ImageFullID}}` | Full image ID | `sha256:abc...xyz` |
| `{{.DaemonName}}` | Docker daemon name | `docker` |

## Handling JSON Logs

If your applications output JSON logs, configure Fluent Bit to parse them:

### Application Outputting JSON

```javascript
// app.js
const log = (level, message, data = {}) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data
  }));
};

log('info', 'Server started', { port: 3000 });
log('error', 'Database connection failed', { error: 'timeout' });
```

### Fluent Bit Parser Filter

```ini
[FILTER]
    Name          parser
    Match         myapp-app-*
    Key_Name      log
    Parser        docker_json
    Reserve_Data  On
    Preserve_Key  Off
```

This extracts JSON fields from the `log` key and merges them into the record.

## Multiple Environments

Use Compose profiles for different environments:

### docker-compose.yml

```yaml
services:
  fluent-bit:
    image: fluent/fluent-bit:latest
    profiles: ["logging"]
    volumes:
      - ./config/${ENVIRONMENT:-development}/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
    environment:
      - LOGTIDE_API_URL=${LOGTIDE_API_URL}
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
```

### Development Config

```ini
# config/development/fluent-bit.conf
[SERVICE]
    Flush     1
    Log_Level debug
    Daemon    off

[INPUT]
    Name   forward
    Port   24224

[OUTPUT]
    Name   stdout
    Match  *
    Format json_lines
```

### Production Config

```ini
# config/production/fluent-bit.conf
[SERVICE]
    Flush     5
    Log_Level info
    Daemon    off

[INPUT]
    Name   forward
    Port   24224

[OUTPUT]
    Name   http
    Match  *
    # ... production settings
```

### Start with Profile

```bash
# Development (logs to stdout)
docker compose up

# Production (logs to LogTide)
docker compose --profile logging up -d
```

## Scaling Considerations

### Horizontal Scaling

When scaling services, each replica sends logs to Fluent Bit:

```yaml
services:
  app:
    deploy:
      replicas: 5
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: "{{.Name}}"  # Includes replica number: myapp-app-1, myapp-app-2, etc.
```

### High Availability Fluent Bit

For mission-critical logging, run multiple Fluent Bit instances:

```yaml
services:
  fluent-bit-1:
    image: fluent/fluent-bit:latest
    ports:
      - "24224:24224"
    # ...

  fluent-bit-2:
    image: fluent/fluent-bit:latest
    ports:
      - "24225:24224"
    # ...

  app:
    logging:
      driver: fluentd
      options:
        fluentd-address: "localhost:24224,localhost:24225"
        fluentd-async: "true"
```

## Verification

### Check Fluent Bit Status

```bash
# Health check
curl http://localhost:2020/api/v1/health

# Metrics
curl http://localhost:2020/api/v1/metrics

# Storage status (if using buffering)
curl http://localhost:2020/api/v1/storage
```

### View Collected Logs

```bash
# Follow Fluent Bit logs
docker compose logs -f fluent-bit

# Check specific service logs in LogTide
# Filter by: service = "app" AND project = "myapp"
```

### Test Log Delivery

```bash
# Send a test log
docker compose exec app sh -c 'echo "{\"level\":\"info\",\"message\":\"Test log\"}"'

# Check LogTide dashboard for the test log
```

## Performance Tuning

### Memory Usage

Control buffer sizes to manage memory:

```ini
[INPUT]
    Name              forward
    Buffer_Chunk_Size 512K   # Reduce for memory-constrained environments
    Buffer_Max_Size   2M

[SERVICE]
    storage.backlog.mem_limit 25M  # Limit backlog memory
```

### Throughput

For high-volume logging:

```ini
[SERVICE]
    Flush    1            # More frequent flushes
    Workers  4            # Parallel output workers

[OUTPUT]
    Name     http
    Workers  2            # Parallel HTTP connections
```

### Disk Buffering

Enable disk buffering for reliability:

```ini
[SERVICE]
    storage.path              /var/log/fluent-bit/
    storage.sync              normal
    storage.checksum          off

[INPUT]
    Name                      forward
    storage.type              filesystem  # Enable disk buffering

[OUTPUT]
    Name                      http
    storage.total_limit_size  500M  # Max disk usage per output
```

## Troubleshooting

### Logs not reaching LogTide

1. **Check Fluent Bit is running:**
```bash
docker compose ps fluent-bit
docker compose logs fluent-bit
```

2. **Verify connectivity:**
```bash
docker compose exec fluent-bit curl -v https://api.logtide.dev/health
```

3. **Check logging driver:**
```bash
docker inspect myapp-app-1 --format '{{.HostConfig.LogConfig}}'
```

### Container startup fails with logging driver

If containers fail because Fluent Bit isn't ready:

```yaml
services:
  app:
    depends_on:
      fluent-bit:
        condition: service_healthy
    logging:
      driver: fluentd
      options:
        fluentd-async: "true"  # Don't block on logging
```

### High memory usage

Reduce buffer sizes and enable disk buffering:

```ini
[INPUT]
    Name              forward
    Buffer_Chunk_Size 256K
    Buffer_Max_Size   1M
    storage.type      filesystem
```

## Next Steps

- **[Docker Integration](/integrations/docker)** - Single container logging patterns
- **[nginx Integration](/integrations/nginx)** - Detailed nginx access log parsing
- **[Node.js Integration](/integrations/nodejs)** - Application-level logging
- **[GDPR Compliance](/use-cases/gdpr-compliance)** - Privacy-first logging setup
