---
title: "GDPR-Compliant Logging"
description: "Implement privacy-first logging that meets GDPR requirements. Data minimization, retention policies, and right to erasure."
category: "compliance"
difficulty: "medium"
icon: "lucide:shield-check"
industries:
  - "SaaS"
  - "Healthcare"
  - "Fintech"
  - "E-commerce"
highlights:
  - "Data minimization"
  - "EU data residency"
  - "Right to erasure"
  - "Audit trails"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases: []
keywords:
  - "GDPR logging"
  - "privacy logging"
  - "data protection"
  - "compliant logging"
  - "EU data residency"
faqs:
  - question: "Is LogTide GDPR-compliant?"
    answer: "LogTide is designed with privacy-first principles including built-in PII masking rules (email, credit card, SSN, IP address, API key and sensitive field names), configurable per-organization retention with automatic deletion, and a self-hosted deployment model that lets you keep all log data within your own EU infrastructure. This makes it significantly easier to meet GDPR obligations than using SaaS logging platforms where data leaves your control."
  - question: "How does LogTide handle EU data residency for logs?"
    answer: "Because LogTide is self-hosted, you choose where it runs. Deploying on EU infrastructure means log data never leaves your jurisdiction, removing the need for Standard Contractual Clauses or other data-transfer mechanisms required when sending logs to non-EU SaaS providers."
  - question: "How does LogTide support the GDPR right to erasure?"
    answer: "LogTide recommends pseudonymizing personal identifiers such as user IDs and email addresses with one-way HMAC hashes at log time. LogTide has no per-record log deletion API: logs are removed when the organization retention period expires, so keep the retention window short enough for your erasure obligations and keep raw identifiers out of logs in the first place. The erasure request itself can be logged as an audit trail event."
  - question: "How do I avoid logging personal data by accident with LogTide?"
    answer: "The guide provides a PrivacyLogger wrapper that automatically sanitizes known PII fields before they reach LogTide: emails are replaced with HMAC hashes, IP addresses are truncated to remove the last octet, user IDs are pseudonymized, and sensitive fields like passwords and tokens are dropped entirely."
---

GDPR compliance isn't just about consent forms - it extends to how you collect, store, and process log data. This guide shows you how to implement privacy-first logging with LogTide.

## The Problem with Traditional Logging

Most logging solutions treat logs as technical data without privacy considerations:

```typescript
// ❌ BAD: Logging personal data without consideration
logger.info('User logged in', {
  email: 'john.doe@example.com',
  ip: '192.168.1.100',
  name: 'John Doe',
  sessionId: 'sess_abc123',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
  location: { lat: 51.5074, lng: -0.1278 },
});
```

```d2
direction: down
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  group: { style: { fill: "#ede9fe"; stroke: "#c4b5fd"; stroke-width: 2; font-color: "#3b0764"; border-radius: 10 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

app: Your Application { class: src }
pseudo: "Log with pseudonymization" { class: src }
lt: "LogTide\nEU infrastructure" { class: hub }
retention: "Retention policies applied" { class: src }
deletion: "Automatic deletion" { class: src }

app -> pseudo -> lt -> retention -> deletion { class: flow }
```

## Implementation: Step by Step

### 1. Data Minimization Strategy

First, audit what you're currently logging and categorize:

| Data Type | GDPR Category | Action |
|-----------|---------------|--------|
| User ID | Personal Data | Pseudonymize |
| Email | Personal Data | Hash or omit |
| IP Address | Personal Data | Truncate or hash |
| Session ID | Potentially Personal | Short retention |
| Error messages | Technical | Keep (no PII) |
| Request paths | Technical | Keep (no PII) |

### 2. Pseudonymization Helpers

Create utility functions for consistent data handling:

```typescript
import crypto from 'crypto';

// Hash personal identifiers (one-way)
export function hashPII(value: string, salt: string): string {
  return crypto
    .createHmac('sha256', salt)
    .update(value)
    .digest('hex')
    .substring(0, 16);
}

// Truncate IP addresses (GDPR-friendly)
export function truncateIP(ip: string): string {
  if (ip.includes(':')) {
    // IPv6: keep first 4 segments
    return ip.split(':').slice(0, 4).join(':') + '::';
  }
  // IPv4: zero last octet
  return ip.split('.').slice(0, 3).join('.') + '.0';
}

// Mask email (for debugging without full exposure)
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

// Generate pseudonymous user ID
export function pseudonymizeUserId(userId: string, salt: string): string {
  return `user_${hashPII(userId, salt)}`;
}
```

### 3. Privacy-First Logger Wrapper

Create a logging wrapper that enforces privacy rules:

```typescript
import { LogTideClient } from '@logtide/sdk-node';

const PII_SALT = process.env.PII_HASH_SALT!;

class PrivacyLogger {
  private client: LogTideClient;

  constructor() {
    this.client = new LogTideClient({
      apiUrl: process.env.LOGTIDE_API_URL!,
      apiKey: process.env.LOGTIDE_API_KEY!,
      globalMetadata: {
        environment: process.env.NODE_ENV,
        dataClassification: 'gdpr-compliant',
      },
    });
  }

  // Safe logging method that sanitizes data
  log(level: string, message: string, data: Record<string, unknown> = {}) {
    const sanitized = this.sanitize(data);
    this.client[level]('app', message, sanitized);
  }

  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      // Handle known PII fields
      if (key === 'email' && typeof value === 'string') {
        result.email_hash = hashPII(value, PII_SALT);
        continue;
      }

      if (key === 'ip' && typeof value === 'string') {
        result.ip_truncated = truncateIP(value);
        continue;
      }

      if (key === 'userId' && typeof value === 'string') {
        result.user_pseudo = pseudonymizeUserId(value, PII_SALT);
        continue;
      }

      // Block known sensitive fields
      if (['password', 'ssn', 'creditCard', 'token'].includes(key)) {
        continue; // Don't log at all
      }

      result[key] = value;
    }

    return result;
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log('error', message, data);
  }
}

export const logger = new PrivacyLogger();
```

### 4. Usage in Your Application

```typescript
import { logger } from './privacy-logger';

// ✅ GOOD: Privacy-compliant logging
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await authenticate(email, password);

    // Personal data is automatically sanitized
    logger.info('User login successful', {
      email,                    // → email_hash: "a1b2c3..."
      ip: req.ip,              // → ip_truncated: "192.168.1.0"
      userId: user.id,         // → user_pseudo: "user_d4e5f6..."
      userAgent: req.headers['user-agent'],
      loginMethod: 'password',
    });

    res.json({ success: true });
  } catch (error) {
    logger.warn('Login failed', {
      email,                    // → email_hash (can correlate attempts)
      ip: req.ip,
      reason: error.code,      // Technical, not personal
    });

    res.status(401).json({ error: 'Invalid credentials' });
  }
});
```

### 5. Retention Policies

LogTide retention is set per organization, from 1 to 365 days, and expired logs are deleted automatically. There are no per-service or per-level retention rules, so use separate organizations if two log types need different periods. The audit log of LogTide itself has its own retention (1 to 3650 days, or keep forever). Example periods:

| Log Type | Retention | Justification |
|----------|-----------|---------------|
| Access logs | 90 days | Security monitoring |
| Error logs | 30 days | Debugging |
| Debug logs | 7 days | Development only |

Where to set it:
1. Self-hosted: retention is configured by your system administrator in the admin panel (organization page)
2. LogTide Cloud: retention follows your plan (7, 30 or 90 days)
3. Anything that must be kept longer than 365 days (for example tax records) belongs in a system designed for that, not in the log store

### 6. Right to Erasure (Article 17)

When a user requests deletion, you need to remove their log data:

```typescript
import { LogTideClient } from '@logtide/sdk-node';

async function handleDeletionRequest(userId: string) {
  // 1. Delete from your database
  await db.users.delete({ where: { id: userId } });

  // 2. The pseudonymized logs don't directly identify the user
  // LogTide has no per-record delete: they are removed when retention expires

  // 3. Log the deletion (audit trail)
  logger.info('GDPR deletion request processed', {
    user_pseudo: pseudonymizeUserId(userId, PII_SALT),
    requestedAt: new Date().toISOString(),
    processedBy: 'system',
  });

  // 4. Return confirmation
  return {
    deleted: true,
    retentionNote: 'Pseudonymized logs expire with the 90-day retention period',
  };
}
```

## Real-World Example: E-commerce Platform

Let's say you're building an e-commerce platform in the EU.

**Requirements:**
- Log user activity for fraud detection
- Meet GDPR data minimization
- Support right to erasure
- Keep order records for 7 years (tax compliance) in your database, since log retention is capped at 365 days

**Implementation:**

```typescript
// Order logging (the tax record itself lives in your database)
logger.info('Order placed', {
  orderId: order.id,           // Business identifier
  amount: order.total,         // Financial data
  currency: order.currency,
  items: order.items.length,   // Aggregate, not details
  // User data pseudonymized automatically
  userId: order.userId,
  email: order.email,
  ip: req.ip,
});

// Fraud detection
logger.info('Payment attempt', {
  orderId: order.id,
  paymentMethod: 'card',       // Type only, no card numbers
  succeeded: true,
  // Pseudonymized for correlation
  userId: order.userId,
  ip: req.ip,
  fingerprint: deviceFingerprint,
});

// Marketing events (requires consent)
if (user.marketingConsent) {
  logger.info('Product viewed', {
    productId: product.id,
    category: product.category,
    userId: user.id,  // Pseudonymized, consent recorded
  });
}
```

## GDPR Compliance Checklist

Use this for your audit:

- [ ] **Data Minimization**
    - [ ] Audit all log statements for personal data
    - [ ] Remove unnecessary PII collection
    - [ ] Implement pseudonymization for required PII

- [ ] **Storage Location**
    - [ ] Confirm logs stored in EU (or adequate country)
    - [ ] Document data transfer mechanisms if using cloud

- [ ] **Retention**
    - [ ] Define retention periods for each log type
    - [ ] Configure automatic deletion in LogTide
    - [ ] Document justification for retention periods

- [ ] **Access Control**
    - [ ] Implement role-based access to logs
    - [ ] Enable audit logging for log access
    - [ ] Regular access review process

- [ ] **Right to Erasure**
    - [ ] Process for handling deletion requests
    - [ ] Mechanism to keep user identifiers out of logs (pseudonymization, PII masking), since logs are removed by retention expiry
    - [ ] Document what can/cannot be deleted (legal holds)

- [ ] **Documentation**
    - [ ] Update privacy policy with logging practices
    - [ ] Document lawful basis for log processing
    - [ ] Maintain records of processing activities

## Cost Comparison

**Traditional SaaS Logging (Datadog, Splunk):**
- Data leaves your infrastructure
- Limited control over data location
- Retention often unlimited or expensive to manage
- Per-GB pricing encourages data reduction

**LogTide self-hosted:**
- Data stays in your infrastructure
- Full control over data location
- Configurable retention with automatic deletion
- Fixed infrastructure cost

**Compliance benefit:** Easier GDPR compliance with self-hosted solution.

## Common Pitfalls

### 1. "We anonymize everything"

True anonymization is irreversible. If you can link logs back to users (even with internal keys), it's pseudonymization, not anonymization. GDPR still applies.

**Correct approach:** Use pseudonymization (one-way hashing) and document it as such.

### 2. "Logs are just technical data"

IP addresses, user agents, and session IDs can all be personal data under GDPR if they can identify a person.

**Correct approach:** Treat all user-related data as potentially personal.

### 3. "We'll delete logs when requested"

If you can't efficiently find a user's logs or let them expire in time, you can't fulfill deletion requests.

**Correct approach:** Use consistent user identifiers (pseudonymized) that you can search for, and a retention period short enough that logs expire in time.

## Legal Disclaimer

This guide provides technical implementation, not legal advice. GDPR interpretation varies by country and case. Consult with a data protection officer or legal counsel for your specific situation.

## Resources

- [GDPR Official Text](https://gdpr.eu/)
- [Article 29 Working Party Guidelines on Anonymisation](https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/index_en.htm)
- [ICO Guide to Data Protection](https://ico.org.uk/for-organisations/)
- [CNIL Logging Guidelines (French DPA)](https://www.cnil.fr/en)

---

**Need help with GDPR-compliant logging?**

- [Open a GitHub issue](https://github.com/logtide-dev/logtide/issues) for technical questions
- [Join GitHub Discussions](https://github.com/logtide-dev/logtide/discussions) for architecture advice
