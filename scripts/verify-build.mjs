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
const home = readFileSync(resolve(root, 'index.html'), 'utf8');
const record = JSON.parse(readFileSync(resolve('src/data/tracklist.json'), 'utf8'));
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const slugs = record.flatMap(side => side.tracks.map(track => track.slug));
if (record.length !== 2 || record[0].tracks.length !== 8 || record[1].tracks.length !== 6) errors.push('Expected 8 Side A columns and 6 Side B columns');
if (new Set(slugs).size !== slugs.length) errors.push('Record column IDs must be unique');
if (!home.includes('data-record-side="side-a"')) errors.push('Home must default to Side A');
if ((home.match(/<button\b[^>]*\bdata-record-toggle(?=[\s=>])/g) || []).length !== 1) errors.push('Expected one record flip button');
if (home.includes('class="record-sides"') || home.includes('两面唱片，写给不同的世界')) errors.push('Obsolete static two-column tracklist remains');
if (home.includes('record-article-flow')) errors.push('Home must show articles inside their columns without a duplicate article feed');
const columnSections = [...home.matchAll(/<li\b[^>]*\bdata-column="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
if (columnSections.length !== slugs.length) errors.push('Each record column must have its own section');
const columnBodies = new Map(columnSections.map(([, slug, body]) => [slug, body]));
for (const side of record) {
  if (!home.includes(`data-record-panel="${side.id}"`) || !home.includes(`data-record-face="${side.id}"`)) errors.push(`Missing panel or cover for ${side.id}`);
  for (const track of side.tracks) {
    if (!track.note || !home.includes(escape(track.title)) || !home.includes(escape(track.note))) errors.push(`Missing title or Chinese description: ${track.slug}`);
    const body = columnBodies.get(track.slug) || '';
    if (!body.includes('class="record-column-header"') || !body.includes(`id="column-${track.slug}"`)) errors.push(`Missing column header: ${track.slug}`);
    const cards = [...body.matchAll(/<article\b[^>]*\bclass="post-card"/g)].length;
    if (cards > 4) errors.push(`Too many homepage articles in column: ${track.slug}`);
    if (cards) {
      if (!body.includes('class="record-column-articles"') || !body.includes(`aria-labelledby="column-${track.slug}"`)) errors.push(`Articles must be grouped beneath their column: ${track.slug}`);
      if ((body.match(/<h5\b/g) || []).length !== cards) errors.push(`Article headings must follow the column heading: ${track.slug}`);
    } else if (!body.includes('即将更新')) errors.push(`Empty column must show its upcoming state: ${track.slug}`);
    if (body.includes('data-article-kind="layout-example"')) {
      if (!body.includes('不计入本专栏')) errors.push(`Layout examples must be labelled: ${track.slug}`);
      if (body.includes(`${base}/columns/${track.slug}/`)) errors.push(`Layout examples must not create column archive links: ${track.slug}`);
      for (const id of track.layoutPreviewPosts || []) {
        if (!body.includes(`${base}/posts/${id}/`)) errors.push(`Missing layout example: ${track.slug}/${id}`);
      }
    }
  }
}
const backPanel = home.match(/<section[^>]*data-record-panel="side-b"[^>]*>/)?.[0] || '';
if (!backPanel.includes('inert') || !backPanel.includes('aria-hidden="true"')) errors.push('Inactive Side B must be inert and hidden from assistive technology');
const studio = readFileSync(resolve(root, 'studio/index.html'), 'utf8');
if (!studio.includes('noindex, follow') || !studio.includes('id="studio-form"') || !studio.includes('id="studio-auth"')) errors.push('Writing room must include the editor, authentication dialog and noindex directive');
for (const id of ['studio-management', 'studio-document-status', 'studio-unpublish', 'studio-republish', 'studio-delete-article', 'studio-delete-draft', 'studio-confirm', 'studio-confirm-input']) {
  if (!studio.includes(`id="${id}"`)) errors.push(`Writing room is missing article management control: ${id}`);
}
if (!home.includes(`${base}/studio/`)) errors.push('Home must link to the writing room');
const studioPosts = JSON.parse(readFileSync(resolve(root, 'studio/posts.json'), 'utf8'));
if (studioPosts.length !== index.length) errors.push('Writing room snapshot must include exactly the public posts');
for (const article of studioPosts) {
  if (article.values.draft || !article.values.body || !/^[a-f0-9]{40}$/.test(article.sha) || !article.path.startsWith('src/content/posts/')) errors.push('Invalid or private article in public writing room snapshot');
  if (!index.some(post => post.title === article.values.title)) errors.push('Writing room exposed a non-public article');
}
const sitemap = readFileSync(resolve(root, 'sitemap-0.xml'), 'utf8');
if (/\/studio(?:\/|<)/.test(sitemap)) errors.push('Writing room must not appear in the public sitemap');
if (index.some(post => post.title.includes('DRAFT_VISIBILITY_CHECK'))) errors.push('Draft leaked into the search index');
if (rss.includes('DRAFT_VISIBILITY_CHECK')) errors.push('Draft leaked into RSS');
if (existsSync(resolve(root, 'posts/draft-visibility-check/index.html'))) errors.push('Draft page was generated');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`PASS: ${htmlFiles.length} HTML pages, ${count} local references, ${index.length} searchable posts, 14 record columns, RSS and sitemap. Base: ${base || '/'}`);
