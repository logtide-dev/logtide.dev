---
title: "Real-Time Log Alerting"
description: "Configure intelligent log-based alerts with LogTide. Threshold alerts, anomaly detection, and notification routing to Slack and email."
category: "operations"
difficulty: "medium"
icon: "lucide:bell-ring"
industries:
  - "SaaS"
  - "E-commerce"
  - "DevOps"
  - "Fintech"
highlights:
  - "Threshold-based alerts"
  - "Email & webhook notifications"
  - "Sigma detection rules"
  - "Alert fatigue reduction"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases:
  - "incident-response"
  - "security-monitoring"
keywords:
  - "log alerting"
  - "real-time monitoring"
  - "log-based alerts"
  - "production monitoring"
  - "alerting best practices"
  - "on-call alerts"
faqs:
  - question: "Does LogTide support real-time alerting on log events?"
    answer: "Yes. LogTide provides threshold-based alert rules that evaluate log volume, error rates, and search patterns within configurable time windows. When a threshold is crossed, LogTide immediately delivers notifications via email and webhooks, enabling routing to Slack, PagerDuty, Microsoft Teams, or any webhook-compatible tool."
  - question: "How does LogTide help reduce alert fatigue for on-call engineers?"
    answer: "LogTide recommends alerting on error rates within a time window rather than on every individual error, and supports per-service scoping so alerts only fire when a meaningful volume of errors accumulates. Combining tiered severity levels with deduplication within the alert time window prevents the same issue from generating dozens of duplicate notifications."
  - question: "What is Sigma rule support in LogTide alerting?"
    answer: "LogTide has built-in support for Sigma detection rules, an open standard for log-based threat detection. You can import Sigma rules directly through the LogTide dashboard to detect patterns such as brute force login attempts or suspicious privilege escalation, without writing custom alerting logic from scratch."
  - question: "Can LogTide route critical alerts to PagerDuty and lower-priority alerts to Slack?"
    answer: "Yes. LogTide fires alerts to a webhook endpoint of your choice, and you can build a lightweight webhook router that inspects the alert payload and forwards it to PagerDuty for critical events while sending all other alerts to a Slack channel. The alert payload includes the alert name, service, threshold, current count, and sample log entries to give responders immediate context."
---

Good alerting tells you about problems before your users do. Bad alerting wakes you up at 3 AM for nothing. This guide shows how to build effective log-based alerting with LogTide that catches real issues without alert fatigue.

## The Alerting Problem

### Too Many Alerts

```
🔔 3:01 AM - Error count > 5 in service: worker (5 errors)
🔔 3:01 AM - Error count > 5 in service: worker (6 errors)
🔔 3:02 AM - Error count > 5 in service: api (7 errors)
🔔 3:02 AM - Error count > 5 in service: worker (8 errors)
🔔 3:03 AM - Error count > 5 in service: api (12 errors)
... 47 more alerts ...
```

**Result:** Engineer mutes notifications, misses the real incident next week.

### Too Few Alerts

```
(silence)
```

**User report at 9 AM:** "We haven't been able to log in since midnight."

**Result:** 9-hour outage, SLA violation, angry customers.

### The Right Balance

Effective alerting has three properties:
1. **Actionable** - every alert requires human action
2. **Timely** - fires within minutes of the issue
3. **Contextual** - tells you what to investigate

## LogTide Alerting Features

LogTide provides two alerting mechanisms:

1. **Alert Rules** - Threshold-based alerts on log volume, error rates, or patterns
2. **Sigma Detection Rules** - Pattern-based security detection (brute force, anomalies)

Both support:
- Email notifications
- Webhook notifications (Slack, PagerDuty, Teams, etc.)
- Configurable time windows and thresholds

## Implementation

### 1. Alert Rules via API

Create alert rules programmatically:

```bash
# Create an alert rule
curl -X POST "http://logtide.internal:8080/api/v1/alerts" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "your-org-id",
    "projectId": "your-project-id",
    "name": "High Error Rate - API",
    "enabled": true,
    "service": "api",
    "level": ["error", "critical"],
    "threshold": 50,
    "timeWindow": 5,
    "emailRecipients": ["oncall@company.com"],
    "webhookUrl": "https://hooks.slack.com/services/xxx/yyy/zzz"
  }'
```

### 2. Essential Alert Rules

Here are the alert rules every production system should have:

**Error Rate Alert (per service)**
```json
{
  "name": "High Error Rate - API",
  "enabled": true,
  "service": "api",
  "level": ["error", "critical"],
  "threshold": 50,
  "timeWindow": 5,
  "emailRecipients": ["oncall@company.com"],
  "webhookUrl": "https://hooks.slack.com/services/xxx"
}
```

**Critical Error Alert (any service)**
```json
{
  "name": "Critical Errors",
  "enabled": true,
  "level": ["critical"],
  "threshold": 1,
  "timeWindow": 1,
  "emailRecipients": ["oncall@company.com", "eng-lead@company.com"],
  "webhookUrl": "https://hooks.slack.com/services/xxx"
}
```

**Service Down Alert**
```json
{
  "name": "Health Check Failures",
  "enabled": true,
  "service": "health",
  "searchQuery": "critical health check failure",
  "threshold": 3,
  "timeWindow": 5,
  "emailRecipients": ["oncall@company.com"],
  "webhookUrl": "https://hooks.slack.com/services/xxx"
}
```

### 3. Slack Webhook Integration

LogTide sends webhook payloads you can route to Slack:

```json
{
  "alert": {
    "name": "High Error Rate - API",
    "threshold": 50,
    "timeWindow": 5,
    "currentCount": 73
  },
  "triggeredAt": "2025-02-01T03:15:00Z",
  "service": "api",
  "level": ["error", "critical"],
  "sampleLogs": [
    {
      "timestamp": "2025-02-01T03:14:58Z",
      "level": "error",
      "message": "Database connection timeout",
      "metadata": { "host": "db-primary", "timeout_ms": 5000 }
    }
  ]
}
```

To integrate with Slack, use an incoming webhook URL from your Slack workspace settings.

### 4. PagerDuty Integration via Webhook

Route critical alerts to PagerDuty by using a webhook middleware:

```typescript
// webhook-router/index.ts
import express from 'express';

const app = express();
app.use(express.json());

app.post('/logtide-alert', async (req, res) => {
  const alert = req.body;

  // Route based on severity
  if (alert.alert.name.includes('Critical')) {
    // PagerDuty for critical alerts
    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: process.env.PAGERDUTY_ROUTING_KEY,
        event_action: 'trigger',
        dedup_key: `logtide-${alert.alert.name}-${alert.service}`,
        payload: {
          summary: `${alert.alert.name}: ${alert.alert.currentCount} events in ${alert.alert.timeWindow}m`,
          severity: 'critical',
          source: 'LogTide',
          custom_details: alert,
        },
      }),
    });
  }

  // Slack for all alerts
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 *${alert.alert.name}*\nService: ${alert.service}\nCount: ${alert.alert.currentCount} (threshold: ${alert.alert.threshold})\nTime: ${alert.triggeredAt}`,
    }),
  });

  res.json({ ok: true });
});

app.listen(3001);
```

### 5. Sigma Rules for Security Alerts

LogTide's built-in Sigma support detects security patterns:

```yaml
# Brute force detection
title: Brute Force Login Attempt
status: stable
level: high
logsource:
  category: authentication
detection:
  selection:
    message|contains: "login failed"
  timeframe: 5m
  condition: selection | count() > 10
tags:
  - attack.credential_access
  - attack.t1110
```

```yaml
# Privilege escalation
title: Suspicious Admin Role Assignment
status: stable
level: critical
logsource:
  category: audit
detection:
  selection:
    action: "role.update"
    new_state|contains: "admin"
  condition: selection
tags:
  - attack.privilege_escalation
  - attack.t1078
```

Import Sigma rules via the LogTide UI at `/dashboard/security/sigma`.

## Alert Design Patterns

### Pattern 1: Tiered Severity

Don't treat all errors the same:

| Tier | Condition | Notification | Response |
|------|-----------|-------------|----------|
| P1 (Critical) | Service down, data loss, security breach | PagerDuty + Slack + Email | Wake up on-call immediately |
| P2 (High) | Error rate > 5x normal, degraded performance | Slack + Email | Investigate within 30 minutes |
| P3 (Medium) | Elevated errors, non-critical failures | Slack channel | Investigate during business hours |
| P4 (Low) | Warnings, unusual patterns | Weekly digest | Review in next sprint |

### Pattern 2: Alert on Symptoms, Not Causes

```json
// ❌ BAD: Alert on cause (too specific, many false positives)
{
  "name": "Database Error",
  "searchQuery": "ECONNREFUSED",
  "threshold": 1,
  "timeWindow": 1
}

// ✅ GOOD: Alert on symptom (catches the real impact)
{
  "name": "API Error Rate High",
  "service": "api",
  "level": ["error"],
  "threshold": 50,
  "timeWindow": 5
}
```

### Pattern 3: Percentage-Based Thresholds

Absolute thresholds break when traffic changes. Use percentages when possible:

```typescript
// Alert setup: Monitor error percentage
// Check every 5 minutes
async function checkErrorRate(service: string) {
  const total = await logtide.count({
    service,
    from: '-5m',
  });

  const errors = await logtide.count({
    service,
    level: 'error',
    from: '-5m',
  });

  const errorRate = total > 0 ? (errors / total) * 100 : 0;

  if (errorRate > 5) { // > 5% error rate
    logger.critical('Error rate threshold exceeded', {
      service,
      errorRate: errorRate.toFixed(2),
      totalRequests: total,
      errorCount: errors,
    });
  }
}
```

### Pattern 4: Alert Deduplication

Avoid alert storms by deduplicating:

```typescript
// Use consistent dedup keys
// LogTide will only fire once per unique combination
// within the time window
{
  "name": "Service Error Rate",
  "service": "api",        // Scoped to service
  "timeWindow": 5,         // 5-minute window
  // Only one alert per service per 5 minutes
}
```

## Reducing Alert Fatigue

### Step 1: Audit Current Alerts

List all your alerts and classify:

| Alert | Last Triggered | Actionable? | Keep/Modify/Delete |
|-------|---------------|-------------|-------------------|
| Error > 5 | Daily | No (too sensitive) | Modify: threshold to 50 |
| CPU > 90% | Never | N/A | Delete |
| 5xx rate > 1% | Weekly | Yes | Keep |
| Disk > 80% | Monthly | Yes | Keep |

### Step 2: Apply the SRE Alert Framework

For each alert, ask:
1. Does this alert require human action? If no, delete it.
2. Can this wait until business hours? If yes, make it P3/P4.
3. Is the threshold set correctly? Tune based on historical data.
4. Is the alert well-documented? Add a runbook link.

### Step 3: Implement Alert Routing

Not every alert needs to page someone:

```d2
direction: right
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  group: { style: { fill: "#ede9fe"; stroke: "#c4b5fd"; stroke-width: 2; font-color: "#3b0764"; border-radius: 10 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

p1: "P1 · Critical" { class: hub }
p2: "P2 · High" { class: src }
p3: "P3 · Medium" { class: src }
p4: "P4 · Low" { class: src }

pagerduty: PagerDuty { class: hub }
slack_inc: "Slack #incidents" { class: hub }
slack_alerts: "Slack #alerts" { class: hub }
email: Email digest { class: hub }

phone: Phone call { class: src }
within30: Investigate within 30m { class: src }
business: Business hours { class: src }
weekly: Weekly review { class: src }

p1 -> pagerduty -> phone { class: flow }
p2 -> slack_inc -> within30 { class: flow }
p3 -> slack_alerts -> business { class: flow }
p4 -> email -> weekly { class: flow }
```

## Alert Configuration Checklist

- [ ] **Essential Alerts**
    - [ ] Error rate per critical service
    - [ ] Critical/fatal errors (any service)
    - [ ] Health check failures
    - [ ] Authentication failures (brute force)
    - [ ] Deployment events (verify after deploy)

- [ ] **Notification Routing**
    - [ ] P1 alerts → PagerDuty (phone)
    - [ ] P2 alerts → Slack #incidents
    - [ ] P3 alerts → Slack #alerts
    - [ ] P4 alerts → Email digest

- [ ] **Alert Quality**
    - [ ] Every alert has a runbook
    - [ ] Thresholds tuned to avoid false positives
    - [ ] Alert fatigue audit quarterly
    - [ ] On-call handoff process documented

- [ ] **Security Alerts (Sigma)**
    - [ ] Brute force detection enabled
    - [ ] Privilege escalation monitoring
    - [ ] Suspicious IP detection
    - [ ] After-hours admin activity

## Common Pitfalls

### 1. "Alert on every error"

You'll get 500 alerts per day and ignore them all.

**Solution:** Alert on error *rates*, not individual errors.

### 2. "Set thresholds once and forget"

As traffic grows, static thresholds become useless.

**Solution:** Review thresholds quarterly. Consider percentage-based thresholds.

### 3. "No runbook for alerts"

An alert without a runbook just says "something is wrong, figure it out."

**Solution:** Every alert should link to a runbook with investigation steps.

### 4. "Same notification for everything"

If everything pages, nothing is important.

**Solution:** Tier your alerts. Only P1 should wake someone up.

## Next Steps

- [Incident Response](/use-cases/incident-response/) - What to do when alerts fire
- [Security Monitoring](/use-cases/security-monitoring/) - Sigma rules for threat detection
- [Node.js SDK](/integrations/nodejs/) - Application logging setup
- [Docker Integration](/integrations/docker/) - Container log collection

---

**Ready to set up intelligent alerting?**

- [Deploy LogTide](https://github.com/logtide-dev/logtide) - Free, open-source
- [Join GitHub Discussions](https://github.com/logtide-dev/logtide/discussions) - Share your alerting setup
