import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { entryMarkdown, htmlUrl } from '../../lib/llms';

export async function getStaticPaths() {
  const entries = await getCollection('use-cases', ({ data }) => !data.draft);
  return entries.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

export const GET: APIRoute = ({ props }) => {
  const { entry } = props;
  return new Response(entryMarkdown(entry, htmlUrl('use-cases', entry.id)), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
