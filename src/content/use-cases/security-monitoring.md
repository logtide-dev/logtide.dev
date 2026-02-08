---
title: "Security Monitoring and Threat Detection"
description: "Build SIEM-like security monitoring with LogTide. Detect suspicious logins, brute force attacks, and security anomalies."
category: "security"
difficulty: "advanced"
icon: "lucide:shield-alert"
industries:
  - "SaaS"
  - "Fintech"
  - "Healthcare"
  - "E-commerce"
highlights:
  - "Brute force detection"
  - "Suspicious login alerts"
  - "Real-time monitoring"
  - "Audit trails"
relatedIntegrations:
  - "nginx"
  - "nodejs"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "security logging"
  - "SIEM alternative"
  - "threat detection"
  - "brute force detection"
  - "security monitoring"
  - "audit logging"
---

Traditional SIEM solutions are expensive and complex. LogTide provides the foundation for security monitoring at a fraction of the cost. This guide shows you how to detect threats, monitor for anomalies, and maintain audit trails.

## Why Security Monitoring with LogTide?

- **Cost-effective**: No per-GB pricing that punishes security logging
- **Self-hosted option**: Keep security data in your infrastructure
- **Real-time alerting**: Immediate notification of security events
- **Correlation**: Link security events across your entire stack
- **Compliance**: Audit trails for SOC2, ISO27001, HIPAA

## Security Logging Architecture

**Data Sources:**
- **nginx/WAF**: Access logs, blocked requests, rate limiting
- **API Servers**: Authentication events, authorization failures
- **Database**: Query audit logs, connection events
- **Auth Service**: Login attempts, password resets, MFA events

**Processing:**
- All security events flow into LogTide with severity levels
- Real-time detection rules analyze incoming logs
- Alerts trigger via Slack, PagerDuty, or webhooks
- Long-term archive to S3 for compliance

## Implementation

### 1. Security Event Logging

Create a dedicated security logger:

```typescript
// lib/security-logger.ts
import { LogTideClient } from '@logtide/sdk-node';

const client = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
  // Or use a DSN string instead:
  // dsn: process.env.LOGTIDE_DSN,
  globalMetadata: {
    service: 'security',
    environment: process.env.NODE_ENV,
  },
});

interface SecurityEvent {
  event: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export const securityLogger = {
  log(event: SecurityEvent) {
    const level = event.severity === 'critical' || event.severity === 'high'
      ? 'error'
      : event.severity === 'medium'
      ? 'warn'
      : 'info';

    client[level](`SECURITY: ${event.event}`, {
      security_event: event.event,
      severity: event.severity,
      user_id: event.userId,
      source_ip: event.ip,
      user_agent: event.userAgent,
      ...event.metadata,
    });
  },

  // Convenience methods
  loginSuccess(userId: string, ip: string, method: string) {
    this.log({
      event: 'login_success',
      severity: 'low',
      userId,
      ip,
      metadata: { method },
    });
  },

  loginFailed(email: string, ip: string, reason: string) {
    this.log({
      event: 'login_failed',
      severity: 'medium',
      ip,
      metadata: { email_hash: hashEmail(email), reason },
    });
  },

  suspiciousActivity(event: string, details: Record<string, unknown>) {
    this.log({
      event,
      severity: 'high',
      ...details,
    });
  },

  criticalAlert(event: string, details: Record<string, unknown>) {
    this.log({
      event,
      severity: 'critical',
      ...details,
    });
  },
};
```

### 2. Authentication Monitoring

```typescript
// auth/login.ts
import { securityLogger } from '@/lib/security-logger';
import { RateLimiter } from '@/lib/rate-limiter';

const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];

  // Check rate limit
  const rateLimitResult = await loginLimiter.check(ip);
  if (!rateLimitResult.allowed) {
    securityLogger.suspiciousActivity('brute_force_detected', {
      ip,
      userAgent,
      attempts: rateLimitResult.attempts,
      metadata: { email_hash: hashEmail(email) },
    });

    return res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
    });
  }

  try {
    const user = await authenticate(email, password);

    if (!user) {
      securityLogger.loginFailed(email, ip, 'invalid_credentials');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check for suspicious patterns
    await checkLoginAnomalies(user, ip, userAgent);

    securityLogger.loginSuccess(user.id, ip, 'password');

    const token = generateToken(user);
    res.json({ token });
  } catch (error) {
    securityLogger.log({
      event: 'login_error',
      severity: 'high',
      ip,
      metadata: {
        email_hash: hashEmail(email),
        error: error.message,
      },
    });

    res.status(500).json({ error: 'Login failed' });
  }
});

async function checkLoginAnomalies(user: User, ip: string, userAgent: string) {
  // Check for new device
  const knownDevices = await getKnownDevices(user.id);
  const deviceFingerprint = generateFingerprint(userAgent);

  if (!knownDevices.includes(deviceFingerprint)) {
    securityLogger.log({
      event: 'new_device_login',
      severity: 'medium',
      userId: user.id,
      ip,
      userAgent,
      metadata: { fingerprint: deviceFingerprint },
    });

    // Optionally send notification to user
    await notifyNewDeviceLogin(user, ip, userAgent);
  }

  // Check for impossible travel
  const lastLogin = await getLastLogin(user.id);
  if (lastLogin && isImpossibleTravel(lastLogin.ip, ip, lastLogin.time)) {
    securityLogger.suspiciousActivity('impossible_travel', {
      userId: user.id,
      ip,
      metadata: {
        previous_ip: lastLogin.ip,
        previous_time: lastLogin.time,
        time_diff_minutes: (Date.now() - lastLogin.time) / 60000,
      },
    });
  }

  // Check for unusual time
  const userTimezone = user.timezone || 'UTC';
  const localHour = getLocalHour(userTimezone);
  if (localHour >= 1 && localHour <= 5) {
    securityLogger.log({
      event: 'unusual_hour_login',
      severity: 'low',
      userId: user.id,
      ip,
      metadata: { local_hour: localHour, timezone: userTimezone },
    });
  }
}
```

### 3. API Rate Limiting and Abuse Detection

```typescript
// middleware/rate-limit.ts
import { securityLogger } from '@/lib/security-logger';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
}

export function createRateLimiter(config: RateLimitConfig) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyGenerator?.(req) || req.ip;
    const now = Date.now();

    let record = hits.get(key);
    if (!record || record.resetAt < now) {
      record = { count: 0, resetAt: now + config.windowMs };
      hits.set(key, record);
    }

    record.count++;

    if (record.count > config.max) {
      // Log rate limit violation
      securityLogger.log({
        event: 'rate_limit_exceeded',
        severity: record.count > config.max * 2 ? 'high' : 'medium',
        ip: req.ip,
        metadata: {
          path: req.path,
          method: req.method,
          attempts: record.count,
          limit: config.max,
          user_id: req.user?.id,
        },
      });

      res.set('Retry-After', Math.ceil((record.resetAt - now) / 1000).toString());
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: record.resetAt,
      });
    }

    next();
  };
}

// Apply different limits to different endpoints
app.use('/api/auth/*', createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
}));

app.use('/api/password-reset', createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
}));

app.use('/api/*', createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user?.id || req.ip,
}));
```

### 4. Privilege Escalation Monitoring

```typescript
// middleware/audit-sensitive.ts
import { securityLogger } from '@/lib/security-logger';

const SENSITIVE_OPERATIONS = [
  { method: 'POST', path: '/api/users', event: 'user_created' },
  { method: 'DELETE', path: '/api/users/:id', event: 'user_deleted' },
  { method: 'PUT', path: '/api/users/:id/role', event: 'role_changed' },
  { method: 'POST', path: '/api/api-keys', event: 'api_key_created' },
  { method: 'DELETE', path: '/api/api-keys/:id', event: 'api_key_revoked' },
  { method: 'PUT', path: '/api/settings/security', event: 'security_settings_changed' },
];

export function auditSensitiveOperations(req: Request, res: Response, next: NextFunction) {
  const operation = SENSITIVE_OPERATIONS.find(op =>
    op.method === req.method && matchPath(op.path, req.path)
  );

  if (operation) {
    // Log before operation
    securityLogger.log({
      event: `${operation.event}_attempted`,
      severity: 'medium',
      userId: req.user?.id,
      ip: req.ip,
      metadata: {
        path: req.path,
        method: req.method,
        target_id: req.params.id,
      },
    });

    // Capture response
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      // Log after operation
      securityLogger.log({
        event: res.statusCode < 400 ? operation.event : `${operation.event}_failed`,
        severity: res.statusCode < 400 ? 'medium' : 'high',
        userId: req.user?.id,
        ip: req.ip,
        metadata: {
          path: req.path,
          method: req.method,
          target_id: req.params.id,
          status_code: res.statusCode,
        },
      });

      return originalJson(body);
    };
  }

  next();
}
```

### 5. SQL Injection and XSS Detection

```typescript
// middleware/input-validation.ts
import { securityLogger } from '@/lib/security-logger';

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/i,
  /(--|#|\/\*)/,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
  /('\s*OR\s*')/i,
];

const XSS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe/i,
  /<object/i,
];

export function detectMaliciousInput(req: Request, res: Response, next: NextFunction) {
  const inputs = [
    ...Object.values(req.query),
    ...Object.values(req.params),
    ...(req.body ? Object.values(flattenObject(req.body)) : []),
  ].filter(v => typeof v === 'string');

  for (const input of inputs) {
    // Check for SQL injection
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        securityLogger.criticalAlert('sql_injection_attempt', {
          ip: req.ip,
          userId: req.user?.id,
          userAgent: req.headers['user-agent'],
          metadata: {
            path: req.path,
            method: req.method,
            pattern: pattern.source,
            // Don't log the actual input to avoid log injection
            input_length: input.length,
          },
        });

        return res.status(400).json({ error: 'Invalid input' });
      }
    }

    // Check for XSS
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(input)) {
        securityLogger.suspiciousActivity('xss_attempt', {
          ip: req.ip,
          userId: req.user?.id,
          userAgent: req.headers['user-agent'],
          metadata: {
            path: req.path,
            method: req.method,
            pattern: pattern.source,
          },
        });

        return res.status(400).json({ error: 'Invalid input' });
      }
    }
  }

  next();
}
```

## Detection Rules

### Brute Force Attack

```
service:security AND security_event:login_failed
| window 5m
| group by source_ip
| count > 10
```

Alert: "Brute force attack detected from {source_ip}"

### Account Takeover Attempt

```
service:security AND security_event:login_success AND new_device_login
| join (security_event:password_reset_requested) on user_id
| within 24h
```

Alert: "Possible account takeover for user {user_id}"

### Privilege Escalation

```
service:security AND security_event:role_changed
| where metadata.new_role = "admin"
```

Alert: "User {target_id} promoted to admin by {user_id}"

### API Abuse

```
service:security AND security_event:rate_limit_exceeded
| window 1h
| group by source_ip
| count > 50
```

Alert: "Sustained API abuse from {source_ip}"

### Impossible Travel

```
service:security AND security_event:impossible_travel
```

Alert: "Impossible travel detected for user {user_id}"

### Off-Hours Admin Activity

```
service:security AND severity:high
| where hour >= 22 OR hour <= 6
| where user_role = "admin"
```

Alert: "Admin activity outside business hours"

## Real-Time Alerting

### Slack Integration

```typescript
// lib/security-alerts.ts
import { IncomingWebhook } from '@slack/webhook';

const webhook = new IncomingWebhook(process.env.SLACK_SECURITY_WEBHOOK!);

export async function sendSecurityAlert(event: SecurityEvent) {
  if (event.severity !== 'high' && event.severity !== 'critical') {
    return;
  }

  const color = event.severity === 'critical' ? '#FF0000' : '#FFA500';

  await webhook.send({
    attachments: [{
      color,
      title: `🚨 Security Alert: ${event.event}`,
      fields: [
        { title: 'Severity', value: event.severity.toUpperCase(), short: true },
        { title: 'IP Address', value: event.ip || 'Unknown', short: true },
        { title: 'User ID', value: event.userId || 'N/A', short: true },
        { title: 'Time', value: new Date().toISOString(), short: true },
      ],
      footer: 'LogTide Security Monitoring',
    }],
  });
}
```

### PagerDuty Integration

```typescript
// lib/pagerduty.ts
import { event } from '@pagerduty/pdjs';

export async function triggerIncident(securityEvent: SecurityEvent) {
  if (securityEvent.severity !== 'critical') {
    return;
  }

  await event({
    data: {
      routing_key: process.env.PAGERDUTY_ROUTING_KEY!,
      event_action: 'trigger',
      dedup_key: `security-${securityEvent.event}-${securityEvent.ip}`,
      payload: {
        summary: `Critical Security Event: ${securityEvent.event}`,
        severity: 'critical',
        source: 'LogTide Security Monitoring',
        custom_details: {
          event: securityEvent.event,
          ip: securityEvent.ip,
          user_id: securityEvent.userId,
          ...securityEvent.metadata,
        },
      },
    },
  });
}
```

## Audit Trail for Compliance

### SOC2 / ISO27001 Requirements

```typescript
// All security events should include:
interface AuditEvent {
  // Who
  user_id: string;
  user_email: string;
  user_role: string;

  // What
  action: string;
  resource_type: string;
  resource_id: string;

  // When
  timestamp: string;

  // Where
  source_ip: string;
  user_agent: string;
  session_id: string;

  // Result
  success: boolean;
  error_message?: string;
}

export function logAuditEvent(event: AuditEvent) {
  client.info('AUDIT', {
    ...event,
    audit: true, // Flag for compliance queries
  });
}
```

### Retention Policy

For compliance, configure retention:
- Security events: 1 year minimum
- Audit logs: 7 years (financial services)
- Access logs: 90 days

## Security Monitoring Checklist

- [ ] **Authentication Events**
    - [ ] Login success/failure with IP and device
    - [ ] Password reset requests
    - [ ] MFA enablement/disablement
    - [ ] Session creation/termination

- [ ] **Authorization Events**
    - [ ] Role changes
    - [ ] Permission grants/revokes
    - [ ] API key creation/revocation
    - [ ] Resource access attempts

- [ ] **Data Access**
    - [ ] Sensitive data queries
    - [ ] Bulk exports
    - [ ] PII access

- [ ] **Infrastructure**
    - [ ] Failed SSH attempts
    - [ ] Firewall blocks
    - [ ] Certificate errors

- [ ] **Anomaly Detection**
    - [ ] Impossible travel
    - [ ] Unusual access patterns
    - [ ] Off-hours activity

## Common Pitfalls

### 1. "We log everything, we're secure"

Logging without monitoring is useless.

**Solution:** Set up active alerts for critical events.

### 2. "Our logs contain too much noise"

Then you'll miss the real threats.

**Solution:** Severity levels and filtered dashboards.

### 3. "We'll investigate breaches after they happen"

By then it's too late.

**Solution:** Real-time alerting for suspicious patterns.

## Next Steps

- [nginx Integration](/integrations/nginx) - Web server security logs
- [Node.js SDK](/integrations/nodejs) - Application security logging
- [GDPR Compliance](/use-cases/gdpr-compliance) - Privacy requirements
