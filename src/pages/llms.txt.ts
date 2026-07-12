import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  LLM_COLLECTIONS,
  mdUrl,
  indexLink,
  docEntriesFromGlob,
  type DocEntry,
} from '../lib/llms';

// Auto-discover the hand-authored docs pages so the index stays in sync
// as pages are added. We only need the keys (paths), not the modules.
const docModulePaths = Object.keys(import.meta.glob('./docs/**/*.astro'));

/**
 * `/llms.txt` — a curated, LLM-friendly index of the site (llmstxt.org format).
 * Content-collection pages link to their clean `.md` mirrors; hand-authored
 * docs link to their canonical HTML pages.
 */
export const GET: APIRoute = async () => {
  const lines: string[] = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    'LogTide is an open-source, privacy-first log management and observability platform ' +
      'with built-in SIEM (native Sigma rules and threat detection). Self-host it or use ' +
      'the EU-based cloud. The pages below are the canonical documentation, integration ' +
      'guides, competitor comparisons and use cases. Content pages are also available as ' +
      'clean Markdown at the same path with a `.md` extension.',
    '',
    '## Main',
    indexLink('Home', `${SITE_URL}/`, 'Product overview'),
    indexLink('Documentation', `${SITE_URL}/docs/`, 'Guides, SDKs and API reference'),
    indexLink('Integrations', `${SITE_URL}/integrations/`, 'Send logs from any technology'),
    indexLink('Comparisons', `${SITE_URL}/vs/`, 'LogTide versus other platforms'),
    indexLink('Use Cases', `${SITE_URL}/use-cases/`, 'What teams build with LogTide'),
    indexLink('Blog', `${SITE_URL}/blog/`, 'Articles and tutorials'),
    indexLink('Changelog', `${SITE_URL}/changelog/`, 'Release history and roadmap'),
    '',
  ];

  // --- Documentation (hand-authored .astro pages, linked as HTML) ---
  const docs = docEntriesFromGlob(docModulePaths);
  const docGroups: DocEntry['group'][] = ['Documentation', 'SDKs', 'Migration Guides'];
  for (const group of docGroups) {
    const groupDocs = docs.filter((d) => d.group === group);
    if (groupDocs.length === 0) continue;
    lines.push(`## ${group}`);
    for (const doc of groupDocs) {
      lines.push(indexLink(doc.title, doc.url));
    }
    lines.push('');
  }

  // --- Content collections (linked as .md mirrors) ---
  for (const collection of LLM_COLLECTIONS) {
    const entries = await getCollection(collection.name, ({ data }) => !data.draft);
    if (entries.length === 0) continue;
    entries.sort((a, b) => a.data.title.localeCompare(b.data.title));
    lines.push(`## ${collection.heading}`);
    for (const entry of entries) {
      lines.push(indexLink(entry.data.title, mdUrl(collection.base, entry.id), entry.data.description));
    }
    lines.push('');
  }

  // --- Optional (skippable per llmstxt spec) ---
  lines.push(
    '## Optional',
    indexLink('Changelog (Markdown)', `${SITE_URL}/changelog.md`, 'Full release history in Markdown'),
    indexLink('All content (Markdown)', `${SITE_URL}/llms-full.txt`, 'Every content page concatenated'),
    '',
  );

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
