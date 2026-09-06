import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_URL, SITE_NAME } from '../lib/llms';

/** Combined changelog + roadmap as a single Markdown document. */
export const GET: APIRoute = async () => {
  const entries = await getCollection('changelog', ({ data }) => !data.draft);

  // Released (newest first) then in-progress, then planned.
  const statusOrder: Record<string, number> = { released: 0, 'in-progress': 1, planned: 2 };
  entries.sort((a, b) => {
    const s = (statusOrder[a.data.status] ?? 9) - (statusOrder[b.data.status] ?? 9);
    if (s !== 0) return s;
    const da = a.data.date ? a.data.date.getTime() : 0;
    const db = b.data.date ? b.data.date.getTime() : 0;
    return db - da;
  });

  const parts: string[] = [
    `# ${SITE_NAME} Changelog & Roadmap`,
    '',
    `> Release history and planned features for LogTide.`,
    '',
    `*Source: ${SITE_URL}/changelog/*`,
    '',
    '---',
    '',
  ];

  for (const entry of entries) {
    const { version, title, date, status, type, targetDate } = entry.data;
    const heading = version ? `${version} - ${title}` : title;
    parts.push(`## ${heading}`, '');

    const meta: string[] = [`**Status:** ${status}`, `**Type:** ${type}`];
    if (date) meta.push(`**Date:** ${date.toISOString().slice(0, 10)}`);
    else if (targetDate) meta.push(`**Target:** ${targetDate}`);
    parts.push(meta.join(' · '), '');

    const body = (entry.body ?? '').trim();
    if (body) parts.push(body, '');
  }

  return new Response(parts.join('\n'), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
