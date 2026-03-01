import { defineConfig } from 'astro/config';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import icon from 'astro-icon';
import sitemap from '@astrojs/sitemap';
// https://astro.build/config
export default defineConfig({
  site: 'https://logtide.dev',
  trailingSlash: 'ignore',
  integrations: [
    icon(),
    sitemap({
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
        } else if (item.url.includes('/legal/')) {
          // Legal pages - low priority, rarely change
          item.priority = 0.3;
          item.changefreq = 'yearly';
        }
        return item;
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'one-dark-pro',
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
    plugins: [
      {
        name: 'trailing-slash-redirect',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            const url = req.url ?? '';
            // Skip assets, API routes, and URLs that already have a trailing slash
            if (url === '/' || url.includes('.') || url.includes('?') || url.endsWith('/')) {
              return next();
            }
            // Redirect /docs -> /docs/ so Vite resolves index.astro
            _res.writeHead(308, { Location: url + '/' });
            _res.end();
          });
        },
      },
    ],
  },
});
