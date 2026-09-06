---
title: "systemd Journal Integration"
description: "Stream systemd journal logs to LogTide with structured metadata from services, containers, and system components."
category: "infrastructure"
difficulty: "medium"
brandIcon: "simple-icons:linux"
highlights:
  - "Journal metadata"
  - "Unit filtering"
  - "Structured fields"
  - "Boot persistence"
relatedIntegrations:
  - "docker"
  - "nginx"
  - "postgresql"
relatedUseCases:
  - "security-monitoring"
  - "gdpr-compliance"
keywords:
  - "systemd logging"
  - "journald logs"
  - "systemd journal remote"
  - "linux centralized logging"
  - "systemd log forwarding"
  - "journalctl remote"
faqs:
  - question: "How do I forward systemd journal logs to LogTide?"
    answer: "Install Fluent Bit, create /etc/fluent-bit/fluent-bit.conf with the systemd input plugin pointing at /var/log/journal, store your API key in /etc/fluent-bit/environment, configure the HTTP output to send to LogTide, and enable the fluent-bit systemd service."
  - question: "Do I need to change my application code to get logs into LogTide via systemd?"
    answer: "No. Any service that writes to stdout or stderr under systemd automatically has its output captured by the journal. Fluent Bit reads those journal entries and ships them to LogTide, so no code changes are required for existing services."
  - question: "Can I collect only logs from specific systemd units instead of everything?"
    answer: "Yes. Use the Systemd_Filter option in the Fluent Bit INPUT block to limit collection to named units such as nginx.service or myapp.service. You can also use a grep filter with the Exclude directive to drop output from noisy units like systemd-timesyncd or snapd."
  - question: "Does LogTide support structured JSON logs written by applications running under systemd?"
    answer: "Yes. For application services that write JSON to stdout, add a Fluent Bit parser filter with Key_Name MESSAGE and Parser json to the matching tag. This parses the structured fields from the journal MESSAGE field and forwards them as top-level attributes in LogTide."
---

systemd's journal provides rich structured logging for Linux services. This guide shows you how to forward journal logs to LogTide while preserving all the valuable metadata systemd captures automatically.

## Why forward systemd journal logs?

- **Rich metadata**: Unit names, PIDs, UIDs, SELinux contexts, and more
- **Structured by default**: Journal entries are inherently structured
- **System-wide visibility**: Collect from kernel, services, and containers
- **Boot-persistent**: Track issues across reboots
- **Priority filtering**: Route logs by severity level
- **No code changes**: Capture logs from any systemd service

## Prerequisites

- Linux system with systemd 245+ (Ubuntu 20.04+, RHEL 8+, Debian 11+)
- Fluent Bit 2.0+ installed
- LogTide instance with API key
- Root or sudo access for configuration

## Installation

### Install Fluent Bit

```bash
# Ubuntu/Debian
curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh

# RHEL/CentOS/Fedora
curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh

# Or via package manager
# Ubuntu/Debian
sudo apt-get install fluent-bit

# RHEL/CentOS (enable EPEL first)
sudo yum install fluent-bit
```

### Verify Installation

```bash
fluent-bit --version
# Fluent Bit v2.x.x
```

## Quick Start (10 minutes)

### 1. Configure Fluent Bit

Create `/etc/fluent-bit/fluent-bit.conf`:

```ini
[SERVICE]
    Flush         5
    Log_Level     info
    Daemon        off
    Parsers_File  parsers.conf

[INPUT]
    Name            systemd
    Tag             systemd.*
    Read_From_Tail  On
    Strip_Underscores On

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

### 2. Set API Key

```bash
# Create environment file
sudo mkdir -p /etc/fluent-bit
echo "LOGTIDE_API_KEY=your-api-key" | sudo tee /etc/fluent-bit/environment
sudo chmod 600 /etc/fluent-bit/environment
```

### 3. Configure systemd Service

Create `/etc/systemd/system/fluent-bit.service.d/override.conf`:

```ini
[Service]
EnvironmentFile=/etc/fluent-bit/environment
```

### 4. Start Fluent Bit

```bash
sudo systemctl daemon-reload
sudo systemctl enable fluent-bit
sudo systemctl start fluent-bit
sudo systemctl status fluent-bit
```

## Production Configuration

### Full Fluent Bit Configuration

```ini
# /etc/fluent-bit/fluent-bit.conf
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
    storage.path      /var/log/fluent-bit/
    storage.sync      normal
    storage.checksum  off
    storage.backlog.mem_limit 50M

# Read from systemd journal
[INPUT]
    Name              systemd
    Tag               systemd.*
    Path              /var/log/journal
    Read_From_Tail    On
    Strip_Underscores On
    DB                /var/log/fluent-bit/systemd.db

# Filter to specific units (optional)
[INPUT]
    Name                     systemd
    Tag                      systemd.apps.*
    Systemd_Filter           _SYSTEMD_UNIT=nginx.service
    Systemd_Filter           _SYSTEMD_UNIT=myapp.service
    Systemd_Filter           _SYSTEMD_UNIT=postgresql.service
    Read_From_Tail           On
    Strip_Underscores        On
    DB                       /var/log/fluent-bit/systemd-apps.db

# Add hostname and environment
[FILTER]
    Name          record_modifier
    Match         systemd.*
    Record        hostname ${HOSTNAME}
    Record        environment production
    Record        source systemd

# Map journal fields to LogTide fields
[FILTER]
    Name          modify
    Match         systemd.*
    Rename        SYSTEMD_UNIT unit
    Rename        PRIORITY priority
    Rename        MESSAGE message
    Rename        SYSLOG_IDENTIFIER service
    Rename        _PID pid
    Rename        _UID uid
    Rename        _GID gid
    Rename        _CMDLINE cmdline
    Rename        _EXE exe

# Convert priority to level
[FILTER]
    Name          lua
    Match         systemd.*
    script        /etc/fluent-bit/priority_to_level.lua
    call          priority_to_level

# Output to LogTide
[OUTPUT]
    Name                  http
    Match                 *
    Host                  api.logtide.dev
    Port                  443
    URI                   /api/v1/ingest/single
    Format                json
    Header                X-API-Key ${LOGTIDE_API_KEY}
    Header                Content-Type application/json
    tls                   On
    tls.verify            On
    Retry_Limit           5
    storage.total_limit_size 100M
```

### Priority to Level Mapping

Create the Lua script for converting syslog priorities to log levels:

```bash
# Create the Lua script
sudo tee /etc/fluent-bit/priority_to_level.lua << 'LUAEOF'

```lua
-- Map syslog priority to log level
local priority_map = {
    ["0"] = "critical",  - EMERG
    ["1"] = "critical",  - ALERT
    ["2"] = "critical",  - CRIT
    ["3"] = "error",     - ERR
    ["4"] = "warning",   - WARNING
    ["5"] = "info",      - NOTICE
    ["6"] = "info",      - INFO
    ["7"] = "debug"      - DEBUG
}

function priority_to_level(tag, timestamp, record)
    local priority = record["priority"]
    if priority then
        record["level"] = priority_map[tostring(priority)] or "info"
    else
        record["level"] = "info"
    end
    return 1, timestamp, record
end
LUAEOF

# Set proper permissions
sudo chmod 644 /etc/fluent-bit/priority_to_level.lua
```

## Filtering by Unit

### Filter Specific Services

Only collect logs from specific units:

```ini
[INPUT]
    Name                     systemd
    Tag                      systemd.web.*
    Systemd_Filter           _SYSTEMD_UNIT=nginx.service
    Systemd_Filter           _SYSTEMD_UNIT=apache2.service
    Read_From_Tail           On
```

### Filter by Priority

Only collect warnings and above:

```ini
[INPUT]
    Name                     systemd
    Tag                      systemd.important.*
    Systemd_Filter           PRIORITY=0
    Systemd_Filter           PRIORITY=1
    Systemd_Filter           PRIORITY=2
    Systemd_Filter           PRIORITY=3
    Systemd_Filter           PRIORITY=4
    Read_From_Tail           On
```

### Exclude Noisy Units

```ini
[FILTER]
    Name     grep
    Match    systemd.*
    Exclude  unit ^(systemd-timesyncd|snapd)\.service$
```

## Creating Application Services

### Example: Node.js Application Service

Create `/etc/systemd/system/myapp.service`:

```ini
[Unit]
Description=My Node.js Application
After=network.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/usr/bin/node /opt/myapp/server.js
Restart=always
RestartSec=10

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/opt/myapp/.env

# Logging (goes to journal)
StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/opt/myapp/data

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable myapp
sudo systemctl start myapp
```

### Application Logging Best Practices

Structure your application logs for better parsing:

```javascript
// Node.js example
const log = (level, message, data = {}) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data
  }));
};

// Usage
log('info', 'Server started', { port: 3000 });
log('error', 'Database connection failed', { error: err.message });
```

Fluent Bit can parse this JSON:

```ini
[FILTER]
    Name          parser
    Match         systemd.apps.myapp
    Key_Name      MESSAGE
    Parser        json
    Reserve_Data  On
```

## Docker with journald Driver

Use journald as Docker's logging driver:

### Configure Docker Daemon

Edit `/etc/docker/daemon.json`:

```json
{
  "log-driver": "journald",
  "log-opts": {
    "tag": "docker/{{.Name}}"
  }
}
```

Restart Docker:

```bash
sudo systemctl restart docker
```

### Collect Docker Logs via Journal

```ini
[INPUT]
    Name                     systemd
    Tag                      docker.*
    Systemd_Filter           CONTAINER_NAME=*
    Read_From_Tail           On
    Strip_Underscores        On

[FILTER]
    Name          modify
    Match         docker.*
    Rename        CONTAINER_NAME container
    Rename        CONTAINER_ID container_id
    Rename        IMAGE_NAME image
```

## Journal Metadata Fields

systemd journal provides rich metadata automatically:

| Journal Field | Description | Example |
|---------------|-------------|---------|
| `_SYSTEMD_UNIT` | Service unit name | `nginx.service` |
| `_PID` | Process ID | `1234` |
| `_UID` | User ID | `1000` |
| `_GID` | Group ID | `1000` |
| `_COMM` | Command name | `nginx` |
| `_EXE` | Executable path | `/usr/sbin/nginx` |
| `_CMDLINE` | Full command line | `nginx: master process` |
| `PRIORITY` | Syslog priority (0-7) | `6` |
| `SYSLOG_IDENTIFIER` | Service identifier | `nginx` |
| `_HOSTNAME` | Hostname | `web-server-1` |
| `_MACHINE_ID` | Machine UUID | `abc123...` |
| `_BOOT_ID` | Boot UUID | `def456...` |
| `__REALTIME_TIMESTAMP` | Timestamp (microseconds) | `1706972400000000` |

## Persistent Journal Configuration

Ensure journal logs persist across reboots:

```bash
# Create journal directory
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal

# Configure journald
sudo tee /etc/systemd/journald.conf.d/persistent.conf << EOF
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=2G
SystemKeepFree=1G
MaxRetentionSec=30day
ForwardToSyslog=no
EOF

# Restart journald
sudo systemctl restart systemd-journald
```

## Verification

### Check Fluent Bit Status

```bash
# Service status
sudo systemctl status fluent-bit

# Fluent Bit logs
sudo journalctl -u fluent-bit -f

# HTTP health check
curl http://localhost:2020/api/v1/health
```

### Verify Journal Reading

```bash
# Check Fluent Bit is reading from journal
sudo journalctl -u fluent-bit | grep -i "systemd"

# Send a test log
logger -p user.info "Test message from $(hostname)"

# Check in LogTide for the test message
```

### View Journal Entries

```bash
# Recent entries
journalctl -n 50

# Specific unit
journalctl -u nginx.service -f

# JSON output (see what Fluent Bit sees)
journalctl -o json -n 1 | jq .
```

## Performance Tuning

### Memory Usage

Control Fluent Bit memory usage:

```ini
[SERVICE]
    storage.backlog.mem_limit 25M

[INPUT]
    Name       systemd
    Mem_Buf_Limit 10M
```

### Read Position Tracking

Use a database to track read position:

```ini
[INPUT]
    Name    systemd
    DB      /var/log/fluent-bit/systemd.db
```

### Disk Buffering

Enable disk buffering for reliability:

```ini
[SERVICE]
    storage.path     /var/log/fluent-bit/
    storage.sync     normal
    storage.checksum off

[OUTPUT]
    Name    http
    storage.total_limit_size 200M
```

## Security Considerations

### Run Fluent Bit with Minimal Permissions

```ini
# /etc/systemd/system/fluent-bit.service.d/security.conf
[Service]
# Read-only access to journal
ReadOnlyPaths=/var/log/journal
ReadWritePaths=/var/log/fluent-bit

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
CapabilityBoundingSet=CAP_DAC_READ_SEARCH
```

### Filter Sensitive Data

Remove or hash sensitive information:

```ini
[FILTER]
    Name          modify
    Match         *
    Remove        _SELINUX_CONTEXT
    Remove        _SOURCE_REALTIME_TIMESTAMP

[FILTER]
    Name          lua
    Match         *
    script        /etc/fluent-bit/sanitize.lua
    call          sanitize_logs
```

```lua
-- /etc/fluent-bit/sanitize.lua
function sanitize_logs(tag, timestamp, record)
    - Hash user IDs
    if record["uid"] then
        record["uid_hash"] = hash(record["uid"])
        record["uid"] = nil
    end

    - Remove command line (may contain secrets)
    record["cmdline"] = nil

    return 1, timestamp, record
end

function hash(value)
    - Simple hash for demonstration
    local h = 0
    for i = 1, #value do
        h = (h * 31 + string.byte(value, i)) % 2147483647
    end
    return string.format("%x", h)
end
```

## Troubleshooting

### Fluent Bit not reading from journal

1. **Check permissions:**
```bash
# Fluent Bit user needs access to journal
sudo usermod -a -G systemd-journal fluent-bit
sudo systemctl restart fluent-bit
```

2. **Verify journal path:**
```bash
ls -la /var/log/journal/
# Or for volatile journal:
ls -la /run/log/journal/
```

3. **Check Fluent Bit logs:**
```bash
sudo journalctl -u fluent-bit -n 100 --no-pager
```

### High CPU usage

Reduce processing with filters:

```ini
[INPUT]
    Name       systemd
    # Skip old logs
    Read_From_Tail On
    # Only specific units
    Systemd_Filter _SYSTEMD_UNIT=myapp.service
```

### Missing logs after reboot

Enable position tracking:

```ini
[INPUT]
    Name    systemd
    DB      /var/log/fluent-bit/systemd.db
    DB.Sync Full
```

## Next Steps

- **[Docker Integration](/integrations/docker/)** - Container logging patterns
- **[nginx Integration](/integrations/nginx/)** - Web server log parsing
- **[PostgreSQL Integration](/integrations/postgresql/)** - Database logging
- **[Security Monitoring](/use-cases/security-monitoring/)** - Build alerting on journal events
