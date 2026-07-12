import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  LLM_COLLECTIONS,
  entryMarkdown,
  htmlUrl,
} from '../lib/llms';

/**
 * `/llms-full.txt` — every content-collection page concatenated into one
 * Markdown document, for tools that prefer a single ingestible file.
 * (Hand-authored `/docs` pages have no Markdown source and are not included;
 * see `/llms.txt` for links to them.)
 */
export const GET: APIRoute = async () => {
  const parts: string[] = [
    `# ${SITE_NAME} — Full Content`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `Source: ${SITE_URL}/`,
    '',
  ];

  for (const collection of LLM_COLLECTIONS) {
    const entries = await getCollection(collection.name, ({ data }) => !data.draft);
    if (entries.length === 0) continue;
    entries.sort((a, b) => a.data.title.localeCompare(b.data.title));
    parts.push('', `# ${collection.heading}`, '');
    for (const entry of entries) {
      parts.push('---', '', entryMarkdown(entry, htmlUrl(collection.base, entry.id)), '');
    }
  }

  return new Response(parts.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
