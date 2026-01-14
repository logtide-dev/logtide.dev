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
