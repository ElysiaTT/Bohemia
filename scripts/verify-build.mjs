// Verify deployment paths and generated content without starting a browser.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';

const root = resolve('dist');
const base = `/${(process.argv[2] || '').replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '');
const files = [];
function walk(directory) { for (const name of readdirSync(directory)) { const path = resolve(directory, name); if (statSync(path).isDirectory()) walk(path); else files.push(path); } }
walk(root);
const htmlFiles = files.filter(file => extname(file) === '.html');
let count = 0;
const errors = [];
const unescape = value => value.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"');

function checkReference(reference, source, route) {
  if (!reference || /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(reference)) return;
  count++;
  const url = new URL(unescape(reference), `https://build.test${route}`);
  let pathname = decodeURIComponent(url.pathname);
  if (base && pathname !== base && !pathname.startsWith(`${base}/`)) { errors.push(`${source}: reference escapes deployment base: ${reference}`); return; }
  if (base) pathname = pathname.slice(base.length);
  let target = resolve(root, `.${pathname}`);
  if (!target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`) && target !== root) { errors.push(`${source}: reference escapes dist: ${reference}`); return; }
  if (existsSync(target) && statSync(target).isDirectory()) target = resolve(target, 'index.html');
  if (!existsSync(target)) { errors.push(`${source}: missing ${reference}`); return; }
  if (url.hash && extname(target) === '.html') {
    const content = readFileSync(target, 'utf8');
    const id = decodeURIComponent(url.hash.slice(1));
    if (!content.includes(`id="${id}"`) && !content.includes(`id='${id}'`)) errors.push(`${source}: missing anchor ${reference}`);
  }
}

for (const file of htmlFiles) {
  const content = readFileSync(file, 'utf8');
  const relative = file.slice(root.length).replaceAll('\\', '/');
  const route = `${base}${relative.replace(/index\.html$/, '')}`;
  const h1Count = [...content.matchAll(/<h1(?:\s|>)/g)].length;
  if (h1Count !== 1) errors.push(`${relative}: expected one h1, got ${h1Count}`);
  for (const match of content.matchAll(/\b(?:href|src)="([^"]+)"/g)) checkReference(match[1], relative, route);
}
for (const file of files.filter(path => extname(path) === '.css')) {
  const content = readFileSync(file, 'utf8');
  const relative = file.slice(root.length).replaceAll('\\', '/');
  for (const match of content.matchAll(/url\(["']?([^\s)"']+)["']?\)/g)) checkReference(match[1], relative, `${base}${relative}`);
}
const index = JSON.parse(readFileSync(resolve(root, 'search.json'), 'utf8'));
for (const post of index) {
  checkReference(post.url, 'search.json', `${base}/`);
  if (!post.body || !post.title || !post.tags) errors.push('Incomplete search record');
}
const rss = readFileSync(resolve(root, 'rss.xml'), 'utf8');
for (const post of index) if (!unescape(rss).includes(post.title)) errors.push(`RSS missing post: ${post.title}`);
if (rss.includes('localhost') && base) errors.push('RSS still contains localhost in deployment build');
const manifest = readFileSync(resolve(root, 'sitemap-index.xml'), 'utf8');
if (base && !manifest.includes(`${base}/sitemap-0.xml`)) errors.push('Sitemap does not include deployment base');
if (index.some(post => post.title.includes('DRAFT_VISIBILITY_CHECK'))) errors.push('Draft leaked into the search index');
if (rss.includes('DRAFT_VISIBILITY_CHECK')) errors.push('Draft leaked into RSS');
if (existsSync(resolve(root, 'posts/draft-visibility-check/index.html'))) errors.push('Draft page was generated');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`PASS: ${htmlFiles.length} HTML pages, ${count} local references, ${index.length} searchable posts, RSS and sitemap. Base: ${base || '/'}`);
