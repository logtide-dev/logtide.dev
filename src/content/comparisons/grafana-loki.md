---
title: "LogTide vs Grafana Loki for Logs"
description: "Compare LogTide and Grafana Loki for log management. Built-in alerting, full-text search, and SIEM vs label-based indexing."
competitor: "Grafana Loki"
competitorUrl: "https://grafana.com/oss/loki/"
competitorPricing: "Open-source (+ Grafana Cloud plans)"
logtidePricing: "Free (self-hosted)"
migrationDoc: "/docs/migration/loki/"
highlights:
  - "Built-in alerting & UI"
  - "True full-text search"
  - "No Grafana dependency"
  - "SIEM capabilities"
relatedIntegrations:
  - "docker"
  - "kubernetes"
relatedUseCases:
  - "security-monitoring"
  - "incident-response"
relatedComparisons:
  - "elk-stack"
  - "signoz"
  - "graylog"
keywords:
  - "Loki alternative"
  - "Grafana Loki vs LogTide"
  - "log management comparison"
  - "Loki full-text search"
  - "self-hosted log management"
  - "Loki SIEM alternative"
faqs:
  - question: "Does LogTide support full-text search, unlike Grafana Loki?"
    answer: "Yes. Loki indexes only labels and requires regex scanning across log chunks to search message content, which is slow and resource-intensive at scale. LogTide indexes both labels and log content, so any text search with the q parameter returns results instantly without scanning raw chunks."
  - question: "Does LogTide include SIEM and alerting without needing Grafana?"
    answer: "Yes. Loki ships no UI, no alerting engine, and no security detection — you must add Grafana for dashboards and AlertManager for alerts. LogTide bundles its own web UI, native alert rules, Sigma detection rules, MITRE ATT&CK mapping, and incident management in a single Docker Compose stack."
  - question: "When is Grafana Loki the better choice over LogTide?"
    answer: "Loki is the better fit when you already run Grafana for metrics (Prometheus, Mimir) and want logs in the same familiar interface, when you primarily filter by labels and rarely need content search, or when you need Kubernetes-native pod log collection with minimal overhead. Its label-only indexing also makes it extremely cost-efficient for very high volumes where content search is not required."
  - question: "How do I migrate from Grafana Loki to LogTide?"
    answer: "Because both Loki and LogTide support Fluent Bit and OpenTelemetry, migration is straightforward: reconfigure your Promtail or Fluent Bit outputs to point at the LogTide HTTP ingest endpoint, translate your LogQL label selectors and regex filters to LogTide REST API parameters (see the query mapping table on this page), and recreate your Grafana alerting rules as LogTide native alert rules. A full migration guide is at /docs/migration/loki/."
---

Grafana Loki and LogTide are both open-source log management tools. Loki excels at lightweight label-based indexing within the Grafana ecosystem. LogTide provides an all-in-one solution with full-text search, built-in alerting, and SIEM capabilities. Here's how they compare.

## Architecture Comparison

### Grafana Loki

Loki takes a unique approach: it indexes only labels (metadata), not log content. This keeps storage costs low but limits search capabilities. Loki is designed as one piece of the Grafana observability stack.

**Required components:** Loki + Promtail + Grafana + AlertManager (for alerts)

### LogTide

LogTide indexes both labels and content, providing fast full-text search. It's a self-contained platform with built-in UI, alerting, and SIEM.

**Required components:** LogTide (single Docker Compose stack)

## Feature Comparison

| Feature | Grafana Loki | LogTide |
|---------|-------------|---------|
| Log ingestion | Promtail, Fluent Bit | HTTP API, SDKs, OTLP |
| Query language | LogQL | REST API + Full-text |
| Full-text search | Limited (regex only) | Indexed full-text |
| Indexing strategy | Labels only | Labels + Content |
| Built-in alerting | No (requires Grafana) | Native |
| Built-in UI | No (requires Grafana) | Included |
| Sigma detection rules | No | Built-in |
| Incident management | No | Built-in |
| MITRE ATT&CK mapping | No | Built-in |
| OpenTelemetry | Yes | Native OTLP |
| Real-time streaming | Tail queries | SSE |
| Multi-tenancy | Yes (tenant header) | Yes (organizations/projects) |

## Where Grafana Loki Wins

**Lightweight and cost-efficient.** Loki's label-only indexing means significantly less storage and compute for pure aggregation use cases. If you primarily filter by labels and rarely search log content, Loki is extremely efficient.

**Grafana ecosystem.** If you already use Grafana for metrics dashboards (Prometheus, Mimir), adding Loki gives you logs in the same familiar interface alongside your metrics.

**Kubernetes-native.** Loki with Promtail is specifically designed for Kubernetes log collection. The integration is seamless with auto-discovery of pod labels.

**Mature scaling model.** Loki's microservices mode (distributor, ingester, querier, compactor) allows independent scaling of each component for very large deployments.

## Where LogTide Wins

**True full-text search.** Loki only indexes labels, so searching log content requires regex scanning across chunks. LogTide indexes everything, making content search fast and efficient.

**All-in-one solution.** Loki requires Grafana for UI, AlertManager for alerts, and Promtail for collection. LogTide includes UI, alerting, SDKs, and SIEM in a single deployment.

**Security detection.** Loki is purely a log aggregation tool. LogTide includes Sigma rules, MITRE ATT&CK mapping, and incident management for security teams.

**Simpler operations.** Instead of managing 3-4 separate services (Loki, Promtail, Grafana, AlertManager), LogTide runs as one Docker Compose stack.

**No label cardinality concerns.** Loki has strict limits on label cardinality. High-cardinality labels (user IDs, request IDs) can cause performance issues. LogTide stores these in metadata JSON without cardinality constraints.

## When to Choose Grafana Loki

- You already use Grafana extensively and want logs in the same UI
- You primarily filter logs by labels, not by content search
- You need extremely cost-efficient storage for very high volumes
- You're running Kubernetes and want native pod log collection
- You don't need SIEM or security detection capabilities

## When to Choose LogTide

- You need fast full-text search across log content
- You want a single tool instead of managing Loki + Grafana + AlertManager
- Security detection (Sigma rules, SIEM) is important to you
- You want built-in alerting without external dependencies
- You need native SDKs for application-level logging (not just file tailing)

## Query Migration (LogQL to LogTide)

| LogQL | LogTide API |
|-------|-------------|
| `{job="api"}` | `GET /api/v1/logs?service=api` |
| `{job="api"} \|= "error"` | `GET /api/v1/logs?service=api&level=error` |
| `{job="api"} \|~ "timeout\|connection"` | `GET /api/v1/logs?service=api&q=timeout` |
| `{job="api"} \| json` | Auto (metadata is JSON) |
| `count_over_time({job="api"}[5m])` | `GET /api/v1/logs/aggregated?interval=5m` |

**Key difference:** Loki requires regex patterns (`|~`) to search log content because it doesn't index log bodies. LogTide indexes everything, so you can search any text with the `q` parameter.

## Concept Mapping

| Loki | LogTide | Notes |
|------|---------|-------|
| Tenant | Organization / Project | Multi-tenancy via projects |
| Labels | service + metadata | service is indexed, extra fields in metadata |
| Stream | Service | One label set = one service |
| Promtail | Fluent Bit / SDK | Use Fluent Bit or application SDK |
| LogQL | REST API params | Simpler query syntax |
| Grafana | LogTide UI | Built-in web interface |
| Grafana Alerting | Alert Rules | Native alerting, no external tools |
| N/A | Sigma Rules + SIEM | LogTide exclusive |

## Migration Path

Migrating from Loki is straightforward since both support Fluent Bit and OpenTelemetry. Our migration guide covers replacing Promtail, translating LogQL queries, and setting up alerts.

[View the full Loki migration guide](/docs/migration/loki/)

---

**Ready to switch from Grafana Loki?**

- [Deploy LogTide](https://github.com/logtide-dev/logtide) - Free, open-source
- [Migration Guide](/docs/migration/loki/) - Step-by-step instructions
- [Join GitHub Discussions](https://github.com/logtide-dev/logtide/discussions) - Get help from the community
