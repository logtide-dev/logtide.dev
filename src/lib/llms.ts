import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '../config/seo';

export { SITE_URL, SITE_NAME, SITE_DESCRIPTION };

/**
 * Shared helpers for the LLM-facing plain-text/markdown endpoints
 * (`/llms.txt`, `/llms-full.txt`, and the per-page `*.md` mirrors).
 *
 * These expose the site's Markdown content collections in a clean,
 * chrome-free form so that LLMs and coding assistants can read the
 * canonical LogTide docs instead of re-deriving setup from HTML.
 */

/** A content collection paired with the public URL segment it renders under. */
export interface LlmCollection {
  /** astro:content collection name */
  name: 'integrations' | 'use-cases' | 'comparisons' | 'blog';
  /** URL segment the HTML pages live under (comparisons render at /vs/) */
  base: string;
  /** Heading used in the llms.txt index */
  heading: string;
}

export const LLM_COLLECTIONS: LlmCollection[] = [
  { name: 'integrations', base: 'integrations', heading: 'Integrations' },
  { name: 'use-cases', base: 'use-cases', heading: 'Use Cases' },
  { name: 'comparisons', base: 'vs', heading: 'Comparisons' },
  { name: 'blog', base: 'blog', heading: 'Blog' },
];

/** Minimal shape shared by every collection entry we render. */
export interface ContentEntryLike {
  id: string;
  body?: string;
  data: { title: string; description?: string };
}

export function htmlUrl(base: string, id: string): string {
  return `${SITE_URL}/${base}/${id}/`;
}

export function mdUrl(base: string, id: string): string {
  return `${SITE_URL}/${base}/${id}.md`;
}

/**
 * Render a single content entry as a self-contained Markdown document:
 * title, blockquoted description, a source link back to the canonical
 * HTML page, then the raw Markdown body.
 */
export function entryMarkdown(entry: ContentEntryLike, sourceUrl: string): string {
  const parts: string[] = [`# ${entry.data.title}`, ''];
  if (entry.data.description) {
    parts.push(`> ${entry.data.description}`, '');
  }
  parts.push(`*Source: ${sourceUrl}*`, '', '---', '', (entry.body ?? '').trim(), '');
  return parts.join('\n');
}

/** Build a `- [title](url): description` bullet for the index. */
export function indexLink(title: string, url: string, description?: string): string {
  return description ? `- [${title}](${url}): ${description}` : `- [${title}](${url})`;
}

const ACRONYMS: Record<string, string> = {
  api: 'API',
  sdk: 'SDK',
  sdks: 'SDKs',
  opentelemetry: 'OpenTelemetry',
  otel: 'OTel',
  csharp: 'C#',
  php: 'PHP',
  nodejs: 'Node.js',
  nextjs: 'Next.js',
  'nextjs-sdk': 'Next.js SDK',
  'nuxt-sdk': 'Nuxt SDK',
  sveltekit: 'SvelteKit',
  wordpress: 'WordPress',
  elk: 'ELK',
  loki: 'Loki',
  signoz: 'SigNoz',
  ci: 'CI',
  cd: 'CD',
};

/** Turn a kebab-case slug segment into a human title, honouring acronyms. */
export function titleize(slug: string): string {
  const whole = ACRONYMS[slug.toLowerCase()];
  if (whole) return whole;
  return slug
    .split('-')
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Derive an ordered list of documentation entries from the `src/pages/docs`
 * `.astro` files discovered via `import.meta.glob`. Docs are hand-authored
 * Astro pages (no Markdown source), so we link to the HTML pages and derive
 * titles from the file paths — this keeps the index self-updating.
 */
export interface DocEntry {
  title: string;
  url: string;
  group: 'Documentation' | 'SDKs' | 'Migration Guides';
}

export function docEntriesFromGlob(paths: string[]): DocEntry[] {
  const entries: DocEntry[] = [];
  for (const path of paths) {
    // e.g. "./docs/sdks/nodejs.astro" or "/src/pages/docs/sdks/nodejs.astro" -> "sdks/nodejs"
    const rel = path.replace(/^.*?\/docs\//, '').replace(/\.astro$/, '');
    if (rel === '404') continue;
    const isIndex = rel === 'index' || rel.endsWith('/index');
    const slugPath = isIndex ? rel.replace(/\/?index$/, '') : rel;
    const urlPath = slugPath ? `docs/${slugPath}` : 'docs';
    const url = `${SITE_URL}/${urlPath}/`;

    let group: DocEntry['group'] = 'Documentation';
    if (slugPath.startsWith('sdks')) group = 'SDKs';
    else if (slugPath.startsWith('migration')) group = 'Migration Guides';

    const lastSegment = slugPath.split('/').pop() || 'overview';
    let title = titleize(lastSegment || 'Overview');
    if (isIndex && group === 'SDKs') title = 'SDKs Overview';
    else if (isIndex && group === 'Migration Guides') title = 'Migration Overview';
    else if (isIndex && slugPath === '') title = 'Documentation Home';

    entries.push({ title, url, group });
  }

  // Stable order: overview/index pages first within each group, then alphabetical.
  return entries.sort((a, b) => a.url.localeCompare(b.url));
}
