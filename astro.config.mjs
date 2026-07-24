import { defineConfig } from 'astro/config';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import icon from 'astro-icon';
import sitemap from '@astrojs/sitemap';
import astroD2 from 'astro-d2';

// https://astro.build/config
export default defineConfig({
  site: 'https://logtide.dev',
  trailingSlash: 'always',
  integrations: [
    icon(),
    sitemap({
      // Non-HTML endpoints (llms.txt) aren't picked up automatically.
      customPages: ['https://logtide.dev/llms.txt'],
      filter: (page) =>
        !page.includes('/login') &&
        !page.includes('/register') &&
        !page.includes('/dashboard'),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      serialize(item) {
        // Higher priority for important pages
        if (item.url === 'https://logtide.dev/') {
          item.priority = 1.0;
          item.changefreq = 'daily';
        } else if (item.url.includes('/docs/getting-started/')) {
          item.priority = 0.9;
          item.changefreq = 'weekly';
        } else if (item.url.includes('/docs/sdks/') || item.url.includes('/docs/api/')) {
          item.priority = 0.8;
          item.changefreq = 'weekly';
        } else if (item.url.includes('/integrations/') && !item.url.endsWith('/integrations/')) {
          // Individual integration guides - high priority for SEO
          item.priority = 0.85;
          item.changefreq = 'weekly';
        } else if (item.url.endsWith('/integrations/')) {
          // Integrations index page
          item.priority = 0.8;
          item.changefreq = 'weekly';
        } else if (item.url.includes('/use-cases/') && !item.url.endsWith('/use-cases/')) {
          // Individual use case pages - high priority for SEO
          item.priority = 0.8;
          item.changefreq = 'weekly';
        } else if (item.url.endsWith('/use-cases/')) {
          // Use cases index page
          item.priority = 0.75;
          item.changefreq = 'weekly';
        } else if (item.url.includes('/changelog/') && !item.url.endsWith('/changelog/')) {
          // Per-release pages - archival content, low crawl priority
          item.priority = 0.4;
          item.changefreq = 'monthly';
        } else if (item.url.includes('/legal/')) {
          // Legal pages - low priority, rarely change
          item.priority = 0.3;
          item.changefreq = 'yearly';
        }
        return item;
      },
    }),
    // Render ```d2 fenced blocks to diagrams. useD2js runs D2 via WebAssembly,
    // so no `d2` binary is required (works on Windows, CI and Docker). One
    // static SVG serves both themes (dark: false); brand colors live in the
    // diagram source and are tuned to read on the light and dark backgrounds.
    astroD2({
      inline: true,
      pad: 24,
      layout: 'dagre',
      theme: { default: '0', dark: false },
      experimental: { useD2js: true },
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'one-dark-pro',
      },
      // env/conf have no Shiki grammar; d2 fences are rendered by astro-d2
      // before Shiki ever sees them, the alias only silences `astro check`
      langAlias: {
        env: 'dotenv',
        conf: 'ini',
        d2: 'text',
      },
    },
  },
  vite: {
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },
    ssr: {
      noExternal: ['shiki'],
    },
  },
});
