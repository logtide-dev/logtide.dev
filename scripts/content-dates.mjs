// Real last-modified dates for the sitemap, taken from git history. Returns an
// empty map when git isn't available, so URLs simply have no <lastmod> instead
// of a made-up one.
import { execSync } from 'node:child_process';

const SITE = 'https://logtide.dev';
const COLLECTION_ROUTES = {
  integrations: 'integrations',
  'use-cases': 'use-cases',
  comparisons: 'vs',
  blog: 'blog',
};

function urlForFile(file) {
  const page = /^src\/pages\/(.+)\.astro$/.exec(file);
  if (page) {
    if (page[1].includes('[')) return null;
    const route = page[1].replace(/(^|\/)index$/, '');
    return route ? `${SITE}/${route}/` : `${SITE}/`;
  }

  const release = /^src\/content\/changelog\/v(\d+)-(\d+)-\d+\.md$/.exec(file);
  if (release) return `${SITE}/changelog/v${release[1]}-${release[2]}/`;

  const content = /^src\/content\/([^/]+)\/(.+)\.md$/.exec(file);
  if (content && COLLECTION_ROUTES[content[1]]) {
    return `${SITE}/${COLLECTION_ROUTES[content[1]]}/${content[2]}/`;
  }
  return null;
}

export function getLastmodMap() {
  const lastmod = new Map();
  let log;
  try {
    log = execSync('git log --format=@%cI --name-only -- src/pages src/content', {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 256,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return lastmod;
  }

  // git log is newest first, so the first date seen for a URL is its latest.
  let date = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) {
      date = line.slice(1);
    } else if (line.trim()) {
      const url = urlForFile(line.trim());
      if (url && !lastmod.has(url)) lastmod.set(url, date);
    }
  }
  return lastmod;
}
