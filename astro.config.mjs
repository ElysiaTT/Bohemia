import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { articleHeadings } from './scripts/article-headings.ts';
import { readFileSync } from 'node:fs';

const site = JSON.parse(readFileSync(new URL('./src/data/site.json', import.meta.url), 'utf8'));

export default defineConfig({
  site: process.env.SITE_URL || site.url || 'http://localhost:4321',
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'always',
  output: 'static',
  compressHTML: true,
  integrations: [sitemap({ filter: page => !/\/studio(?:\/|$)/.test(new URL(page).pathname) })],
  markdown: {
    processor: satteri({ hastPlugins: [articleHeadings()] }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
  devToolbar: { enabled: false },
});
