// Open Graph images for every page, rendered once at build time.
// /og/<path>.png, where <path> is set by each page type below. Pages point
// their og:image at these URLs through ogImageUrl() in src/og/paths.ts.

import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderOg } from '../../og/og.mjs';
import { plans } from '../../data/pricing-plans';
import { releaseGroupSlug } from '../../lib/changelog';

type Page = { params: { path: string }; props: { template: string; data: Record<string, unknown> } };

const stripSuffix = (title: string) => title.replace(/\s*[|-]\s*LogTide.*$/, '').trim();

/** Reads `const title = '...'` and `const description = '...'` from an .astro page. */
function pageConsts(file: string): { title: string; description: string } {
  const src = readFileSync(join(process.cwd(), file), 'utf8');
  const read = (name: string) => {
    const m = new RegExp(`const ${name}\\s*=\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`, 's').exec(src);
    return m ? m[2].replace(/\\(['"])/g, '$1') : '';
  };
  return { title: read('title'), description: read('description') };
}

/** Every docs page with the title and description it passes to DocsLayout. */
function docsPages(): Page[] {
  const root = join(process.cwd(), 'src/pages/docs');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.astro')) files.push(full);
    }
  };
  walk(root);
  return files.flatMap((file) => {
    const src = readFileSync(file, 'utf8');
    const tag = /<DocsLayout([\s\S]*?)>/.exec(src)?.[1] ?? '';
    const title = /\btitle="([^"]*)"/.exec(tag)?.[1];
    const description = /\bdescription="([^"]*)"/.exec(tag)?.[1] ?? '';
    if (!title) return [];
    const rel = relative(root, file).replace(/\\/g, '/').replace(/\.astro$/, '');
    const slug = rel === 'index' ? 'index' : rel.replace(/\/index$/, '');
    const url = slug === 'index' ? '/docs/' : `/docs/${slug}/`;
    return [{ params: { path: `docs/${slug}` }, props: { template: 'docs', data: { path: url, title, description } } }];
  });
}

export const getStaticPaths: GetStaticPaths = async () => {
  const pages: Page[] = [];
  const add = (path: string, template: string, data: Record<string, unknown> = {}) =>
    pages.push({ params: { path }, props: { template, data } });

  add('home', 'home');

  add('pricing', 'pricing', {
    plans: plans.map((p) => ({
      name: p.name,
      price: p.monthly > 0 ? p.price : null,
      gb: Number(/(\d+)\s*GB/.exec(p.limits[0])?.[1] ?? 0),
    })),
  });

  for (const page of ['datadog-alternatives', 'elk-alternatives', 'cloud-logging-pricing', 'self-hosted-log-management']) {
    const { title, description } = pageConsts(`src/pages/${page}.astro`);
    add(`guides/${page}`, 'guide', { path: `/${page}/`, title: stripSuffix(title), description });
  }

  const blog = await getCollection('blog', ({ data }) => !data.draft);
  const blogIndex = pageConsts('src/pages/blog/index.astro');
  add('blog/index', 'blog', { slug: 'blog', title: 'The LogTide blog', description: blogIndex.description, tags: [] });
  for (const e of blog) {
    add(`blog/${e.id}`, 'blog', { slug: e.id, title: e.data.title, description: e.data.description, tags: e.data.tags, date: e.data.pubDate });
  }

  pages.push(...docsPages());

  const releases = (await getCollection('changelog', ({ data }) => !data.draft && data.status === 'released'))
    .filter((e) => releaseGroupSlug(e.id) && e.data.date)
    .sort((a, b) => a.data.date!.getTime() - b.data.date!.getTime());
  const releaseData = (index: number) => {
    const e = releases[index];
    return {
      version: e.data.version,
      title: e.data.title,
      date: e.data.date,
      recent: releases.slice(Math.max(0, index - 3), index + 1).map((r) => r.data.version),
    };
  };
  const newestByGroup = new Map<string, number>();
  releases.forEach((e, i) => newestByGroup.set(releaseGroupSlug(e.id)!, i));
  for (const [group, index] of newestByGroup) add(`changelog/${group}`, 'changelog', releaseData(index));
  if (releases.length) add('changelog/index', 'changelog', releaseData(releases.length - 1));

  const integrations = await getCollection('integrations');
  const intIndex = pageConsts('src/pages/integrations/index.astro');
  add('integrations/index', 'integration', { slug: 'integrations', title: stripSuffix(intIndex.title), description: intIndex.description });
  for (const e of integrations) {
    add(`integrations/${e.id}`, 'integration', {
      slug: e.id, title: e.data.title, description: e.data.description,
      category: e.data.category, difficulty: e.data.difficulty, brandIcon: e.data.brandIcon,
    });
  }

  const useCases = await getCollection('use-cases');
  const ucIndex = pageConsts('src/pages/use-cases/index.astro');
  add('use-cases/index', 'usecase', { slug: 'use-cases', title: stripSuffix(ucIndex.title), description: ucIndex.description });
  for (const e of useCases) {
    add(`use-cases/${e.id}`, 'usecase', { slug: e.id, title: e.data.title, description: e.data.description, category: e.data.category });
  }

  const comparisons = await getCollection('comparisons');
  const vsIndex = pageConsts('src/pages/vs/index.astro');
  add('vs/index', 'versus', { slug: 'vs', competitor: 'Competitors', description: vsIndex.description, path: '/vs/' });
  for (const e of comparisons) {
    add(`vs/${e.id}`, 'versus', { slug: e.id, competitor: e.data.competitor, description: e.data.description });
  }

  return pages;
};

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOg(props.template, props.data);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
