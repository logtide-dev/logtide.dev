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
---

GDPR compliance isn't just about consent forms—it extends to how you collect, store, and process log data. This guide shows you how to implement privacy-first logging with LogTide.

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

**Issues:**
- Personal data scattered across logs without consent
- No retention limits—logs stored indefinitely
- Data often sent to non-EU servers
- No mechanism for deletion requests (right to erasure)
- Difficult to audit what data is collected

**Potential impact:** GDPR fines up to €20 million or 4% of annual global turnover.

## The LogTide Approach

LogTide is designed with privacy-first principles:

1. **Self-hosted option**: Keep all data in your EU infrastructure
2. **Data minimization**: Log only what you need
3. **Retention policies**: Automatic deletion after configurable periods
4. **Pseudonymization**: Hash or truncate identifiers
5. **Audit logging**: Track who accessed what data

### Architecture Overview

```
Your Application
       ↓
   [Log with pseudonymization]
       ↓
   LogTide (EU infrastructure)
       ↓
   [Retention policies applied]
       ↓
   [Automatic deletion]
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
    this.client[level](message, sanitized);
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

Configure LogTide retention policies in your organization settings:

| Log Type | Retention | Justification |
|----------|-----------|---------------|
| Access logs | 90 days | Security monitoring |
| Error logs | 30 days | Debugging |
| Audit logs | 7 years | Legal requirement |
| Debug logs | 7 days | Development only |

In LogTide dashboard:
1. Go to **Organization Settings** → **Data Retention**
2. Set default retention period
3. Create rules for specific services or log levels

### 6. Right to Erasure (Article 17)

When a user requests deletion, you need to remove their log data:

```typescript
import { LogTideClient } from '@logtide/sdk-node';

async function handleDeletionRequest(userId: string) {
  // 1. Delete from your database
  await db.users.delete({ where: { id: userId } });

  // 2. The pseudonymized logs don't directly identify the user
  // But if you need complete erasure, use LogTide's deletion API

  // 3. Log the deletion (audit trail)
  logger.info('GDPR deletion request processed', {
    user_pseudo: pseudonymizeUserId(userId, PII_SALT),
    requestedAt: new Date().toISOString(),
    processedBy: 'system',
  });

  // 4. Return confirmation
  return {
    deleted: true,
    retentionNote: 'Pseudonymized logs retained for 90 days per security policy',
  };
}
```

## Real-World Example: E-commerce Platform

Let's say you're building an e-commerce platform in the EU.

**Requirements:**
- Log user activity for fraud detection
- Meet GDPR data minimization
- Support right to erasure
- Retain order logs for 7 years (tax compliance)

**Implementation:**

```typescript
// Order logging (long retention for tax)
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

// Fraud detection (short retention)
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
    - [ ] Mechanism to delete or anonymize user logs
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

If you can't efficiently find and delete a user's logs, you can't fulfill deletion requests.

**Correct approach:** Use consistent user identifiers (pseudonymized) that can be searched and deleted.

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
