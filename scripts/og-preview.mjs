// Renders one sample OG image per template to a folder, for visual review.
// Usage: node scripts/og-preview.mjs <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderOg } from '../src/og/og.mjs';

const out = process.argv[2] ?? 'og-preview';
mkdirSync(out, { recursive: true });

const samples = {
  home: {},
  blog: {
    slug: 'one-log-query-three-databases',
    title: 'One Log Query on Postgres, ClickHouse and MongoDB (Harder Than It Sounds)',
    description: 'How LogTide makes one log search return the same rows on TimescaleDB, ClickHouse and MongoDB: word rules, three index strategies and a conformance suite.',
    tags: ['databases', 'clickhouse', 'postgresql', 'mongodb'],
    date: '2026-11-25',
  },
  docs: {
    path: '/docs/query-syntax/',
    title: 'Query Syntax',
    description: 'The LogTide log query language: words, phrases, field filters, negation, OR groups, metadata clauses, limits, and search on TimescaleDB, ClickHouse, MongoDB.',
  },
  changelog: {
    version: 'v1.7.1',
    title: '1.7.1: Visible Limits, IP Ranges for API Keys, NetAPI Reputation',
    date: '2026-11-24',
    recent: ['v1.6.3', 'v1.6.4', 'v1.7.0', 'v1.7.1'],
  },
  integration: {
    slug: 'nginx',
    title: 'nginx Access and Error Log Integration',
    description: 'Send nginx access and error logs to LogTide with structured parsing. Complete setup for Docker, systemd, and Kubernetes.',
    category: 'web-server',
    difficulty: 'easy',
    brandIcon: 'simple-icons:nginx',
  },
  usecase: {
    slug: 'gdpr-compliance',
    title: 'GDPR-Compliant Logging',
    description: 'Implement privacy-first logging that meets GDPR requirements. Data minimization, retention policies, and right to erasure.',
    category: 'compliance',
  },
  versus: {
    slug: 'datadog',
    competitor: 'Datadog',
    description: 'Self-hosted, open-source log management with built-in SIEM, a cost example from list prices and honest trade-offs.',
  },
  pricing: {
    plans: [
      { name: 'Free', gb: 10 },
      { name: 'Pro', price: '$29', gb: 100 },
      { name: 'Pro Plus', price: '$99', gb: 400 },
    ],
  },
  guide: {
    path: '/datadog-alternatives/',
    title: 'Datadog Alternatives Compared',
    eyebrow: '7 options compared',
    description: 'Seven Datadog alternatives compared: Grafana, SigNoz, Elastic, New Relic, Better Stack, Graylog and LogTide. Who each fits, limits, and sourced pricing.',
  },
};

for (const [name, data] of Object.entries(samples)) {
  const t0 = Date.now();
  writeFileSync(join(out, `${name}.png`), await renderOg(name, data));
  console.log(`${name}.png ${Date.now() - t0}ms`);
}
