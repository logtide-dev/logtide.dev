---
title: "nginx Access and Error Log Integration"
description: "Send nginx access and error logs to LogTide with structured parsing. Complete setup for Docker, systemd, and Kubernetes."
category: "web-server"
difficulty: "easy"
brandIcon: "simple-icons:nginx"
highlights:
  - "Structured log parsing"
  - "Request timing metrics"
  - "Error detection rules"
  - "Real-time monitoring"
relatedIntegrations:
  - "docker"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "nginx logs"
  - "nginx access log"
  - "nginx error log"
  - "web server logging"
  - "nginx monitoring"
---

nginx is one of the most popular web servers. This guide shows you how to send nginx access and error logs to LogTide with full structured parsing, enabling powerful queries and alerting.

## Why send nginx logs to LogTide?

- **Request analytics**: Analyze response times, status codes, and traffic patterns
- **Error detection**: Get alerted on 5xx errors, slow requests, and security issues
- **Compliance**: Audit trail for GDPR and security requirements
- **Correlation**: Link nginx logs with application logs using request IDs
- **Real-time visibility**: Live tail for debugging production issues

## Prerequisites

- nginx 1.18+ (any version with JSON log format support)
- LogTide instance with API key
- Fluent Bit for log forwarding (or systemd-journal)

## Quick Start (5 minutes)

### Step 1: Configure nginx JSON Log Format

Edit your nginx configuration (`/etc/nginx/nginx.conf` or site config):

```nginx
http {
    # JSON log format for structured logging
    log_format json_combined escape=json
    '{'
        '"time":"$time_iso8601",'
        '"remote_addr":"$remote_addr",'
        '"request_method":"$request_method",'
        '"request_uri":"$request_uri",'
        '"status":$status,'
        '"body_bytes_sent":$body_bytes_sent,'
        '"request_time":$request_time,'
        '"upstream_response_time":"$upstream_response_time",'
        '"http_referrer":"$http_referer",'
        '"http_user_agent":"$http_user_agent",'
        '"http_x_forwarded_for":"$http_x_forwarded_for",'
        '"request_id":"$request_id"'
    '}';

    access_log /var/log/nginx/access.log json_combined;
    error_log /var/log/nginx/error.log warn;
}
```

Reload nginx:

```bash
sudo nginx -t && sudo nginx -s reload
```

### Step 2: Set Up Fluent Bit

Create `/etc/fluent-bit/fluent-bit.conf`:

```ini
[SERVICE]
    Flush         1
    Log_Level     info
    Parsers_File  parsers.conf

[INPUT]
    Name          tail
    Path          /var/log/nginx/access.log
    Parser        nginx_json
    Tag           nginx.access
    Refresh_Interval 5

[INPUT]
    Name          tail
    Path          /var/log/nginx/error.log
    Parser        nginx_error
    Tag           nginx.error
    Refresh_Interval 5

[FILTER]
    Name          modify
    Match         nginx.*
    Add           service nginx

[FILTER]
    Name          modify
    Match         nginx.access
    Add           level info

[FILTER]
    Name          modify
    Match         nginx.error
    Add           level error
    Rename        message log_message

# Create message field from request data (for access logs)
[FILTER]
    Name          lua
    Match         nginx.access
    script        /fluent-bit/etc/nginx_message.lua
    call          create_message

[OUTPUT]
    Name          http
    Match         nginx.*
    Host          YOUR_LOGTIDE_HOST
    Port          443
    URI           /api/v1/ingest/single
    Format        json_lines
    Header        X-API-Key YOUR_API_KEY
    Header        Content-Type application/x-ndjson
    Json_date_key time
    Json_date_format iso8601
    tls           On
```

Create `/etc/fluent-bit/nginx_message.lua`:

```lua
-- Create message from nginx access log fields
function create_message(tag, timestamp, record)
    local method = record["request_method"] or "GET"
    local uri = record["request_uri"] or "/"
    local status = record["status"] or 0
    record["message"] = string.format("%s %s %d", method, uri, status)
    return 1, timestamp, record
end
```

Create `/etc/fluent-bit/parsers.conf`:

```ini
[PARSER]
    Name        nginx_json
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S%z

[PARSER]
    Name        nginx_error
    Format      regex
    Regex       ^(?<time>\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}) \[(?<level>\w+)\] (?<pid>\d+)#(?<tid>\d+): (?<message>.*)$
    Time_Key    time
    Time_Format %Y/%m/%d %H:%M:%S
```

Start Fluent Bit:

```bash
sudo systemctl start fluent-bit
sudo systemctl enable fluent-bit
```

## Production Configuration

### Enhanced nginx Log Format

For production, include additional fields for debugging and security:

```nginx
log_format json_production escape=json
'{'
    '"time":"$time_iso8601",'
    '"remote_addr":"$remote_addr",'
    '"remote_user":"$remote_user",'
    '"request_method":"$request_method",'
    '"request_uri":"$request_uri",'
    '"server_protocol":"$server_protocol",'
    '"status":$status,'
    '"body_bytes_sent":$body_bytes_sent,'
    '"request_time":$request_time,'
    '"upstream_response_time":"$upstream_response_time",'
    '"upstream_addr":"$upstream_addr",'
    '"http_referrer":"$http_referer",'
    '"http_user_agent":"$http_user_agent",'
    '"http_x_forwarded_for":"$http_x_forwarded_for",'
    '"http_x_real_ip":"$http_x_real_ip",'
    '"request_id":"$request_id",'
    '"ssl_protocol":"$ssl_protocol",'
    '"ssl_cipher":"$ssl_cipher",'
    '"request_length":$request_length,'
    '"connection":$connection,'
    '"connection_requests":$connection_requests'
'}';
```

### Request ID Generation

Enable request ID generation for correlation with application logs:

```nginx
server {
    # Generate unique request ID
    set $request_id $request_id;
    if ($request_id = "") {
        set $request_id $pid-$msec-$remote_addr-$connection;
    }

    # Pass to upstream applications
    proxy_set_header X-Request-ID $request_id;

    # Include in response for debugging
    add_header X-Request-ID $request_id;
}
```

## Docker Setup

### docker-compose.yml

```yaml
version: "3.8"

services:
  nginx:
    image: nginx:alpine
    container_name: nginx
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/logs:/var/log/nginx
    ports:
      - "80:80"
      - "443:443"

  fluent-bit:
    image: fluent/fluent-bit:latest
    container_name: fluent-bit
    volumes:
      - ./fluent-bit/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
      - ./fluent-bit/parsers.conf:/fluent-bit/etc/parsers.conf:ro
      - ./nginx/logs:/var/log/nginx:ro
    depends_on:
      - nginx
    restart: unless-stopped
```

### Alternative: Docker Log Driver

If you prefer not to mount log files, configure nginx to log to stdout/stderr:

```nginx
error_log /dev/stderr warn;
access_log /dev/stdout json_combined;
```

Then use Docker's Fluentd log driver as shown in the [Docker integration guide](/integrations/docker).

## Kubernetes Setup

### ConfigMap for nginx

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
data:
  nginx.conf: |
    events {
        worker_connections 1024;
    }
    http {
        log_format json_combined escape=json
        '{'
            '"time":"$time_iso8601",'
            '"remote_addr":"$remote_addr",'
            '"request_method":"$request_method",'
            '"request_uri":"$request_uri",'
            '"status":$status,'
            '"request_time":$request_time,'
            '"request_id":"$request_id"'
        '}';

        access_log /var/log/nginx/access.log json_combined;
        error_log /var/log/nginx/error.log warn;

        server {
            listen 80;
            location / {
                root /usr/share/nginx/html;
            }
        }
    }
```

### Deployment with Sidecar

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
        volumeMounts:
        - name: config
          mountPath: /etc/nginx/nginx.conf
          subPath: nginx.conf
        - name: logs
          mountPath: /var/log/nginx

      - name: fluent-bit
        image: fluent/fluent-bit:latest
        volumeMounts:
        - name: logs
          mountPath: /var/log/nginx
          readOnly: true
        - name: fluent-bit-config
          mountPath: /fluent-bit/etc/

      volumes:
      - name: config
        configMap:
          name: nginx-config
      - name: logs
        emptyDir: {}
      - name: fluent-bit-config
        configMap:
          name: fluent-bit-config
```

## Verification

Test that logs are arriving in LogTide:

```bash
# Generate some traffic
curl -I http://localhost/

# Check LogTide for nginx logs
# Filter by: service:nginx
```

In LogTide, you should see structured fields like:

| Field | Example Value |
|-------|---------------|
| service | nginx |
| status | 200 |
| request_method | GET |
| request_uri | /api/users |
| request_time | 0.045 |
| remote_addr | 192.168.1.100 |

## Detection Rules

Create alerts for common nginx issues:

### High Error Rate

```
service:nginx AND status:>=500
```

Set threshold: >10 errors in 5 minutes

### Slow Requests

```
service:nginx AND request_time:>2
```

Requests taking longer than 2 seconds.

### 404 Spam (Potential Scan)

```
service:nginx AND status:404
```

Set threshold: >100 in 1 minute from same IP

### Unusual User Agents

```
service:nginx AND http_user_agent:(*curl* OR *wget* OR *python*)
```

Detect automated access patterns.

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Log overhead | <1ms | Per request with JSON format |
| Disk I/O | ~500 bytes/request | With full metadata |
| Memory (Fluent Bit) | ~30MB | For nginx log tailing |

## Privacy Considerations

For GDPR compliance, consider:

1. **IP anonymization**: Truncate or hash IP addresses
2. **User agent filtering**: Remove or mask identifying information
3. **Request body**: Never log POST body data
4. **Retention**: Configure LogTide retention policies

Example IP anonymization in nginx:

```nginx
map $remote_addr $remote_addr_anon {
    ~(?P<ip>\d+\.\d+\.\d+)\.\d+ $ip.0;
    default 0.0.0.0;
}
```

## Troubleshooting

### Logs not appearing in LogTide

1. Check nginx is writing to the configured log file:
   ```bash
   tail -f /var/log/nginx/access.log
   ```

2. Verify Fluent Bit can read the file:
   ```bash
   docker logs fluent-bit
   ```

3. Test LogTide connectivity:
   ```bash
   curl -X POST https://YOUR_LOGTIDE_HOST/api/v1/ingest \
     -H "X-API-Key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"logs":[{"service":"test","level":"info","message":"test"}]}'
   ```

### JSON parse errors

If you see parse errors, check that nginx JSON escaping is enabled:

```nginx
log_format json_combined escape=json ...
```

## Next Steps

- [Docker Integration](/integrations/docker) - Container log collection
- [Node.js SDK](/integrations/nodejs) - Application logging with request correlation
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy-compliant logging setup
