import test from 'node:test';
import assert from 'node:assert/strict';
import { articlePath, decodeBase64, emptyArticle, isArticlePath, parseArticle, serializeArticle, validateArticle } from '../src/lib/studio-content.ts';
import { RepositoryConflict, StudioGitHub } from '../src/lib/studio-github.ts';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { articleHeadings } from '../scripts/article-headings.ts';

const columns = new Set(['wish-you-were-real']);
const repository = { owner: 'ElysiaTT', repo: 'Bohemia', branch: 'main' };
const values = () => ({ ...emptyArticle(), slug: 'a-new-song', title: '中文标题："一首歌"', description: '有换行\n也有引号与 # 符号。', date: '2026-11-11', category: '技术', column: 'wish-you-were-real', tags: ['学习', 'rock & roll'], body: '## 开始\n\n你好，世界 🎸\n\n```\n---\n```\n' });
const draft = () => ({ id: 'local:test', values: values(), savedAt: '2026-11-11T00:00:00Z' });
const encoded = text => Buffer.from(text).toString('base64');
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('Markdown document titles render below the page title with matching table of contents', async () => {
  const renderer = await createSatteriMarkdownProcessor({ hastPlugins: [articleHeadings()], syntaxHighlight: false });
  const source = '# Document title\n\n## Section\n\n### Detail\n\n###### Deepest\n\n```md\n# A code sample stays unchanged\n```';
  const rendered = await renderer.render(source);
  assert.doesNotMatch(rendered.code, /<h1\b/);
  assert.match(rendered.code, /<h2 id="document-title">Document title<\/h2>/);
  assert.match(rendered.code, /<h3 id="section">Section<\/h3>/);
  assert.match(rendered.code, /<h4 id="detail">Detail<\/h4>/);
  assert.match(rendered.code, /<h6 id="deepest">Deepest<\/h6>/);
  assert.match(rendered.code, /# A code sample stays unchanged/);
  assert.deepEqual(rendered.metadata.headings.map(({ depth }) => depth), [2, 3, 4, 6]);
});

test('Existing Markdown without a document title keeps its heading levels', async () => {
  const renderer = await createSatteriMarkdownProcessor({ hastPlugins: [articleHeadings()], syntaxHighlight: false });
  const rendered = await renderer.render('## Section\n\n### Detail\n\n```md\n# Only a code example\n```');
  assert.match(rendered.code, /<h2 id="section">Section<\/h2>/);
  assert.match(rendered.code, /<h3 id="detail">Detail<\/h3>/);
  assert.deepEqual(rendered.metadata.headings.map(({ depth }) => depth), [2, 3]);
});

test('Chinese Markdown and metadata round-trip without changing article flags', () => {
  const article = { ...values(), draft: true, demo: true, featured: true };
  assert.deepEqual(parseArticle(serializeArticle(article), article.slug), article);
  assert.equal(decodeBase64(encoded(article.body)), article.body);
});

test('Editing preserves unrecognised frontmatter, comments and body separators', () => {
  const source = '---\n# Keep this note\ntitle: Old\ndescription: old\ndate: 2026-11-10\ncategory: 技术\ncustom:\n  important: keep\ndemo: true\nfeatured: true\n---\n\nOriginal body\n';
  const article = parseArticle(source, 'a-new-song');
  article.title = 'New title';
  const updated = serializeArticle(article, source);
  assert.match(updated, /# Keep this note/);
  assert.match(updated, /important: keep/);
  assert.match(updated, /demo: true/);
  assert.match(updated, /featured: true/);
  assert.equal(parseArticle(updated, article.slug).title, 'New title');
});

test('Paths, columns, calendar dates and empty content are validated before publication', () => {
  for (const slug of ['../escape', '/absolute', 'ok/../../outside', 'Uppercase', 'a.md', 'a%2fb']) assert.throws(() => articlePath(slug));
  assert.equal(isArticlePath('.github/workflows/deploy.yml'), false);
  assert.equal(isArticlePath('src/content/posts/some/article.md'), true);
  assert.equal(validateArticle(values(), columns).length, 0);
  assert.ok(validateArticle({ ...values(), date: '2026-02-30' }, columns).length);
  assert.ok(validateArticle({ ...values(), column: 'unknown-column' }, columns).length);
  assert.ok(validateArticle({ ...values(), cover: 'images/../../secret.png' }, columns).length);
  assert.ok(validateArticle({ ...values(), title: '', description: '', body: '' }, columns).length >= 3);
});

function transport({ existing, conflict = false, editSource, collision = false } = {}) {
  const requests = [];
  const send = async (url, init = {}) => {
    assert.ok(url.startsWith('https://api.github.com/repos/ElysiaTT/Bohemia/'));
    assert.equal(init.headers.Authorization, 'Bearer test-only-credential');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    const path = new URL(url).pathname.replace('/repos/ElysiaTT/Bohemia', '');
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ path, method, body });
    if (path === '/git/ref/heads/main') return response({ object: { sha: 'old-head' } });
    if (path === '/git/commits/old-head') return response({ tree: { sha: 'old-tree' } });
    if (path === '/git/trees/old-tree') return response({ sha: 'old-tree', tree: existing || [] });
    if (path === '/git/blobs/original-blob') return response({ encoding: 'base64', content: encoded(editSource) });
    if (path === '/git/blobs' && body.encoding === 'utf-8') return response({ sha: 'article-blob' }, 201);
    if (path === '/git/blobs' && body.encoding === 'base64') return response({ sha: 'image-blob' }, 201);
    if (path === '/git/trees' && method === 'POST') return response({ sha: 'next-tree' }, 201);
    if (path === '/git/commits' && method === 'POST') return response({ sha: 'next-commit' }, 201);
    if (path === '/git/refs/heads/main') return conflict || collision ? response({}, 422) : response({ object: { sha: 'next-commit' } });
    throw new Error(`Unexpected request: ${method} ${path}`);
  };
  return { send, requests };
}

test('New article and image are published in one non-forced commit', async () => {
  const mock = transport();
  const api = new StudioGitHub(repository, 'test-only-credential', columns, mock.send);
  const article = draft();
  article.values.cover = 'images/uploads/test-cover.png';
  article.coverUpload = { path: article.values.cover, mime: 'image/png', content: encoded('test-image') };
  const result = await api.publish(article);
  assert.equal(result.commitSha, 'next-commit');
  const tree = mock.requests.find(item => item.path === '/git/trees' && item.method === 'POST').body;
  assert.equal(tree.base_tree, 'old-tree');
  assert.deepEqual(tree.tree.map(entry => entry.path), ['src/content/posts/a-new-song.md', 'public/images/uploads/test-cover.png']);
  assert.deepEqual(mock.requests.find(item => item.path === '/git/commits' && item.method === 'POST').body.parents, ['old-head']);
  assert.deepEqual(mock.requests.at(-1), { path: '/git/refs/heads/main', method: 'PATCH', body: { sha: 'next-commit', force: false } });
  assert.equal(mock.requests.filter(item => item.method === 'PATCH').length, 1);
});

test('Existing edits merge the current source and preserve custom metadata', async () => {
  const source = '---\ntitle: Original\ndescription: original\ndate: 2026-11-10\ncategory: 技术\ncustom: preserved\n---\n\nOriginal\n';
  const path = articlePath(values().slug);
  const mock = transport({ existing: [{ path, sha: 'original-blob', type: 'blob', mode: '100644' }], editSource: source });
  const api = new StudioGitHub(repository, 'test-only-credential', columns, mock.send);
  const article = { ...draft(), sourcePath: path, baseSha: 'original-blob' };
  await api.publish(article);
  const content = mock.requests.find(item => item.path === '/git/blobs' && item.method === 'POST').body.content;
  assert.match(content, /custom: preserved/);
  assert.equal(parseArticle(content, values().slug).title, values().title);
});

test('Stale edits and new slug collisions stop before any remote writes', async () => {
  const path = articlePath(values().slug);
  for (const article of [{ ...draft(), sourcePath: path, baseSha: 'older-blob' }, draft()]) {
    const mock = transport({ existing: [{ path, sha: 'newer-blob', type: 'blob', mode: '100644' }] });
    const api = new StudioGitHub(repository, 'test-only-credential', columns, mock.send);
    await assert.rejects(api.publish(article), RepositoryConflict);
    assert.equal(mock.requests.some(item => item.method !== 'GET'), false);
  }
});

test('Concurrent branch changes are rejected without force or automatic overwrites', async () => {
  const mock = transport({ conflict: true });
  const api = new StudioGitHub(repository, 'test-only-credential', columns, mock.send);
  await assert.rejects(api.publish(draft()), RepositoryConflict);
  assert.equal(mock.requests.filter(item => item.method === 'PATCH').length, 1);
  assert.equal(mock.requests.at(-1).body.force, false);
});

test('Invalid article and cover payloads never reach GitHub', async () => {
  let requests = 0;
  const api = new StudioGitHub(repository, 'test-only-credential', columns, async () => { requests++; throw new Error('Must not call'); });
  await assert.rejects(api.publish({ ...draft(), values: { ...values(), slug: '../outside' } }));
  await assert.rejects(api.publish({ ...draft(), coverUpload: { path: '../outside.png', mime: 'image/png', content: 'AA==' } }));
  assert.equal(requests, 0);
  api.disconnect();
  await assert.rejects(api.publish(draft()), /请先连接/);
});

test('The browser fetch API retains its native global receiver', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async function () {
      assert.equal(this, globalThis);
      return response({ tree: [], truncated: false });
    };
    const api = new StudioGitHub(repository, 'test-only-credential', columns);
    assert.deepEqual(await api.list(), []);
  } finally { globalThis.fetch = originalFetch; }
});
