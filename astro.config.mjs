import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  site: 'https://logward.dev',
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    icon(),
  ],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },
  vite: {
    ssr: {
      noExternal: ['shiki'],
    },
  },
});
