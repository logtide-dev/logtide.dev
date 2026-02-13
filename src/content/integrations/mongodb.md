---
title: "MongoDB Log Monitoring Integration"
description: "Collect MongoDB profiler output, slow operation logs, and replica set events in LogTide for database observability."
category: "database"
difficulty: "medium"
brandIcon: "simple-icons:mongodb"
highlights:
  - "Slow operation profiling"
  - "Replica set monitoring"
  - "Connection tracking"
  - "Structured JSON logs"
relatedIntegrations:
  - "docker"
  - "kubernetes"
  - "nodejs"
relatedUseCases:
  - "incident-response"
keywords:
  - "mongodb logging"
  - "mongodb monitoring"
  - "mongodb slow queries"
  - "mongodb profiler"
  - "mongodb replica set logs"
  - "mongodb observability"
---

MongoDB 4.4+ outputs structured JSON logs by default, making it straightforward to ship to LogTide. This guide covers log collection with Fluent Bit, profiler configuration for slow operations, and replica set event monitoring.

## Why monitor MongoDB logs?

- **Slow operation detection**: Find expensive queries and aggregations before they cascade
- **Replica set health**: Track elections, step-downs, and replication lag
- **Connection monitoring**: Detect connection storms and pool exhaustion
- **Security auditing**: Track authentication failures and unauthorized access
- **Capacity planning**: Understand query patterns, collection scans, and index usage

## Prerequisites

- MongoDB 4.4+ (5.0+ recommended for structured logging)
- Fluent Bit for log collection
- LogTide instance with API key

## MongoDB Configuration

### Enable Profiling

```javascript
// Connect to MongoDB and enable profiler
use admin;

// Profile slow operations (over 100ms)
db.setProfilingLevel(1, { slowms: 100 });

// Verify
db.getProfilingStatus();
// { "was" : 1, "slowms" : 100, "sampleRate" : 1 }
```

### Configure Log Output

```yaml
# /etc/mongod.conf
systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true
  # MongoDB 4.4+ outputs structured JSON by default

# Log verbosity (0-5, default 0)
  component:
    accessControl:
      verbosity: 1     # Auth events
    command:
      verbosity: 0     # Command execution
    query:
      verbosity: 0     # Query planning
    replication:
      verbosity: 1     # Replica set events
    storage:
      verbosity: 0     # Storage engine

# Profiler settings
operationProfiling:
  mode: slowOp
  slowOpThresholdMs: 100
  slowOpSampleRate: 1.0
```

Restart MongoDB:

```bash
sudo systemctl restart mongod
```

### Log Output Example

MongoDB 4.4+ structured log format:

```json
{
  "t": {"$date": "2025-01-31T10:00:00.000+00:00"},
  "s": "I",
  "c": "COMMAND",
  "id": 51803,
  "ctx": "conn123",
  "msg": "Slow query",
  "attr": {
    "type": "command",
    "ns": "mydb.users",
    "command": {"find": "users", "filter": {"email": "user@example.com"}},
    "planSummary": "COLLSCAN",
    "keysExamined": 0,
    "docsExamined": 50000,
    "nreturned": 1,
    "durationMillis": 234
  }
}
```

## Fluent Bit Configuration

### Collect MongoDB Logs

```ini
# /etc/fluent-bit/fluent-bit.conf
[SERVICE]
    Flush         5
    Log_Level     info
    Parsers_File  parsers.conf

# MongoDB structured logs (JSON by default since 4.4)
[INPUT]
    Name          tail
    Path          /var/log/mongodb/mongod.log
    Tag           mongodb.log
    Parser        json
    Refresh_Interval 5

# Add metadata
[FILTER]
    Name          record_modifier
    Match         mongodb.*
    Record        hostname ${HOSTNAME}
    Record        service mongodb
    Record        environment production

# Map MongoDB severity to standard levels
[FILTER]
    Name          lua
    Match         mongodb.*
    script        /etc/fluent-bit/mongo_level.lua
    call          map_severity

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

### Severity Mapping Script

```lua
-- /etc/fluent-bit/mongo_level.lua
local severity_map = {
    F = "critical",  -- Fatal
    E = "error",     -- Error
    W = "warning",   -- Warning
    I = "info",      -- Informational
    D = "debug",     -- Debug
}

function map_severity(tag, timestamp, record)
    local s = record["s"]
    if s and severity_map[s] then
        record["level"] = severity_map[s]
    else
        record["level"] = "info"
    end
    return 1, timestamp, record
end
```

## Profiler Data Collection

### Script-Based Profiler Collection

```python
#!/usr/bin/env python3
# /opt/mongodb-monitor/profiler.py

import json
import os
from datetime import datetime, timedelta
from pymongo import MongoClient

MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://localhost:27017')

client = MongoClient(MONGO_URI)

# Collect from all databases
for db_name in client.list_database_names():
    if db_name in ('admin', 'config', 'local'):
        continue

    db = client[db_name]

    # Get recent profiler entries
    since = datetime.utcnow() - timedelta(minutes=5)
    cursor = db.system.profile.find(
        {'ts': {'$gte': since}},
        limit=100,
    ).sort('ts', -1)

    for entry in cursor:
        log = {
            'log_type': 'profiler',
            'database': db_name,
            'collection': entry.get('ns', '').split('.')[-1],
            'operation': entry.get('op', 'unknown'),
            'duration_ms': entry.get('millis', 0),
            'plan_summary': entry.get('planSummary', ''),
            'keys_examined': entry.get('keysExamined', 0),
            'docs_examined': entry.get('docsExamined', 0),
            'nreturned': entry.get('nreturned', 0),
            'response_length': entry.get('responseLength', 0),
        }

        # Flag collection scans
        if 'COLLSCAN' in log['plan_summary']:
            log['warning'] = 'collection_scan'

        print(json.dumps(log, default=str))

client.close()
```

Install dependency: `pip install pymongo`

### Fluent Bit Exec Input

```ini
[INPUT]
    Name          exec
    Tag           mongodb.profiler
    Command       python3 /opt/mongodb-monitor/profiler.py
    Interval_Sec  300
    Parser        json

[FILTER]
    Name          record_modifier
    Match         mongodb.profiler
    Record        service mongodb
```

## Docker Setup

```yaml
# docker-compose.yml
services:
  mongodb:
    image: mongo:7
    command: >
      mongod
      --profile 1
      --slowms 100
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
      - mongo_logs:/var/log/mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}

  fluent-bit:
    image: fluent/fluent-bit:latest
    volumes:
      - ./fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
      - ./mongo_level.lua:/fluent-bit/etc/mongo_level.lua:ro
      - mongo_logs:/var/log/mongodb:ro
    environment:
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    depends_on:
      - mongodb

volumes:
  mongo_data:
  mongo_logs:
```

## Monitoring Queries

### Slow Operations

```sql
SELECT * FROM logs
WHERE service = 'mongodb'
  AND log_type = 'profiler'
  AND duration_ms > 500
ORDER BY duration_ms DESC
LIMIT 50
```

### Collection Scans (Missing Indexes)

```sql
SELECT * FROM logs
WHERE service = 'mongodb'
  AND warning = 'collection_scan'
ORDER BY docs_examined DESC
LIMIT 50
```

### Replica Set Events

```sql
SELECT * FROM logs
WHERE service = 'mongodb'
  AND (message LIKE '%election%'
       OR message LIKE '%stepDown%'
       OR message LIKE '%replSetReconfig%')
ORDER BY timestamp DESC
```

### Authentication Failures

```sql
SELECT * FROM logs
WHERE service = 'mongodb'
  AND level = 'warning'
  AND (message LIKE '%authentication%'
       OR message LIKE '%auth%')
ORDER BY timestamp DESC
```

## Detection Rules

### Sustained Slow Operations

```
service:mongodb AND log_type:profiler AND duration_ms > 1000
| window 5m
| count > 10
```

Alert: "MongoDB experiencing sustained slow operations"

### Collection Scan on Large Collection

```
service:mongodb AND warning:collection_scan AND docs_examined > 10000
```

Alert: "Collection scan on large collection — missing index?"

### Replica Set Election

```
service:mongodb AND message:"election"
```

Alert: "MongoDB replica set election triggered"

### Connection Spike

```
service:mongodb AND message:"connection accepted"
| window 1m
| count > 100
```

Alert: "MongoDB connection spike detected"

## Performance Impact

| Metric | Without Profiling | With Profiling (slowOp) | Overhead |
|--------|-------------------|-------------------------|----------|
| QPS | 50,000 | 49,800 | -0.4% |
| Avg latency | 1ms | 1.01ms | +1% |
| Disk I/O | Baseline | +2-5 MB/day | Minimal |

**Notes:**
- `slowOp` profiling only logs slow operations — minimal overhead
- Level 2 profiling (all operations) has significant overhead — avoid in production
- Structured JSON logs have negligible overhead vs legacy format

## Security

### Read-Only Monitor User

```javascript
use admin;
db.createUser({
  user: "logtide_monitor",
  pwd: "SECURE_PASSWORD",
  roles: [
    { role: "clusterMonitor", db: "admin" },
    { role: "read", db: "admin" },
  ]
});
```

### Redacting Sensitive Data

MongoDB's `--redactClientLogData` flag removes field values from logs:

```yaml
# mongod.conf
security:
  redactClientLogData: true
```

This replaces values with `"###"` in log output, preventing PII exposure.

## Troubleshooting

### Profiler entries not appearing

1. Check profiling level:
   ```javascript
   db.getProfilingStatus()
   ```
2. Check profiler collection:
   ```javascript
   db.system.profile.find().limit(5).sort({ts: -1})
   ```
3. Generate a test slow query:
   ```javascript
   db.collection.find({nonIndexedField: "test"}).explain("executionStats")
   ```

### Log file not updating

Check MongoDB has write permissions:

```bash
ls -la /var/log/mongodb/
# mongodb user needs write access
```

### Fluent Bit JSON parse errors

MongoDB logs may contain nested objects. Ensure Fluent Bit's JSON parser handles nested fields:

```ini
[PARSER]
    Name        json
    Format      json
    Time_Key    t
    Time_Format %Y-%m-%dT%H:%M:%S.%L%z
```

## Next Steps

- [Docker Integration](/integrations/docker) - Container deployment
- [Kubernetes Integration](/integrations/kubernetes) - StatefulSet patterns
- [Node.js Integration](/integrations/nodejs) - Application-level MongoDB logging
- [Incident Response](/use-cases/incident-response) - Debug database issues
