---
title: "Apache HTTP Server Log Integration"
description: "Send Apache httpd access logs, error logs, and mod_security audit events to LogTide with structured JSON parsing."
category: "web-server"
difficulty: "easy"
brandIcon: "simple-icons:apache"
highlights:
  - "Access & error log parsing"
  - "JSON structured logging"
  - "mod_security audit logs"
  - "Virtual host support"
relatedIntegrations:
  - "docker"
  - "systemd"
  - "php"
relatedUseCases:
  - "security-monitoring"
  - "compliance-audit-trail"
keywords:
  - "apache logging"
  - "apache access log"
  - "apache error log"
  - "apache log management"
  - "httpd logging"
  - "apache mod_security"
---

Apache HTTP Server (httpd) is one of the most widely deployed web servers on the internet. This guide shows you how to send Apache access logs, error logs, and mod_security audit events to LogTide with full structured parsing for powerful queries, alerting, and compliance reporting.

## Why use LogTide with Apache?

- **Unified visibility**: Combine access logs, error logs, and security audit trails in one place
- **Structured analysis**: Parse Apache logs into queryable fields for fast investigation
- **Security monitoring**: Detect web attacks, brute-force attempts, and suspicious activity in real time
- **Compliance audit trail**: Meet GDPR, PCI-DSS, and SOC 2 requirements with centralized, tamper-evident logging
- **Virtual host tracking**: Monitor traffic and errors across multiple virtual hosts from a single dashboard
- **Performance insights**: Track response times, request sizes, and status code distribution

## Prerequisites

- Apache HTTP Server 2.4+ (any platform)
- LogTide instance with API key
- Fluent Bit or Vector for log forwarding
- `mod_log_json` (optional, for native JSON logging)

## Quick Start (5 minutes)

### Step 1: Configure Apache JSON Log Format

The simplest approach uses Apache's built-in `CustomLog` directive with a JSON format string.

Edit your Apache configuration (`/etc/apache2/apache2.conf` or `/etc/httpd/conf/httpd.conf`):

```apache
# JSON access log format
LogFormat "{\"time\":\"%{%Y-%m-%dT%H:%M:%S%z}t\",\"remote_addr\":\"%a\",\"remote_user\":\"%u\",\"request_method\":\"%m\",\"request_uri\":\"%U%q\",\"protocol\":\"%H\",\"status\":%>s,\"body_bytes_sent\":%B,\"request_time_us\":%D,\"http_referer\":\"%{Referer}i\",\"http_user_agent\":\"%{User-Agent}i\",\"http_x_forwarded_for\":\"%{X-Forwarded-For}i\",\"vhost\":\"%v\",\"server_port\":%{local}p,\"request_id\":\"%{unique_id}e\"}" json_combined

# Use the JSON format for access logs
CustomLog /var/log/apache2/access.json json_combined

# Error log (use default format; parsed by Fluent Bit)
ErrorLog /var/log/apache2/error.log
LogLevel warn
```

Enable `mod_unique_id` for request correlation:

```bash
# Debian/Ubuntu
sudo a2enmod unique_id

# RHEL/CentOS
# Add to httpd.conf:
# LoadModule unique_id_module modules/mod_unique_id.so
```

Reload Apache:

```bash
sudo apachectl configtest && sudo systemctl reload apache2
```

### Step 2: Set Up Fluent Bit

Create `/etc/fluent-bit/fluent-bit.conf`:

```ini
[SERVICE]
    Flush         5
    Log_Level     info
    Parsers_File  parsers.conf

[INPUT]
    Name          tail
    Path          /var/log/apache2/access.json
    Tag           apache.access
    Refresh_Interval 5

[INPUT]
    Name          tail
    Path          /var/log/apache2/error.log
    Parser        apache_error
    Tag           apache.error
    Refresh_Interval 5

[FILTER]
    Name          parser
    Match         apache.access
    Key_Name      log
    Parser        json
    Reserve_Data  On

[FILTER]
    Name          modify
    Match         apache.*
    Add           service apache

[FILTER]
    Name          modify
    Match         apache.access
    Add           log_type access

[FILTER]
    Name          modify
    Match         apache.error
    Add           log_type error
    Add           level error

[FILTER]
    Name          lua
    Match         apache.access
    script        /etc/fluent-bit/apache_message.lua
    call          create_message

[OUTPUT]
    Name          http
    Match         apache.*
    Host          YOUR_LOGTIDE_HOST
    Port          443
    URI           /api/v1/ingest/single
    Format        json
    Header        X-API-Key YOUR_API_KEY
    Header        Content-Type application/json
    tls           On
    tls.verify    On
```

Create `/etc/fluent-bit/apache_message.lua`:

```lua
function create_message(tag, timestamp, record)
    local method = record["request_method"] or "GET"
    local uri = record["request_uri"] or "/"
    local status = record["status"] or 0
    record["message"] = string.format("%s %s %d", method, uri, status)

    -- Convert microseconds to milliseconds
    local us = tonumber(record["request_time_us"]) or 0
    record["request_time_ms"] = us / 1000

    -- Set level based on status code
    local s = tonumber(status) or 0
    if s >= 500 then
        record["level"] = "error"
    elseif s >= 400 then
        record["level"] = "warn"
    else
        record["level"] = "info"
    end

    return 1, timestamp, record
end
```

Create `/etc/fluent-bit/parsers.conf`:

```ini
[PARSER]
    Name        json
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S%z

[PARSER]
    Name        apache_error
    Format      regex
    Regex       ^\[(?<time>[^\]]+)\] \[(?<module>[^\]]*)\] \[pid (?<pid>\d+)\] (?:\[client (?<client>[^\]]+)\] )?(?<message>.*)$
    Time_Key    time
    Time_Format %a %b %d %H:%M:%S.%L %Y
```

Start Fluent Bit:

```bash
sudo systemctl enable fluent-bit
sudo systemctl start fluent-bit
```

### Step 3: Verify

```bash
# Generate traffic
curl -I http://localhost/

# Check in LogTide with filter: service:apache
```

## Virtual Host Logging

### Per-VirtualHost Log Configuration

Configure separate logging for each virtual host:

```apache
<VirtualHost *:80>
    ServerName app.example.com
    DocumentRoot /var/www/app

    # Per-vhost JSON access log
    CustomLog /var/log/apache2/vhosts/app.example.com-access.json json_combined

    # Per-vhost error log
    ErrorLog /var/log/apache2/vhosts/app.example.com-error.log
    LogLevel warn
</VirtualHost>

<VirtualHost *:80>
    ServerName api.example.com
    DocumentRoot /var/www/api

    CustomLog /var/log/apache2/vhosts/api.example.com-access.json json_combined
    ErrorLog /var/log/apache2/vhosts/api.example.com-error.log
    LogLevel warn
</VirtualHost>
```

Collect all virtual host logs with a wildcard:

```ini
[INPUT]
    Name          tail
    Path          /var/log/apache2/vhosts/*-access.json
    Tag           apache.access.vhost
    Refresh_Interval 5
```

### Conditional Logging

Log only specific requests (e.g., exclude health checks):

```apache
# Don't log health check requests
SetEnvIf Request_URI "^/health$" no_log
SetEnvIf Request_URI "^/readyz$" no_log

CustomLog /var/log/apache2/access.json json_combined env=!no_log
```

## mod_log_json (Native JSON)

For cleaner JSON output, use `mod_log_json` if available:

```bash
# Install on Debian/Ubuntu
sudo apt-get install libapache2-mod-log-json
sudo a2enmod log_json
```

Configuration:

```apache
LogFormat json_combined
JSONLog On
JSONLogFields time remote_addr request_method request_uri status body_bytes_sent request_time http_referer http_user_agent

CustomLog /var/log/apache2/access.json json_combined
```

## mod_security Audit Logging

### Enable mod_security Audit Logs

mod_security provides a web application firewall (WAF) with detailed audit logging:

```bash
# Install mod_security
sudo apt-get install libapache2-mod-security2
sudo a2enmod security2
```

Configure audit logging:

```apache
# /etc/modsecurity/modsecurity.conf
SecRuleEngine On

# Audit logging
SecAuditEngine RelevantOnly
SecAuditLogRelevantStatus "^(?:5|4(?!04))"
SecAuditLogParts ABCDEFHZ
SecAuditLogType Serial
SecAuditLog /var/log/apache2/modsec_audit.log

# JSON audit log (mod_security 3.x)
SecAuditLogFormat JSON
```

### Forward mod_security Logs to LogTide

Add a Fluent Bit input for mod_security:

```ini
[INPUT]
    Name          tail
    Path          /var/log/apache2/modsec_audit.log
    Tag           apache.modsecurity
    Parser        json
    Refresh_Interval 5

[FILTER]
    Name          record_modifier
    Match         apache.modsecurity
    Record        service apache
    Record        log_type modsecurity
    Record        level warning
```

### OWASP Core Rule Set

Install the OWASP CRS for comprehensive protection:

```bash
sudo apt-get install modsecurity-crs

# Enable in Apache
sudo cp /etc/modsecurity/crs/crs-setup.conf.example /etc/modsecurity/crs/crs-setup.conf
```

Events from OWASP rules appear in LogTide with details about the matched rule and attack type.

## Production Configuration

### Enhanced Log Format with Security Fields

```apache
# Production JSON format with security-relevant fields
LogFormat "{\"time\":\"%{%Y-%m-%dT%H:%M:%S%z}t\",\"remote_addr\":\"%a\",\"remote_user\":\"%u\",\"request_method\":\"%m\",\"request_uri\":\"%U%q\",\"protocol\":\"%H\",\"status\":%>s,\"body_bytes_sent\":%B,\"request_time_us\":%D,\"http_referer\":\"%{Referer}i\",\"http_user_agent\":\"%{User-Agent}i\",\"http_x_forwarded_for\":\"%{X-Forwarded-For}i\",\"http_x_real_ip\":\"%{X-Real-Ip}i\",\"vhost\":\"%v\",\"server_port\":%{local}p,\"request_id\":\"%{unique_id}e\",\"ssl_protocol\":\"%{SSL_PROTOCOL}x\",\"ssl_cipher\":\"%{SSL_CIPHER}x\",\"content_type\":\"%{Content-Type}o\",\"request_bytes\":%I,\"response_bytes\":%O,\"connection_status\":\"%X\"}" json_production

CustomLog /var/log/apache2/access.json json_production
```

Connection status values:

| Value | Meaning |
|-------|---------|
| `X` | Connection aborted before response completed |
| `+` | Connection may be kept alive |
| `-` | Connection closed after response |

### Log Rotation

Configure logrotate for Apache logs:

```bash
# /etc/logrotate.d/apache2-json
/var/log/apache2/access.json {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 640 root adm
    sharedscripts
    postrotate
        if invoke-rc.d apache2 status > /dev/null 2>&1; then
            invoke-rc.d apache2 reload > /dev/null
        fi
    endscript
}
```

## Docker Setup

### docker-compose.yml

```yaml
services:
  apache:
    image: httpd:2.4-alpine
    container_name: apache
    volumes:
      - ./httpd.conf:/usr/local/apache2/conf/httpd.conf:ro
      - ./vhosts:/usr/local/apache2/conf/extra:ro
      - apache_logs:/var/log/apache2
      - ./htdocs:/usr/local/apache2/htdocs:ro
    ports:
      - "80:80"
      - "443:443"

  fluent-bit:
    image: fluent/fluent-bit:latest
    container_name: fluent-bit
    volumes:
      - ./fluent-bit/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
      - ./fluent-bit/parsers.conf:/fluent-bit/etc/parsers.conf:ro
      - ./fluent-bit/apache_message.lua:/etc/fluent-bit/apache_message.lua:ro
      - apache_logs:/var/log/apache2:ro
    environment:
      - LOGTIDE_API_KEY=${LOGTIDE_API_KEY}
    depends_on:
      - apache
    restart: unless-stopped

volumes:
  apache_logs:
```

### Docker stdout/stderr Alternative

Configure Apache to log to stdout for Docker-native log collection:

```apache
# In httpd.conf
ErrorLog /proc/self/fd/2
CustomLog /proc/self/fd/1 json_combined
```

Then use Docker's Fluentd log driver as shown in the [Docker integration guide](/integrations/docker).

## Vector Configuration (Alternative)

If you prefer Vector over Fluent Bit:

```toml
# /etc/vector/vector.toml

[sources.apache_access]
type = "file"
include = ["/var/log/apache2/access.json"]
read_from = "end"

[transforms.parse_access]
type = "remap"
inputs = ["apache_access"]
source = '''
. = parse_json!(.message)
.service = "apache"
.log_type = "access"
.request_time_ms = to_float(.request_time_us) / 1000.0 ?? 0.0
.level = if .status >= 500 { "error" } else if .status >= 400 { "warn" } else { "info" }
.message = join!([.request_method, .request_uri, to_string!(.status)], separator: " ")
'''

[sources.apache_error]
type = "file"
include = ["/var/log/apache2/error.log"]
read_from = "end"

[transforms.parse_error]
type = "remap"
inputs = ["apache_error"]
source = '''
. = parse_apache_log!(.message, format: "error")
.service = "apache"
.log_type = "error"
.level = "error"
'''

[sinks.logtide]
type = "http"
inputs = ["parse_access", "parse_error"]
uri = "https://YOUR_LOGTIDE_HOST/api/v1/ingest"
method = "post"
encoding.codec = "json"

[sinks.logtide.request.headers]
X-API-Key = "${LOGTIDE_API_KEY}"
Content-Type = "application/json"
```

## Detection Rules

Create alerts for common Apache issues:

### High Error Rate

```
service:apache AND status:>=500
```

Threshold: >10 errors in 5 minutes.

### Slow Requests

```
service:apache AND request_time_ms:>3000
```

Requests taking longer than 3 seconds.

### mod_security Alerts

```
service:apache AND log_type:modsecurity
```

Any occurrence triggers an alert for WAF events.

### Brute Force Detection

```
service:apache AND status:401
```

Threshold: >20 failures in 1 minute from the same `remote_addr`.

### Directory Traversal Attempts

```
service:apache AND request_uri:*../*
```

Any occurrence -- this is always suspicious.

### Large Request Bodies

```
service:apache AND request_bytes:>1048576
```

Requests over 1MB may indicate upload abuse.

## Verification

After setup, verify in LogTide that structured fields are available:

| Field | Example Value |
|-------|---------------|
| service | apache |
| status | 200 |
| request_method | GET |
| request_uri | /api/users?page=1 |
| request_time_ms | 45.2 |
| remote_addr | 192.168.1.100 |
| vhost | app.example.com |
| request_id | ZX1234abc |

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Log overhead | <1ms per request | JSON format with `mod_unique_id` |
| Disk I/O | ~600 bytes/request | Full production format |
| Memory (Fluent Bit) | ~30MB | Tailing access + error logs |
| Memory (Vector) | ~50MB | With JSON parsing transforms |

## Privacy Considerations

For GDPR and PCI-DSS compliance:

### IP Anonymization

Use `mod_removeip` or a custom log format:

```apache
# Option 1: Use mod_remoteip to anonymize
# Option 2: Custom format that truncates IP
LogFormat "{\"remote_addr\":\"%{REMOTE_ADDR_ANON}e\",...}" json_anon

# Set anonymized IP via RewriteRule
RewriteEngine On
RewriteRule .* - [E=REMOTE_ADDR_ANON:%{REMOTE_ADDR}]
```

### Sensitive Header Filtering

Never log `Authorization` or `Cookie` headers:

```apache
LogFormat "{\"http_authorization\":\"[REDACTED]\",...}" json_safe
```

### Retention Policy

Configure LogTide retention to match your compliance requirements. Typical values:

- **GDPR**: 30-90 days for web server logs
- **PCI-DSS**: 1 year minimum for security-relevant logs
- **SOC 2**: 1 year minimum

## Troubleshooting

### JSON logs not valid

1. Check for special characters in request URIs:
   ```bash
   tail -1 /var/log/apache2/access.json | python3 -m json.tool
   ```

2. Ensure proper escaping in the `LogFormat` directive. Apache does not escape JSON special characters in `%U` and `%q` by default. Consider using `mod_log_json` for proper escaping.

### Error log not being parsed

1. Verify the error log format matches the parser regex:
   ```bash
   tail -5 /var/log/apache2/error.log
   ```

2. Apache 2.4 uses a different error log format than 2.2. Ensure your parser matches the version you're running.

### Logs not appearing in LogTide

1. Check Apache is writing to the expected path:
   ```bash
   ls -la /var/log/apache2/access.json
   tail -f /var/log/apache2/access.json
   ```

2. Verify Fluent Bit can read the files:
   ```bash
   sudo systemctl status fluent-bit
   sudo journalctl -u fluent-bit -f
   ```

3. Test LogTide connectivity:
   ```bash
   curl -X POST https://YOUR_LOGTIDE_HOST/api/v1/ingest \
     -H "X-API-Key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"logs":[{"service":"apache","level":"info","message":"test"}]}'
   ```

### mod_security audit log too large

Reduce audit log verbosity:

```apache
# Only log relevant status codes
SecAuditLogRelevantStatus "^5"

# Reduce logged parts
SecAuditLogParts ABZ
```

## Next Steps

- [Docker Integration](/integrations/docker) - Container log collection
- [systemd Integration](/integrations/systemd) - Collect Apache logs via journald
- [PHP Integration](/integrations/php) - Application-level logging from PHP
- [Security Monitoring](/use-cases/security-monitoring) - Build alerting rules on Apache events
- [Compliance Audit Trail](/use-cases/compliance-audit-trail) - Meet compliance requirements
