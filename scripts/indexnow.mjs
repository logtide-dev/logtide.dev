// Run after a deploy to tell IndexNow engines (such as Bing) what changed:
//   node scripts/indexnow.mjs [--since=YYYY-MM-DD]
// Without --since it submits every URL in the live sitemap.
const HOST = 'logtide.dev';
const KEY = 'c7f4e1a29b6d4f03a8e15d72b0c96e34';

const since = process.argv.find((arg) => arg.startsWith('--since='))?.slice(8);
const sitemap = await (await fetch(`https://${HOST}/sitemap-0.xml`)).text();

const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)]
  .map(([, entry]) => ({
    loc: /<loc>([^<]+)/.exec(entry)?.[1],
    lastmod: /<lastmod>([^<]+)/.exec(entry)?.[1],
  }))
  .filter(({ loc, lastmod }) => loc && (!since || (lastmod && lastmod >= since)))
  .map(({ loc }) => loc);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: urls,
  }),
});
console.log(`IndexNow: ${urls.length} URLs, HTTP ${res.status}`);
