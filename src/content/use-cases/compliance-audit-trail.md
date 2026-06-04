---
title: "SOC2 & ISO27001 Audit Trail Logging"
description: "Build compliant audit trails for SOC2 and ISO27001 certifications with LogTide. Evidence collection, retention, and access controls."
category: "compliance"
difficulty: "advanced"
icon: "lucide:file-check"
industries:
  - "SaaS"
  - "Fintech"
  - "Healthcare"
  - "Enterprise"
highlights:
  - "SOC2 Type II ready"
  - "ISO27001 Annex A"
  - "Tamper-evident logs"
  - "Automated retention"
relatedIntegrations:
  - "nodejs"
  - "postgresql"
relatedUseCases:
  - "gdpr-compliance"
  - "security-monitoring"
keywords:
  - "SOC2 logging"
  - "ISO27001 audit trail"
  - "compliance logging"
  - "audit log"
  - "security audit"
  - "compliance evidence"
faqs:
  - question: "How does LogTide support SOC2 audit trail requirements?"
    answer: "LogTide captures structured audit events covering authentication, authorization changes, data access, and configuration modifications — the evidence categories that SOC2 Type II auditors specifically request. Logs are stored in append-only TimescaleDB storage, and retention can be configured per log type to meet the 1-year minimum for most SOC2 controls."
  - question: "Can LogTide satisfy ISO27001 Annex A logging controls?"
    answer: "Yes. LogTide addresses ISO27001 controls A.8.15 (event logging), A.8.16 (anomaly monitoring via Sigma rules), A.5.33 (record protection via immutable TimescaleDB storage), and A.5.23 (cloud-service access logging) through its self-hosted, structured audit logging capabilities."
  - question: "How do I respond to an auditor asking who accessed production systems in the last 90 days?"
    answer: "With LogTide you can run a single query such as service:audit AND action:auth.* AND time:>90d to retrieve all authentication events within the window. The structured schema captures actor ID, email, role, IP address, and outcome for every event."
  - question: "Does LogTide prevent log tampering to satisfy integrity requirements?"
    answer: "Log data is written to TimescaleDB in append-only hypertables, making retroactive modification difficult. Access to the log storage is restricted through role-based controls, and access to the logs themselves can be audited as a meta-audit layer."
---

SOC2 and ISO27001 certifications require comprehensive audit trails. This guide shows how to implement compliant logging with LogTide that satisfies auditor requirements and makes evidence collection straightforward.

## Why Audit Trail Logging Matters

### SOC2 Trust Service Criteria

SOC2 Type II requires demonstrable controls across five categories. Logging is central to three of them:

| Trust Criteria | Logging Requirement | Evidence Needed |
|---------------|--------------------|-----------------|
| Security (CC6) | Access controls, authentication events | Login/logout, permission changes, MFA events |
| Availability (A1) | System monitoring, incident detection | Uptime logs, error rates, incident timelines |
| Processing Integrity (PI1) | Data processing accuracy | Transaction logs, data validation events |

### ISO27001 Annex A Controls

ISO27001 Annex A specifies controls that require audit logging:

- **A.8.15** - Logging: Event logs recording user activities, exceptions, faults
- **A.8.16** - Monitoring activities: Monitoring for anomalous behavior
- **A.5.33** - Protection of records: Ensuring log integrity and retention
- **A.5.23** - Information security for cloud services: Cloud access logging

### What Auditors Actually Ask

From real SOC2 and ISO27001 audits:

1. *"Show me who accessed the production database in the last 90 days"*
2. *"How do you detect unauthorized access attempts?"*
3. *"What's your log retention policy and how is it enforced?"*
4. *"Can logs be tampered with? How do you ensure integrity?"*
5. *"Show me the incident response timeline for your last security event"*

If you can't answer these with data, you fail the audit.

## The LogTide Approach

LogTide provides the infrastructure for compliant audit trails:

1. **Structured audit events** with consistent schema
2. **Immutable storage** with TimescaleDB
3. **Role-based access** to log data
4. **Configurable retention** with automatic enforcement
5. **Built-in SIEM** for anomaly detection (Sigma rules)
6. **Self-hosted** for full data sovereignty

## Implementation

### 1. Audit Event Schema

Define a consistent schema for all audit events:

```typescript
// lib/audit-logger.ts
import { LogTideClient } from '@logtide/sdk-node';

interface AuditEvent {
  // WHO performed the action
  actorId: string;
  actorEmail: string;
  actorRole: string;
  actorIp: string;
  actorUserAgent: string;

  // WHAT happened
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'success' | 'failure' | 'denied';

  // DETAILS
  details?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;

  // CONTEXT
  sessionId: string;
  requestId: string;
}

const client = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
  // Or use a DSN string instead:
  // dsn: process.env.LOGTIDE_DSN,
  globalMetadata: {
    service: 'audit',
    environment: process.env.NODE_ENV,
    auditVersion: '1.0',
  },
});

export function logAudit(event: AuditEvent) {
  const level = event.outcome === 'denied' ? 'warn' :
                event.outcome === 'failure' ? 'error' : 'info';

  client[level]('audit', `AUDIT: ${event.action}`, {
    audit: true,
    actor_id: event.actorId,
    actor_email: event.actorEmail,
    actor_role: event.actorRole,
    actor_ip: event.actorIp,
    actor_user_agent: event.actorUserAgent,
    action: event.action,
    resource_type: event.resourceType,
    resource_id: event.resourceId,
    outcome: event.outcome,
    session_id: event.sessionId,
    request_id: event.requestId,
    details: event.details,
    previous_state: event.previousState,
    new_state: event.newState,
  });
}
```

### 2. Authentication Events (SOC2 CC6.1)

```typescript
// auth/login.ts
import { logAudit } from '@/lib/audit-logger';

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await authenticate(email, password);

    if (!user) {
      logAudit({
        actorId: 'unknown',
        actorEmail: email,
        actorRole: 'unknown',
        actorIp: req.ip,
        actorUserAgent: req.headers['user-agent'] || '',
        action: 'auth.login',
        resourceType: 'session',
        resourceId: 'N/A',
        outcome: 'failure',
        sessionId: 'N/A',
        requestId: req.id,
        details: { reason: 'invalid_credentials' },
      });

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const session = await createSession(user);

    logAudit({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      actorIp: req.ip,
      actorUserAgent: req.headers['user-agent'] || '',
      action: 'auth.login',
      resourceType: 'session',
      resourceId: session.id,
      outcome: 'success',
      sessionId: session.id,
      requestId: req.id,
      details: { method: 'password', mfaUsed: user.mfaEnabled },
    });

    res.json({ token: session.token });
  } catch (error) {
    logAudit({
      actorId: 'unknown',
      actorEmail: email,
      actorRole: 'unknown',
      actorIp: req.ip,
      actorUserAgent: req.headers['user-agent'] || '',
      action: 'auth.login',
      resourceType: 'session',
      resourceId: 'N/A',
      outcome: 'failure',
      sessionId: 'N/A',
      requestId: req.id,
      details: { reason: 'system_error', error: error.message },
    });

    res.status(500).json({ error: 'Login failed' });
  }
});
```

### 3. Authorization & Access Control (SOC2 CC6.3)

```typescript
// middleware/audit-access.ts
import { logAudit } from '@/lib/audit-logger';

// Audit all sensitive data access
export function auditDataAccess(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Capture original json to audit response
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const duration = Date.now() - startTime;
      const outcome = res.statusCode < 400 ? 'success' :
                      res.statusCode === 403 ? 'denied' : 'failure';

      logAudit({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        actorIp: req.ip,
        actorUserAgent: req.headers['user-agent'] || '',
        action: `${resourceType}.${req.method.toLowerCase()}`,
        resourceType,
        resourceId: req.params.id || 'list',
        outcome,
        sessionId: req.sessionId,
        requestId: req.id,
        details: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: duration,
        },
      });

      return originalJson(body);
    };

    next();
  };
}

// Apply to sensitive endpoints
app.use('/api/users', auditDataAccess('user'));
app.use('/api/billing', auditDataAccess('billing'));
app.use('/api/settings', auditDataAccess('settings'));
app.use('/api/api-keys', auditDataAccess('api_key'));
```

### 4. Change Tracking (SOC2 CC8.1)

```typescript
// middleware/audit-changes.ts
import { logAudit } from '@/lib/audit-logger';

export function auditChanges(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only audit mutating operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Capture previous state for updates
    let previousState: Record<string, unknown> | undefined;
    if (req.params.id && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      previousState = await getResourceState(resourceType, req.params.id);
    }

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const action = req.method === 'POST' ? 'create' :
                     req.method === 'DELETE' ? 'delete' : 'update';

      logAudit({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        actorIp: req.ip,
        actorUserAgent: req.headers['user-agent'] || '',
        action: `${resourceType}.${action}`,
        resourceType,
        resourceId: req.params.id || body?.id || 'unknown',
        outcome: res.statusCode < 400 ? 'success' : 'failure',
        sessionId: req.sessionId,
        requestId: req.id,
        previousState,
        newState: req.method !== 'DELETE' ? sanitizeForAudit(req.body) : undefined,
        details: {
          changedFields: previousState
            ? getChangedFields(previousState, req.body)
            : undefined,
        },
      });

      return originalJson(body);
    };

    next();
  };
}

function getChangedFields(
  previous: Record<string, unknown>,
  current: Record<string, unknown>
): string[] {
  return Object.keys(current).filter(
    key => JSON.stringify(previous[key]) !== JSON.stringify(current[key])
  );
}

function sanitizeForAudit(data: Record<string, unknown>): Record<string, unknown> {
  const { password, token, secret, ...safe } = data;
  return safe;
}
```

### 5. Retention Policy Configuration

Configure retention to meet compliance requirements:

| Log Type | SOC2 Requirement | ISO27001 Requirement | Recommended Retention |
|----------|-----------------|---------------------|----------------------|
| Authentication events | 1 year | Per risk assessment | 1 year |
| Access control changes | 1 year | Per risk assessment | 2 years |
| Data modifications | 1 year | Per risk assessment | 1 year |
| System errors | 90 days | Per risk assessment | 90 days |
| Security incidents | 3 years | Per risk assessment | 3 years |
| Financial transactions | 7 years | Per risk assessment | 7 years |

In LogTide, configure retention per-service or per-level through your organization settings.

## Evidence Collection for Auditors

### Common Auditor Queries

**"Show authentication events for the last 90 days"**
```
service:audit AND action:auth.* AND time:>90d
```

**"Show all permission changes"**
```
service:audit AND action:*.update AND resource_type:role
```

**"Show failed access attempts"**
```
service:audit AND outcome:denied
```

**"Show all admin actions"**
```
service:audit AND actor_role:admin
```

**"Show incident timeline for specific date"**
```
service:audit AND time:2025-01-15 AND (outcome:failure OR outcome:denied)
```

### Generating Audit Reports

```typescript
// scripts/generate-audit-report.ts
import { LogTideClient } from '@logtide/sdk-node';

async function generateAuditReport(startDate: string, endDate: string) {
  const client = new LogTideClient({
    apiUrl: process.env.LOGTIDE_API_URL!,
    apiKey: process.env.LOGTIDE_API_KEY!,
    // Or use a DSN string instead:
    // dsn: process.env.LOGTIDE_DSN,
  });

  // Authentication summary
  const authEvents = await client.search({
    service: 'audit',
    q: 'action:auth.*',
    from: startDate,
    to: endDate,
  });

  // Access denied events
  const deniedEvents = await client.search({
    service: 'audit',
    q: 'outcome:denied',
    from: startDate,
    to: endDate,
  });

  // Configuration changes
  const configChanges = await client.search({
    service: 'audit',
    q: 'action:settings.*',
    from: startDate,
    to: endDate,
  });

  return {
    period: { start: startDate, end: endDate },
    summary: {
      totalAuthEvents: authEvents.length,
      failedLogins: authEvents.filter(e => e.metadata.outcome === 'failure').length,
      accessDenied: deniedEvents.length,
      configChanges: configChanges.length,
    },
    // Detailed data for auditor review
    authEvents,
    deniedEvents,
    configChanges,
  };
}
```

## SOC2 Controls Mapping

| SOC2 Control | What to Log | LogTide Implementation |
|-------------|------------|----------------------|
| CC6.1 (Access Control) | Login/logout, MFA events | `auth.login`, `auth.logout`, `auth.mfa` |
| CC6.2 (User Registration) | Account creation, deactivation | `user.create`, `user.deactivate` |
| CC6.3 (Role-Based Access) | Permission grants/revokes | `role.update`, `permission.grant` |
| CC6.6 (External Access) | API key usage, webhook calls | `api_key.create`, `api_key.use` |
| CC6.8 (Malicious Software) | Security alerts, threat detection | Sigma rules + alert triggers |
| CC7.2 (Monitoring) | System health, error rates | Alert rules on error thresholds |
| CC7.3 (Change Detection) | Config changes, deployments | `settings.update`, `deployment.create` |
| CC8.1 (Change Management) | Code/config change tracking | `change.create`, `change.approve` |

## ISO27001 Controls Mapping

| ISO27001 Control | LogTide Feature |
|-----------------|----------------|
| A.5.23 (Cloud Security) | Self-hosted, full data sovereignty |
| A.5.33 (Record Protection) | Immutable TimescaleDB storage |
| A.8.15 (Logging) | Structured audit events with consistent schema |
| A.8.16 (Monitoring) | Sigma rules, alert rules, real-time streaming |
| A.8.24 (Cryptography) | TLS for data in transit, encryption at rest via PostgreSQL |

## Compliance Audit Checklist

Use this before your audit:

- [ ] **Audit Logging**
    - [ ] All authentication events logged (login, logout, MFA)
    - [ ] All authorization changes logged (roles, permissions)
    - [ ] All data access to sensitive resources logged
    - [ ] All configuration changes logged with before/after state
    - [ ] Consistent audit event schema across all services

- [ ] **Log Integrity**
    - [ ] Logs stored in append-only storage (TimescaleDB)
    - [ ] Access to log storage restricted to authorized personnel
    - [ ] Log deletion requires explicit admin action

- [ ] **Retention**
    - [ ] Retention policies documented and configured
    - [ ] Automatic enforcement verified
    - [ ] Retention periods meet regulatory requirements
    - [ ] Long-term archive for financial/legal records

- [ ] **Access Control**
    - [ ] Role-based access to LogTide dashboard
    - [ ] API key rotation policy in place
    - [ ] Access to logs audited (meta-audit)

- [ ] **Incident Detection**
    - [ ] Sigma rules enabled for common threats
    - [ ] Alert rules configured for critical events
    - [ ] Incident response playbook documented
    - [ ] Escalation paths defined

- [ ] **Evidence Readiness**
    - [ ] Audit report generation tested
    - [ ] Common auditor queries documented
    - [ ] Export capability verified
    - [ ] Sample reports prepared

## Common Pitfalls

### 1. "We log everything, that's enough"

Auditors want structured, queryable audit trails, not raw application logs.

**Solution:** Implement dedicated audit events with consistent schema.

### 2. "Our cloud provider handles compliance"

Using a SOC2-certified cloud provider doesn't make your application SOC2 compliant.

**Solution:** Implement application-level audit logging regardless of infrastructure.

### 3. "We'll set up logging before the audit"

Auditors for SOC2 Type II need 6-12 months of historical evidence.

**Solution:** Start logging now. You need at least 6 months of data.

### 4. "Audit logs and application logs are the same"

Application logs are for debugging. Audit logs are for compliance. Different purposes, different retention, different access controls.

**Solution:** Use separate service names and retention policies for audit vs application logs.

## Legal Disclaimer

This guide provides technical implementation guidance for audit trail logging. It does not constitute legal, compliance, or audit advice. Work with qualified auditors and compliance professionals to ensure your specific implementation meets applicable requirements.

## Resources

- [SOC2 Trust Service Criteria (AICPA)](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services)
- [ISO/IEC 27001:2022 Standard](https://www.iso.org/standard/27001)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Need help with compliance logging?**

- [Open a GitHub issue](https://github.com/logtide-dev/logtide/issues) for technical questions
- [Join GitHub Discussions](https://github.com/logtide-dev/logtide/discussions) for architecture advice
