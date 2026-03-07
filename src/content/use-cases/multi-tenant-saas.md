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
  // Or use a DSN string instead:
  // dsn: process.env.LOGTIDE_DSN,
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
    this.client.info(message, this.enrichWithTenant(metadata));
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    this.client.warn(message, this.enrichWithTenant(metadata));
  }

  error(message: string, metadata?: Record<string, unknown>) {
    this.client.error(message, this.enrichWithTenant(metadata));
  }

  debug(message: string, metadata?: Record<string, unknown>) {
    this.client.debug(message, this.enrichWithTenant(metadata));
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

  // Query LogTide with tenant filter
  const logs = await logtide.search({
    filter: {
      tenant_id: tenantId, // Only this tenant's logs
      level: level,
      time: {
        gte: startDate,
        lte: endDate,
      },
    },
    search: search,
    limit: 100,
  });

  // Sanitize logs before returning (remove internal fields)
  const sanitizedLogs = logs.map(log => ({
    timestamp: log.timestamp,
    level: log.level,
    message: log.message,
    metadata: sanitizeMetadata(log.metadata),
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
  // Errors by tenant (find problematic tenants)
  const errorsByTenant = await logtide.aggregate({
    filter: { level: 'error' },
    groupBy: ['tenant_id', 'tenant_plan'],
    metrics: ['count'],
    timeRange: 'last_24h',
  });

  // API usage by tenant (for billing/throttling)
  const usageByTenant = await logtide.aggregate({
    filter: { message: 'HTTP *' },
    groupBy: ['tenant_id'],
    metrics: ['count'],
    timeRange: 'last_month',
  });

  // Slowest tenants (performance issues)
  const slowestTenants = await logtide.aggregate({
    filter: { 'metadata.duration_ms': { exists: true } },
    groupBy: ['tenant_id'],
    metrics: ['avg:metadata.duration_ms', 'p99:metadata.duration_ms'],
    orderBy: 'avg:metadata.duration_ms',
    limit: 10,
  });

  return { errorsByTenant, usageByTenant, slowestTenants };
}
```

### Per-Tenant Dashboards

```typescript
// Dashboard for tenant admins
async function getTenantDashboard(tenantId: string) {
  const [errorRate, requestCount, slowestEndpoints] = await Promise.all([
    logtide.aggregate({
      filter: { tenant_id: tenantId, level: 'error' },
      timeRange: 'last_24h',
      interval: '1h',
    }),

    logtide.aggregate({
      filter: { tenant_id: tenantId, message: 'HTTP *' },
      timeRange: 'last_24h',
      interval: '1h',
    }),

    logtide.aggregate({
      filter: { tenant_id: tenantId, 'metadata.duration_ms': { exists: true } },
      groupBy: ['metadata.path'],
      metrics: ['avg:metadata.duration_ms'],
      orderBy: 'avg:metadata.duration_ms',
      limit: 5,
    }),
  ]);

  return { errorRate, requestCount, slowestEndpoints };
}
```

## Cost Allocation

### Track Log Volume Per Tenant

```typescript
// Monthly cost allocation report
async function generateCostReport(month: string) {
  const logCounts = await logtide.aggregate({
    filter: {
      time: {
        gte: `${month}-01`,
        lte: `${month}-31`,
      },
    },
    groupBy: ['tenant_id', 'tenant_plan'],
    metrics: ['count', 'sum:metadata.bytes'],
  });

  // Calculate costs based on plan
  const costs = logCounts.map(tenant => ({
    tenantId: tenant.tenant_id,
    plan: tenant.tenant_plan,
    logCount: tenant.count,
    bytesStored: tenant.sum_bytes,
    cost: calculateCost(tenant.tenant_plan, tenant.count, tenant.sum_bytes),
  }));

  return costs;
}

function calculateCost(plan: string, logCount: number, bytes: number): number {
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
