---
title: "MySQL and MariaDB Log Integration"
description: "Monitor MySQL slow queries, error logs, and connection events in LogTide with structured parsing and real-time alerting."
category: "database"
difficulty: "medium"
brandIcon: "simple-icons:mysql"
highlights:
  - "Slow query detection"
  - "Error log parsing"
  - "Connection monitoring"
  - "Replication alerts"
relatedIntegrations:
  - "docker"
  - "kubernetes"
  - "nodejs"
  - "python"
relatedUseCases:
  - "security-monitoring"
  - "incident-response"
keywords:
  - "mysql logging"
  - "mysql slow query log"
  - "mysql monitoring"
  - "mariadb logging"
  - "mysql error log"
  - "mysql performance monitoring"
---

MySQL and MariaDB generate slow query logs, error logs, and general query logs that are critical for performance monitoring and security. This guide shows you how to collect, parse, and ship these logs to LogTide using Fluent Bit.

## Why monitor MySQL logs?

- **Slow query detection**: Find unoptimized queries before they cause outages
- **Error tracking**: Catch connection failures, table corruption, and replication issues
- **Security monitoring**: Detect unauthorized access, privilege escalation, and unusual patterns
- **Capacity planning**: Track query patterns and growth over time
- **Compliance**: Maintain audit trail for database access (SOC2, HIPAA)

## Prerequisites

- MySQL 8.0+ or MariaDB 10.6+
- Fluent Bit for log collection
- LogTide instance with API key
- Root or admin access to MySQL

## MySQL Configuration

### Enable Slow Query Log

```sql
-- Run in MySQL client
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
SET GLOBAL long_query_time = 1;          -- Log queries over 1 second
SET GLOBAL log_queries_not_using_indexes = 'ON';
SET GLOBAL min_examined_row_limit = 1000; -- Skip trivial queries
```

Or in the configuration file:

```ini
# /etc/mysql/mysql.conf.d/mysqld.cnf (MySQL)
# /etc/mysql/mariadb.conf.d/50-server.cnf (MariaDB)

[mysqld]
# Slow query log
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 1
log_queries_not_using_indexes = 1
min_examined_row_limit = 1000

# Error log
log_error = /var/log/mysql/error.log
log_error_verbosity = 2    # 1=errors, 2=+warnings, 3=+notes

# General query log (enable only for debugging, high overhead)
# general_log = 1
# general_log_file = /var/log/mysql/general.log
```

Restart MySQL:

```bash
sudo systemctl restart mysql
```

### Verify Configuration

```sql
SHOW VARIABLES LIKE 'slow_query%';
SHOW VARIABLES LIKE 'long_query_time';
SHOW VARIABLES LIKE 'log_error%';
```

## Fluent Bit Configuration

### Collect MySQL Logs

```ini
# /etc/fluent-bit/fluent-bit.conf
[SERVICE]
    Flush         5
    Log_Level     info
    Parsers_File  parsers.conf

# MySQL error log
[INPUT]
    Name          tail
    Path          /var/log/mysql/error.log
    Tag           mysql.error
    Parser        mysql_error
    Refresh_Interval 5

# MySQL slow query log
[INPUT]
    Name          tail
    Path          /var/log/mysql/slow.log
    Tag           mysql.slow
    Parser        mysql_slow
    Multiline     On
    Parser_Firstline mysql_slow_firstline
    Refresh_Interval 5

# Add metadata
[FILTER]
    Name          record_modifier
    Match         mysql.*
    Record        hostname ${HOSTNAME}
    Record        service mysql
    Record        environment production

# Output to LogTide
[OUTPUT]
    Name          http
    Match         *
    Host          api.logtide.dev
    Port          443
    URI           /api/v1/ingest/single
    Format        json
    Header        X-API-Key ${LOGTIDE_API_KEY}
    Header        Content-Type application/json
    tls           On
    tls.verify    On
```

### Parser Configuration

```ini
# /etc/fluent-bit/parsers.conf

# MySQL error log format
[PARSER]
    Name        mysql_error
    Format      regex
    Regex       ^(?<time>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(?<thread>\d+)\s+\[(?<level>\w+)\]\s+\[(?<error_code>\w+)\]\s+\[(?<subsystem>\w+)\]\s+(?<message>.*)$
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%LZ

# MySQL slow query first line
[PARSER]
    Name        mysql_slow_firstline
    Format      regex
    Regex       ^# Time: (?<time>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})

# MySQL slow query content
[PARSER]
    Name        mysql_slow
    Format      regex
    Regex       ^# User@Host: (?<user>\S+)\s+@\s+(?<host>\S+)\s+\[(?<ip>[^\]]*)\].*Query_time:\s+(?<query_time>[\d.]+)\s+Lock_time:\s+(?<lock_time>[\d.]+)\s+Rows_sent:\s+(?<rows_sent>\d+)\s+Rows_examined:\s+(?<rows_examined>\d+)
```

## Slow Query Collector Script

For more structured output, use a Python script that queries the `performance_schema`:

```python
#!/usr/bin/env python3
# /opt/mysql-monitor/slow_queries.py

import json
import os
import mysql.connector

config = {
    'host': os.environ.get('MYSQL_HOST', 'localhost'),
    'port': int(os.environ.get('MYSQL_PORT', 3306)),
    'user': os.environ.get('MYSQL_USER', 'monitor'),
    'password': os.environ.get('MYSQL_PASSWORD'),
    'database': 'performance_schema',
}

conn = mysql.connector.connect(**config)
cursor = conn.cursor(dictionary=True)

# Get top slow queries from performance_schema
cursor.execute("""
    SELECT
        DIGEST_TEXT AS query_pattern,
        COUNT_STAR AS exec_count,
        ROUND(AVG_TIMER_WAIT / 1e9, 2) AS avg_ms,
        ROUND(MAX_TIMER_WAIT / 1e9, 2) AS max_ms,
        SUM_ROWS_SENT AS total_rows_sent,
        SUM_ROWS_EXAMINED AS total_rows_examined,
        FIRST_SEEN,
        LAST_SEEN
    FROM events_statements_summary_by_digest
    WHERE AVG_TIMER_WAIT > 1e9  -- Over 1ms average
    ORDER BY AVG_TIMER_WAIT DESC
    LIMIT 50
""")

for row in cursor.fetchall():
    log = {
        'log_type': 'slow_query_digest',
        'query_pattern': row['query_pattern'][:500],
        'exec_count': row['exec_count'],
        'avg_ms': float(row['avg_ms']),
        'max_ms': float(row['max_ms']),
        'total_rows_sent': row['total_rows_sent'],
        'total_rows_examined': row['total_rows_examined'],
        'first_seen': str(row['FIRST_SEEN']),
        'last_seen': str(row['LAST_SEEN']),
    }
    print(json.dumps(log))

cursor.close()
conn.close()
```

Run periodically via cron or Fluent Bit exec:

```ini
[INPUT]
    Name          exec
    Tag           mysql.slowdigest
    Command       python3 /opt/mysql-monitor/slow_queries.py
    Interval_Sec  300
    Parser        json
```

## Docker Setup

```yaml
# docker-compose.yml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: myapp
    command: >
      --slow-query-log=ON
      --slow-query-log-file=/var/log/mysql/slow.log
      --long-query-time=1
      --log-queries-not-using-indexes=ON
      --log-error=/var/log/mysql/error.log
    volumes:
      - mysql_data:/var/lib/mysql
      - mysql_logs:/var/log/mysql
    ports:
      - "3306:3306"

  fluent-bit:
    image: fluent/fluent-bit:latest
    volumes:
      - ./fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
      - ./parsers.conf:/fluent-bit/etc/parsers.conf:ro
      - mysql_logs:/var/log/mysql:ro
    environment:
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    depends_on:
      - mysql

volumes:
  mysql_data:
  mysql_logs:
```

## Kubernetes Deployment

```yaml
# mysql-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql
  replicas: 1
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8.0
          args:
            - --slow-query-log=ON
            - --long-query-time=1
            - --log-queries-not-using-indexes=ON
          env:
            - name: MYSQL_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mysql-secret
                  key: root-password
          ports:
            - containerPort: 3306
          volumeMounts:
            - name: data
              mountPath: /var/lib/mysql
            - name: logs
              mountPath: /var/log/mysql

        - name: log-collector
          image: fluent/fluent-bit:latest
          volumeMounts:
            - name: logs
              mountPath: /var/log/mysql
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
        - name: logs
          emptyDir: {}
        - name: fluent-bit-config
          configMap:
            name: mysql-fluent-bit-config

  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 50Gi
```

## Monitoring Queries

### Slow Queries Over Time

```sql
SELECT * FROM logs
WHERE service = 'mysql'
  AND log_type = 'slow_query_digest'
  AND avg_ms > 100
ORDER BY avg_ms DESC
LIMIT 50
```

### Error Log Analysis

```sql
SELECT * FROM logs
WHERE service = 'mysql'
  AND level IN ('error', 'warning')
ORDER BY timestamp DESC
LIMIT 100
```

### Connection Tracking

```sql
SELECT * FROM logs
WHERE service = 'mysql'
  AND (message LIKE '%Access denied%'
       OR message LIKE '%Too many connections%'
       OR message LIKE '%Aborted connection%')
ORDER BY timestamp DESC
```

### Replication Lag

```sql
SELECT * FROM logs
WHERE service = 'mysql'
  AND (message LIKE '%Slave%'
       OR message LIKE '%Replica%'
       OR message LIKE '%replication%')
ORDER BY timestamp DESC
```

## Detection Rules

### Slow Query Spike

```
service:mysql AND log_type:slow_query_digest AND avg_ms > 5000
```

Alert: "MySQL query averaging over 5 seconds"

### Access Denied Burst

```
service:mysql AND message:"Access denied"
| window 5m
| count > 10
```

Alert: "Multiple failed MySQL login attempts"

### Replication Failure

```
service:mysql AND level:error AND message:"replication"
```

Alert: "MySQL replication error detected"

### Connection Pool Exhaustion

```
service:mysql AND message:"Too many connections"
```

Alert: "MySQL connection limit reached"

## Performance Impact

| Metric | Without Logging | With Slow Query Log | Overhead |
|--------|-----------------|---------------------|----------|
| QPS | 10,000 | 9,950 | -0.5% |
| Avg query latency | 2ms | 2.01ms | +0.5% |
| Disk I/O | Baseline | +5-10 MB/day | Minimal |
| CPU usage | Baseline | +0.1% | Negligible |

**Notes:**
- Slow query log has negligible impact (only logs slow queries)
- General query log has significant overhead — use only for debugging
- Fluent Bit runs out-of-band, no MySQL impact

## Security Considerations

### Create a Read-Only Monitor User

```sql
CREATE USER 'logtide_monitor'@'localhost' IDENTIFIED BY 'SECURE_PASSWORD';
GRANT SELECT ON performance_schema.* TO 'logtide_monitor'@'localhost';
GRANT PROCESS ON *.* TO 'logtide_monitor'@'localhost';
FLUSH PRIVILEGES;
```

### Sensitive Query Filtering

Avoid logging queries with sensitive data:

```ini
# Fluent Bit filter to redact passwords
[FILTER]
    Name          lua
    Match         mysql.slow
    script        /etc/fluent-bit/sanitize.lua
    call          redact_sensitive
```

```lua
-- /etc/fluent-bit/sanitize.lua
function redact_sensitive(tag, timestamp, record)
    local query = record["query_pattern"] or ""
    query = query:gsub("'[^']*'", "'***'")
    query = query:gsub("password%s*=%s*%S+", "password=***")
    record["query_pattern"] = query
    return 1, timestamp, record
end
```

## Troubleshooting

### Slow query log not capturing queries

1. Verify slow log is enabled:
   ```sql
   SHOW VARIABLES LIKE 'slow_query%';
   ```
2. Check threshold:
   ```sql
   SHOW VARIABLES LIKE 'long_query_time';
   ```
3. Generate a test slow query:
   ```sql
   SELECT SLEEP(2);
   ```
4. Check file permissions:
   ```bash
   ls -la /var/log/mysql/
   ```

### MariaDB differences

MariaDB uses the same configuration options but may store logs in different default locations. Check:

```bash
mariadb --help --verbose | grep -A1 'log-error'
```

## Next Steps

- [Docker Integration](/integrations/docker/) - Container log collection
- [Kubernetes Integration](/integrations/kubernetes/) - Cluster-level monitoring
- [PostgreSQL Integration](/integrations/postgresql/) - Compare with PostgreSQL logging
- [Security Monitoring](/use-cases/security-monitoring/) - Database access auditing
