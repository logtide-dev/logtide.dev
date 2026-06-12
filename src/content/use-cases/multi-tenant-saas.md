---
title: "Multi-Tenant SaaS Logging"
description: "Implement per-tenant log isolation and analytics for B2B SaaS applications with LogTide's organization-based architecture."
category: "operations"
difficulty: "advanced"
icon: "lucide:users"
industries:
  - "SaaS"
  - "B2B"
  - "Enterprise"
highlights:
  - "Per-tenant isolation"
  - "Cross-tenant analytics"
  - "Cost allocation"
  - "Tenant context propagation"
relatedIntegrations:
  - "nodejs"
  - "postgresql"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "multi-tenant logging"
  - "saas tenant isolation"
  - "per-customer analytics"
  - "b2b logging"
  - "tenant context"
faqs:
  - question: "How does LogTide enforce per-tenant log isolation in a multi-tenant SaaS?"
    answer: "LogTide stores a tenant_id field on every log entry, which is injected automatically by tenant-aware middleware using AsyncLocalStorage. This means every query, dashboard, and API endpoint can be scoped to a single tenant, and tenants accessing their own log data through your admin API will only ever see their own records."
  - question: "Can individual tenants access their own logs through LogTide?"
    answer: "Yes. You can expose a tenant-facing API endpoint that queries LogTide filtered by the authenticated tenant_id, strips internal fields before returning results, and gives enterprise customers full visibility into their own activity without exposing other tenants data."
  - question: "Does LogTide support cross-tenant analytics for platform operators?"
    answer: "Yes. Because every log entry carries tenant_id and tenant_plan, platform operators can aggregate across all tenants to find the highest error rates, heaviest API consumers, and slowest tenants. This same data supports cost allocation and chargeback reporting per tenant plan."
  - question: "How should background jobs be handled in a multi-tenant logging setup?"
    answer: "Background jobs run outside of HTTP request context, so tenant context must be set manually before the job runs. The recommended approach is to load the tenant details from the job payload and wrap the job execution inside a tenantStorage.run call so all log entries produced by that job are automatically tagged with the correct tenant_id."
---

Multi-tenant SaaS applications need logging that respects tenant boundaries while enabling platform-wide observability. This guide shows you how to implement tenant-aware logging with LogTide.

## The Multi-Tenant Logging Challenge

### Common Mistakes

```typescript
// ❌ BAD: No tenant context
logger.info('User created account');

// ❌ BAD: Tenant ID buried in unstructured message
logger.info(`User created account in tenant ${tenantId}`);

// ❌ BAD: Inconsistent tenant identification
logger.info('User created', { org: tenantId });      // sometimes 'org'
logger.info('Order placed', { tenant: tenantId });   // sometimes 'tenant'
logger.info('Payment failed', { customer: tenantId }); // sometimes 'customer'
```

**Issues:**
- Can't filter logs by tenant for debugging
- Can't provide tenant-specific log access
- Can't calculate per-tenant costs
- Can't ensure data isolation for compliance
- Support team sees all tenants mixed together

## The LogTide Approach

LogTide's architecture naturally supports multi-tenancy:

**Data Flow:**
1. **Tenants** (Acme, TechCorp, StartupX) generate logs from their activity
2. **Tenant-Aware Middleware** intercepts all requests and adds `tenant_id` to every log
3. **LogTide** stores logs with tenant context, enabling per-tenant filtering and isolation

## Implementation

### 1. Tenant Context Middleware

Create middleware that extracts and propagates tenant context:

```typescript
// middleware/tenant-context.ts
import { AsyncLocalStorage } from 'async_hooks';

interface TenantContext {
  tenantId: string;
  tenantName: string;
  tenantPlan: string;
  userId?: string;
  requestId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

// Express middleware
export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract tenant from JWT, subdomain, header, etc.
  const tenantId = extractTenantId(req);
  const tenant = await getTenantDetails(tenantId);

  const context: TenantContext = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantPlan: tenant.plan,
    userId: req.user?.id,
    requestId: req.headers['x-request-id'] || crypto.randomUUID(),
  };

  // Run the rest of the request in this context
  tenantStorage.run(context, () => {
    next();
  });
}

function extractTenantId(req: Request): string {
  // Option 1: From subdomain (acme.yourapp.com)
  const subdomain = req.hostname.split('.')[0];
  if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
    return subdomain;
  }

  // Option 2: From JWT claims
  if (req.user?.tenantId) {
    return req.user.tenantId;
  }

  // Option 3: From header (for internal services)
  if (req.headers['x-tenant-id']) {
    return req.headers['x-tenant-id'] as string;
  }

  throw new Error('Tenant not identified');
}
```

### 2. Tenant-Aware Logger

```typescript
// lib/logger.ts
import { LogTideClient } from '@logtide/sdk-node';
import { getTenantContext } from './middleware/tenant-context';

const baseClient = new LogTideClient({
  apiUrl: process.env.LOGTIDE_API_URL!,
  apiKey: process.env.LOGTIDE_API_KEY!,
  globalMetadata: {
    service: 'saas-platform',
    environment: process.env.NODE_ENV,
  },
});

class TenantAwareLogger {
  private client: LogTideClient;

  constructor(client: LogTideClient) {
    this.client = client;
  }

  private enrichWithTenant(metadata: Record<string, unknown> = {}): Record<string, unknown> {
    const context = getTenantContext();

    if (context) {
      return {
        ...metadata,
        tenant_id: context.tenantId,
        tenant_name: context.tenantName,
        tenant_plan: context.tenantPlan,
        user_id: context.userId,
        request_id: context.requestId,
      };
    }

    return {
      ...metadata,
      tenant_id: 'system', // For background jobs without tenant context
    };
  }

  info(message: string, metadata?: Record<string, unknown>) {
    this.client.info('saas-platform', message, this.enrichWithTenant(metadata));
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    this.client.warn('saas-platform', message, this.enrichWithTenant(metadata));
  }

  error(message: string, metadata?: Record<string, unknown>) {
    this.client.error('saas-platform', message, this.enrichWithTenant(metadata));
  }

  debug(message: string, metadata?: Record<string, unknown>) {
    this.client.debug('saas-platform', message, this.enrichWithTenant(metadata));
  }
}

export const logger = new TenantAwareLogger(baseClient);
```

### 3. Usage in Application Code

```typescript
import { logger } from '@/lib/logger';

// ✅ GOOD: Tenant context automatically included
app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body;

  logger.info('Creating project', {
    projectName: name,
  });

  try {
    const project = await db.project.create({
      data: {
        name,
        description,
        tenantId: req.tenant.id, // Still store in DB
      },
    });

    logger.info('Project created successfully', {
      projectId: project.id,
      projectName: name,
    });

    res.json(project);
  } catch (error) {
    logger.error('Failed to create project', {
      projectName: name,
      error: error.message,
    });

    res.status(500).json({ error: 'Failed to create project' });
  }
});
```

Output in LogTide:

```json
{
  "level": "info",
  "message": "Project created successfully",
  "service": "saas-platform",
  "tenant_id": "acme-corp",
  "tenant_name": "Acme Corporation",
  "tenant_plan": "enterprise",
  "user_id": "user_123",
  "request_id": "req_abc456",
  "metadata": {
    "projectId": "proj_789",
    "projectName": "Q4 Campaign"
  }
}
```

### 4. Background Job Logging

For background jobs without HTTP context:

```typescript
// jobs/process-invoice.ts
import { tenantStorage, TenantContext } from '@/middleware/tenant-context';
import { logger } from '@/lib/logger';

interface InvoiceJob {
  tenantId: string;
  invoiceId: string;
}

export async function processInvoice(job: InvoiceJob) {
  // Manually set tenant context for background jobs
  const tenant = await getTenantDetails(job.tenantId);

  const context: TenantContext = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantPlan: tenant.plan,
    requestId: `job_${crypto.randomUUID()}`,
  };

  await tenantStorage.run(context, async () => {
    logger.info('Processing invoice', {
      invoiceId: job.invoiceId,
    });

    try {
      await generateInvoicePDF(job.invoiceId);
      await sendInvoiceEmail(job.invoiceId);

      logger.info('Invoice processed successfully', {
        invoiceId: job.invoiceId,
      });
    } catch (error) {
      logger.error('Invoice processing failed', {
        invoiceId: job.invoiceId,
        error: error.message,
      });
      throw error;
    }
  });
}
```

## Tenant-Specific Log Access

### Providing Tenants Access to Their Logs

Create an API endpoint for tenants to view their own logs:

```typescript
// api/tenant-logs.ts
import { LogTideClient } from '@logtide/sdk-node';

app.get('/api/admin/logs', requireTenantAdmin, async (req, res) => {
  const { tenantId } = req.tenant;
  const { startDate, endDate, level, search } = req.query;

  // Query LogTide, then enforce the tenant boundary on metadata
  const { logs } = await logtide.query({
    level,
    from: startDate,
    to: endDate,
    q: search,
    limit: 500,
  });

  const tenantLogs = logs.filter(log => log.metadata?.tenant_id === tenantId);

  // Sanitize logs before returning (remove internal fields)
  const sanitizedLogs = tenantLogs.slice(0, 100).map(log => ({
    timestamp: log.time,
    level: log.level,
    message: log.message,
    metadata: sanitizeMetadata(log.metadata ?? {}),
  }));

  res.json(sanitizedLogs);
});

function sanitizeMetadata(metadata: Record<string, unknown>) {
  // Remove internal fields
  const { tenant_id, tenant_name, ...safe } = metadata;
  return safe;
}
```

## Cross-Tenant Analytics

### Platform-Wide Metrics

For your internal dashboards:

```typescript
// Analytics for platform operators
async function getPlatformMetrics() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Hourly volume + top services and errors, straight from the stats API
  const stats = await logtide.getAggregatedStats({
    from: last24h,
    to: new Date(),
    interval: '1h',
  });

  // Errors by tenant (find problematic tenants): query, then group on metadata
  const { logs: recentErrors } = await logtide.query({
    level: 'error',
    from: last24h,
    limit: 1000,
  });

  const errorsByTenant = new Map<string, number>();
  for (const log of recentErrors) {
    const tenant = String(log.metadata?.tenant_id ?? 'unknown');
    errorsByTenant.set(tenant, (errorsByTenant.get(tenant) ?? 0) + 1);
  }

  // Slowest tenants: average duration_ms per tenant from the same window
  const { logs: requests } = await logtide.query({
    q: 'HTTP',
    from: last24h,
    limit: 1000,
  });

  const durations = new Map<string, number[]>();
  for (const log of requests) {
    const tenant = String(log.metadata?.tenant_id ?? 'unknown');
    const ms = Number(log.metadata?.duration_ms);
    if (!Number.isNaN(ms)) {
      durations.set(tenant, [...(durations.get(tenant) ?? []), ms]);
    }
  }
  const slowestTenants = [...durations.entries()]
    .map(([tenant, ms]) => ({ tenant, avgMs: ms.reduce((a, b) => a + b, 0) / ms.length }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10);

  return { stats, errorsByTenant, slowestTenants };
}
```

For heavier analytics (billing-grade counts over a month, percentiles across millions of rows), query the storage engine directly — LogTide's data lives in TimescaleDB or ClickHouse you own, so plain SQL with `GROUP BY` on the tenant metadata is always available without API pagination.

### Per-Tenant Dashboards

```typescript
// Dashboard for tenant admins
async function getTenantDashboard(tenantId: string) {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Pull the tenant's recent logs once, then derive the dashboard numbers
  const { logs } = await logtide.query({ q: tenantId, from: last24h, limit: 1000 });
  const tenantLogs = logs.filter(log => log.metadata?.tenant_id === tenantId);

  const errorCount = tenantLogs.filter(log => log.level === 'error').length;
  const requestLogs = tenantLogs.filter(log => log.metadata?.duration_ms != null);

  const byEndpoint = new Map<string, number[]>();
  for (const log of requestLogs) {
    const path = String(log.metadata?.path ?? 'unknown');
    byEndpoint.set(path, [...(byEndpoint.get(path) ?? []), Number(log.metadata?.duration_ms)]);
  }
  const slowestEndpoints = [...byEndpoint.entries()]
    .map(([path, ms]) => ({ path, avgMs: ms.reduce((a, b) => a + b, 0) / ms.length }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 5);

  return {
    errorRate: requestLogs.length ? errorCount / requestLogs.length : 0,
    requestCount: requestLogs.length,
    slowestEndpoints,
  };
}
```

## Cost Allocation

### Track Log Volume Per Tenant

A month of per-tenant volume is an aggregation job, not an API loop — run it as SQL directly on the storage engine you already own (TimescaleDB here; the ClickHouse equivalent is nearly identical):

```sql
-- Monthly log volume per tenant, straight from TimescaleDB
SELECT
  metadata->>'tenant_id'   AS tenant_id,
  metadata->>'tenant_plan' AS plan,
  count(*)                 AS log_count
FROM logs
WHERE time >= date_trunc('month', now())
GROUP BY 1, 2
ORDER BY log_count DESC;
```

Then price it in application code:

```typescript
// Monthly cost allocation report
async function generateCostReport() {
  const logCounts = await db.query(MONTHLY_VOLUME_SQL); // the SQL above

  return logCounts.rows.map(tenant => ({
    tenantId: tenant.tenant_id,
    plan: tenant.plan,
    logCount: Number(tenant.log_count),
    cost: calculateCost(tenant.plan, Number(tenant.log_count)),
  }));
}

function calculateCost(plan: string, logCount: number): number {
  const rates = {
    free: { includedLogs: 10000, perExtraLog: 0.001 },
    pro: { includedLogs: 100000, perExtraLog: 0.0005 },
    enterprise: { includedLogs: 1000000, perExtraLog: 0.0001 },
  };

  const rate = rates[plan] || rates.free;
  const extraLogs = Math.max(0, logCount - rate.includedLogs);
  return extraLogs * rate.perExtraLog;
}
```

## Real-World Example: Project Management SaaS

Let's say you're building a project management tool like Linear or Asana.

### Tenant Structure

```typescript
interface Tenant {
  id: string;           // 'acme-corp'
  name: string;         // 'Acme Corporation'
  plan: 'free' | 'pro' | 'enterprise';
  features: string[];
  maxUsers: number;
}
```

### Key Events to Log

```typescript
// User actions
logger.info('User logged in', { method: 'sso' });
logger.info('User invited teammate', { inviteeEmail: maskEmail(email) });

// Project operations
logger.info('Project created', { projectId, projectName });
logger.info('Task created', { taskId, projectId, assigneeId });
logger.info('Task status changed', { taskId, from: 'todo', to: 'in_progress' });
logger.info('Comment added', { taskId, commentLength: comment.length });

// Integrations
logger.info('GitHub integration connected', { repos: repos.length });
logger.info('Slack notification sent', { channel, messageType });

// Billing events
logger.info('Subscription upgraded', { from: 'pro', to: 'enterprise' });
logger.info('Payment processed', { amount, currency });

// Feature usage (for analytics)
logger.info('Feature used', { feature: 'gantt_chart', duration_ms: 5000 });
```

### Queries for Common Scenarios

**"Acme Corp is reporting slow performance"**
```
tenant_id:acme-corp AND duration_ms:>1000
```

**"How many projects did each enterprise tenant create this month?"**
```
tenant_plan:enterprise AND message:"Project created"
| group by tenant_id
| count
```

**"Find all errors for a specific user's session"**
```
tenant_id:acme-corp AND user_id:user_456 AND level:error
```

## Multi-Tenant Checklist

- [ ] **Tenant Identification**
    - [ ] Extract tenant from JWT/session consistently
    - [ ] Handle missing tenant gracefully (reject or log as 'system')
    - [ ] Support service-to-service calls with tenant header

- [ ] **Logging Standards**
    - [ ] Tenant ID in every log entry
    - [ ] Consistent field naming (`tenant_id`, not `org`/`customer`)
    - [ ] User ID alongside tenant ID
    - [ ] Request ID for tracing

- [ ] **Data Isolation**
    - [ ] Tenants can only query their own logs
    - [ ] Internal fields stripped from tenant-facing APIs
    - [ ] Audit logging for log access

- [ ] **Analytics**
    - [ ] Platform-wide metrics for operators
    - [ ] Per-tenant dashboards for admins
    - [ ] Cost allocation tracking

- [ ] **Compliance**
    - [ ] Retention policies per tenant plan
    - [ ] Data deletion for churned tenants
    - [ ] Export capability for tenant data

## Common Pitfalls

### 1. "We'll add tenant context later"

By the time you need it, you have months of useless logs.

**Solution:** Add tenant context from day one. It's a one-time setup cost.

### 2. "Background jobs don't need tenant context"

Then you can't debug why a specific tenant's invoice failed.

**Solution:** Always propagate tenant context to background jobs.

### 3. "All our tenants are small, we don't need isolation"

Until one enterprise customer asks for their log export.

**Solution:** Design for isolation from the start.

## Performance Considerations

| Aspect | Impact | Mitigation |
|--------|--------|------------|
| Context propagation | <1ms per request | AsyncLocalStorage is fast |
| Extra fields in logs | ~50 bytes per log | Negligible |
| Tenant lookup | 1-5ms | Cache tenant details |
| Cross-tenant queries | Depends on volume | Add tenant_id to indexes |

## Next Steps

- [Node.js SDK](/integrations/nodejs/) - Full logging setup
- [PostgreSQL Integration](/integrations/postgresql/) - Database logging
- [GDPR Compliance](/use-cases/gdpr-compliance/) - Privacy requirements for EU tenants
