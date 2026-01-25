import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import icon from 'astro-icon';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://logtide.dev',
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
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
        } else if (item.url.includes('/docs/getting-started')) {
          item.priority = 0.9;
          item.changefreq = 'weekly';
        } else if (item.url.includes('/docs/sdks/') || item.url.includes('/docs/api')) {
          item.priority = 0.8;
          item.changefreq = 'weekly';
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
    ssr: {
      noExternal: ['shiki'],
    },
  },
});
