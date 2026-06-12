import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Integration categories matching the SEO spec
const integrationCategories = [
  'web-server',
  'database',
  'framework',
  'container',
  'language',
  'infrastructure'
] as const;

// Use case categories matching the SEO spec
const useCaseCategories = [
  'compliance',
  'performance',
  'security',
  'cost',
  'operations'
] as const;

// Difficulty levels
const difficultyLevels = ['easy', 'medium', 'advanced'] as const;

/**
 * Integration Guides Collection
 *
 * These are technical tutorials for integrating LogTide with various technologies.
 * Example: nginx, Docker, Node.js, PostgreSQL, Kubernetes
 */
const integrations = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/integrations' }),
  schema: z.object({
    // Required SEO fields
    title: z.string().min(10).max(70),
    description: z.string().min(50).max(160),

    // Categorization
    category: z.enum(integrationCategories),
    difficulty: z.enum(difficultyLevels),

    // Optional SDK reference (if using LogTide SDK)
    sdk: z.enum(['javascript', 'python', 'php', 'kotlin', 'go', 'csharp', 'none']).optional(),

    // Icon for sidebar/cards (lucide icon name or simple-icons brand name)
    icon: z.string().optional(),
    brandIcon: z.string().optional(), // e.g., 'simple-icons:nginx'

    // Related content for cross-linking
    relatedIntegrations: z.array(z.string()).default([]),
    relatedUseCases: z.array(z.string()).default([]),

    // SEO keywords for targeting
    keywords: z.array(z.string()).default([]),

    // Feature highlights for cards
    highlights: z.array(z.string()).max(4).default([]),

    // FAQ entries (rendered visibly + emitted as FAQPage JSON-LD for rich results)
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),

    // Publication metadata
    draft: z.boolean().default(false),
  }),
});

/**
 * Use Cases Collection
 *
 * Problem → Solution narratives for specific business needs.
 * Example: GDPR compliance, multi-tenant SaaS, security monitoring
 */
const useCases = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/use-cases' }),
  schema: z.object({
    // Required SEO fields
    title: z.string().min(10).max(70),
    description: z.string().min(50).max(160),

    // Categorization
    category: z.enum(useCaseCategories),
    difficulty: z.enum(difficultyLevels),

    // Target industries
    industries: z.array(z.string()).default([]),

    // Icon for sidebar/cards
    icon: z.string().optional(),

    // Related content for cross-linking
    relatedUseCases: z.array(z.string()).default([]),
    relatedIntegrations: z.array(z.string()).default([]),

    // SEO keywords
    keywords: z.array(z.string()).default([]),

    // Feature highlights for cards
    highlights: z.array(z.string()).max(4).default([]),

    // FAQ entries (rendered visibly + emitted as FAQPage JSON-LD for rich results)
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),

    // Publication metadata
    draft: z.boolean().default(false),
  }),
});

/**
 * Comparison Pages Collection
 *
 * Honest feature/cost/philosophy comparisons with competitors.
 * Example: LogTide vs Datadog, LogTide vs Splunk
 */
const comparisons = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/comparisons' }),
  schema: z.object({
    // Required SEO fields
    title: z.string().min(10).max(70),
    description: z.string().min(50).max(160),

    // Competitor info
    competitor: z.string(),
    competitorUrl: z.string().url().optional(),
    brandIcon: z.string().optional(),

    // Pricing info
    competitorPricing: z.string(),
    logtidePricing: z.string().default('Free (self-hosted)'),

    // Related content
    migrationDoc: z.string().optional(),
    relatedIntegrations: z.array(z.string()).default([]),
    relatedUseCases: z.array(z.string()).default([]),
    relatedComparisons: z.array(z.string()).default([]),

    // SEO keywords
    keywords: z.array(z.string()).default([]),

    // Feature highlights for cards
    highlights: z.array(z.string()).max(4).default([]),

    // FAQ entries (rendered visibly + emitted as FAQPage JSON-LD for rich results)
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),

    // Publication metadata
    draft: z.boolean().default(false),
  }),
});

/**
 * Blog Collection
 *
 * Informational articles targeting queries that don't fit the
 * integration/use-case/comparison formats (third-party comparisons,
 * tutorials, industry commentary).
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    // Required SEO fields
    title: z.string().min(10).max(80),
    description: z.string().min(50).max(160),

    // Publication metadata
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('LogTide Team'),

    // Categorization & SEO
    tags: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),

    // FAQ entries (rendered visibly + emitted as FAQPage JSON-LD for rich results)
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),

    draft: z.boolean().default(false),
  }),
});

// Changelog entry types and statuses
const changelogTypes = ['feature', 'fix', 'breaking', 'improvement', 'security'] as const;
const changelogStatuses = ['released', 'in-progress', 'planned'] as const;

/**
 * Changelog + Roadmap Collection
 *
 * Combined history of released versions and planned features.
 * All entries live on /changelog — no individual slug pages.
 */
const changelog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/changelog' }),
  schema: z.object({
    version: z.string().optional(),
    title: z.string().min(5).max(80),
    description: z.string().min(10).max(300),
    date: z.coerce.date().optional(),
    targetDate: z.string().optional(),
    status: z.enum(changelogStatuses),
    type: z.enum(changelogTypes),
    highlights: z.array(z.string()).max(6).default([]),
    githubPr: z.string().url().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  integrations,
  'use-cases': useCases,
  comparisons,
  changelog,
  blog,
};

// Export types for use in components
export type IntegrationCategory = typeof integrationCategories[number];
export type UseCaseCategory = typeof useCaseCategories[number];
export type DifficultyLevel = typeof difficultyLevels[number];
export type ChangelogType = typeof changelogTypes[number];
export type ChangelogStatus = typeof changelogStatuses[number];
