import { defineCollection, z } from 'astro:content';

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
  type: 'content',
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
  type: 'content',
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

    // Publication metadata
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  integrations,
  'use-cases': useCases,
};

// Export types for use in components
export type IntegrationCategory = typeof integrationCategories[number];
export type UseCaseCategory = typeof useCaseCategories[number];
export type DifficultyLevel = typeof difficultyLevels[number];
