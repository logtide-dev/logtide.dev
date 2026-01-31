---
title: "PostgreSQL Log Analysis Integration"
description: "Monitor PostgreSQL queries, slow logs, and errors with LogTide. Complete setup for Docker, Kubernetes, and bare metal."
category: "database"
difficulty: "medium"
brandIcon: "simple-icons:postgresql"
highlights:
  - "Slow query detection"
  - "Error monitoring"
  - "Connection tracking"
  - "TimescaleDB ready"
relatedIntegrations:
  - "docker"
  - "nodejs"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "postgresql logging"
  - "postgres slow query"
  - "postgresql monitoring"
  - "database observability"
  - "postgres error tracking"
---

PostgreSQL generates valuable operational data: slow queries, connection errors, and checkpoint statistics. This guide shows you how to collect PostgreSQL logs and ship them to LogTide for analysis and alerting.

## Why monitor PostgreSQL with LogTide?

- **Slow query detection**: Find queries that degrade performance
- **Error alerting**: Get notified about connection failures and crashes
- **Audit logging**: Track who did what for compliance
- **Correlation**: Link database issues with application errors
- **Historical analysis**: Understand patterns over time

## Prerequisites

- PostgreSQL 12+ (14+ recommended)
- LogTide instance with API key
- Fluent Bit or Vector for log shipping

## Quick Start

### 1. Configure PostgreSQL Logging

Edit `postgresql.conf`:

```ini
# Enable logging
logging_collector = on
log_destination = 'csvlog'
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB

# Log format (CSV for structured parsing)
log_min_messages = warning
log_min_error_statement = error
log_min_duration_statement = 500  # Log queries slower than 500ms

# What to log
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
log_temp_files = 0
log_autovacuum_min_duration = 0

# Query logging
log_statement = 'ddl'  # none, ddl, mod, all
log_duration = off     # Set to on for all query durations

# Error verbosity
log_error_verbosity = default

# Line prefix for non-CSV logs
log_line_prefix = '%t [%p]: user=%u,db=%d,app=%a,client=%h '
```

Reload configuration:

```bash
sudo -u postgres psql -c "SELECT pg_reload_conf();"
```

### 2. Set Up Fluent Bit

Create `/etc/fluent-bit/fluent-bit.conf`:

```ini
[SERVICE]
    Flush         5
    Log_Level     info
    Parsers_File  parsers.conf

[INPUT]
    Name          tail
    Tag           postgresql
    Path          /var/lib/postgresql/*/data/pg_log/*.csv
    Parser        postgresql_csv
    DB            /var/log/flb_postgresql.db
    Refresh_Interval 10

[FILTER]
    Name          modify
    Match         postgresql
    Add           service postgresql

[FILTER]
    Name          lua
    Match         postgresql
    script        /etc/fluent-bit/parse_pg.lua
    call          parse_postgresql

[OUTPUT]
    Name          http
    Match         postgresql
    Host          YOUR_LOGTIDE_HOST
    Port          443
    URI           /api/v1/ingest
    Format        json
    Header        X-API-Key YOUR_API_KEY
    Header        Content-Type application/json
    tls           On
```

Create `/etc/fluent-bit/parsers.conf`:

```ini
[PARSER]
    Name        postgresql_csv
    Format      regex
    Regex       ^(?<log_time>[^,]*),(?<user_name>[^,]*),(?<database_name>[^,]*),(?<process_id>[^,]*),(?<connection_from>[^,]*),(?<session_id>[^,]*),(?<session_line_num>[^,]*),(?<command_tag>[^,]*),(?<session_start_time>[^,]*),(?<virtual_transaction_id>[^,]*),(?<transaction_id>[^,]*),(?<error_severity>[^,]*),(?<sql_state_code>[^,]*),(?<message>[^,]*),(?<detail>[^,]*),(?<hint>[^,]*),(?<internal_query>[^,]*),(?<internal_query_pos>[^,]*),(?<context>[^,]*),(?<query>[^,]*),(?<query_pos>[^,]*),(?<location>[^,]*),(?<application_name>[^,]*)
    Time_Key    log_time
    Time_Format %Y-%m-%d %H:%M:%S.%L %z
```

Create `/etc/fluent-bit/parse_pg.lua`:

```lua
function parse_postgresql(tag, timestamp, record)
    -- Parse duration from message
    local duration_match = string.match(record["message"] or "", "duration: ([%d.]+) ms")
    if duration_match then
        record["duration_ms"] = tonumber(duration_match)
    end

    -- Determine log level from error_severity
    local severity = record["error_severity"] or ""
    if severity == "ERROR" or severity == "FATAL" or severity == "PANIC" then
        record["level"] = "error"
    elseif severity == "WARNING" then
        record["level"] = "warn"
    else
        record["level"] = "info"
    end

    -- Clean up empty fields
    for k, v in pairs(record) do
        if v == "" then
            record[k] = nil
        end
    end

    return 1, timestamp, record
end
```

### 3. Start Fluent Bit

```bash
sudo systemctl start fluent-bit
sudo systemctl enable fluent-bit
```

## Slow Query Monitoring

### Configuration for Slow Queries

```ini
# postgresql.conf
log_min_duration_statement = 500  # Log queries > 500ms
log_statement = 'none'            # Don't log all statements
```

### Analyzing Slow Queries in LogTide

```
service:postgresql AND duration_ms:>1000
```

### Alert on Slow Queries

Create an alert rule:
- Filter: `service:postgresql AND duration_ms:>5000`
- Threshold: >5 queries in 5 minutes
- Severity: Warning

## Connection Monitoring

### Track Connection Events

```ini
# postgresql.conf
log_connections = on
log_disconnections = on
```

Example log:

```json
{
  "service": "postgresql",
  "level": "info",
  "message": "connection authorized: user=app database=production",
  "user_name": "app",
  "database_name": "production",
  "connection_from": "192.168.1.100",
  "application_name": "api-server"
}
```

### Alert on Connection Failures

```
service:postgresql AND level:error AND message:*connection*
```

## Docker Setup

### docker-compose.yml

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: production
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - postgres_logs:/var/lib/postgresql/data/pg_log
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 10s
      timeout: 5s
      retries: 5

  fluent-bit:
    image: fluent/fluent-bit:latest
    container_name: fluent-bit-postgres
    volumes:
      - ./fluent-bit/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
      - ./fluent-bit/parsers.conf:/fluent-bit/etc/parsers.conf:ro
      - ./fluent-bit/parse_pg.lua:/etc/fluent-bit/parse_pg.lua:ro
      - postgres_logs:/var/log/postgresql:ro
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
  postgres_logs:
```

### postgresql.conf for Docker

```ini
# Logging configuration for Docker
listen_addresses = '*'
logging_collector = on
log_destination = 'csvlog'
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d.log'

# Slow queries
log_min_duration_statement = 500
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

# Performance
shared_buffers = 256MB
effective_cache_size = 768MB
maintenance_work_mem = 64MB
```

## Kubernetes Setup

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
data:
  postgresql.conf: |
    listen_addresses = '*'
    logging_collector = on
    log_destination = 'csvlog'
    log_directory = 'pg_log'
    log_filename = 'postgresql-%Y-%m-%d.log'
    log_min_duration_statement = 500
    log_checkpoints = on
    log_connections = on
    log_disconnections = on
    log_lock_waits = on
```

### StatefulSet with Sidecar

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: password
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
            - name: config
              mountPath: /etc/postgresql/postgresql.conf
              subPath: postgresql.conf
            - name: logs
              mountPath: /var/lib/postgresql/data/pg_log

        - name: fluent-bit
          image: fluent/fluent-bit:latest
          volumeMounts:
            - name: logs
              mountPath: /var/log/postgresql
              readOnly: true
            - name: fluent-bit-config
              mountPath: /fluent-bit/etc/
          env:
            - name: LOGTIDE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: logtide-credentials
                  key: api-key

      volumes:
        - name: config
          configMap:
            name: postgres-config
        - name: logs
          emptyDir: {}
        - name: fluent-bit-config
          configMap:
            name: fluent-bit-postgres-config

  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

## pgAudit for Compliance

For detailed audit logging, install pgAudit:

### Install Extension

```sql
CREATE EXTENSION pgaudit;
```

### Configure

```ini
# postgresql.conf
shared_preload_libraries = 'pgaudit'
pgaudit.log = 'ddl, role, write'
pgaudit.log_catalog = off
pgaudit.log_client = on
pgaudit.log_level = log
```

### Audit Log Output

```json
{
  "service": "postgresql",
  "level": "info",
  "message": "AUDIT: SESSION,1,1,DDL,CREATE TABLE,TABLE,public.users,CREATE TABLE users (id serial PRIMARY KEY)",
  "user_name": "admin",
  "database_name": "production"
}
```

## Detection Rules

### High Error Rate

```
service:postgresql AND level:error
```
Threshold: >10 errors in 5 minutes

### Very Slow Queries

```
service:postgresql AND duration_ms:>10000
```
Alert on any query >10 seconds

### Connection Exhaustion

```
service:postgresql AND message:"too many connections"
```

### Deadlocks

```
service:postgresql AND message:*deadlock*
```

### Checkpoint Warnings

```
service:postgresql AND message:"checkpoints are occurring too frequently"
```

## Performance Impact

| Configuration | CPU Overhead | I/O Overhead |
|---------------|--------------|--------------|
| Basic logging | <1% | ~5% |
| Slow query (500ms) | <1% | ~2% |
| All statements | 5-10% | 20-30% |
| pgAudit (DDL+write) | 2-5% | 10-15% |

## Troubleshooting

### Logs not appearing

1. Check logging is enabled:
   ```sql
   SHOW logging_collector;
   SHOW log_directory;
   SHOW log_destination;
   ```

2. Verify log files exist:
   ```bash
   ls -la /var/lib/postgresql/*/data/pg_log/
   ```

3. Check Fluent Bit can read files:
   ```bash
   docker logs fluent-bit-postgres
   ```

### CSV parsing errors

Ensure `log_destination = 'csvlog'` is set. Standard log format won't parse correctly with the CSV parser.

### Missing slow queries

Check `log_min_duration_statement`:
```sql
SHOW log_min_duration_statement;
```

## Next Steps

- [Docker Integration](/integrations/docker) - Container log collection
- [Node.js SDK](/integrations/nodejs) - Application logging
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy-compliant setup
