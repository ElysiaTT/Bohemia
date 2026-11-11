import test from 'node:test';
import assert from 'node:assert/strict';
import { articlePath, decodeBase64, emptyArticle, isArticlePath, parseArticle, serializeArticle, validateArticle } from '../src/lib/studio-content.ts';
import { RepositoryConflict, StudioGitHub } from '../src/lib/studio-github.ts';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { articleHeadings } from '../scripts/article-headings.ts';
import { indexedDB as memoryIndexedDB } from 'fake-indexeddb';
import { deleteDraft, readDrafts, storeDraft } from '../src/lib/studio-storage.ts';

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
    assert.equal(init.cache, 'no-store');
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
    globalThis.fetch = async function (url) {
      assert.equal(this, globalThis);
      if (url.endsWith('/git/ref/heads/main')) return response({ object: { sha: 'old-head' } });
      if (url.endsWith('/git/commits/old-head')) return response({ tree: { sha: 'old-tree' } });
      return response({ tree: [], truncated: false });
    };
    const api = new StudioGitHub(repository, 'test-only-credential', columns);
    assert.deepEqual(await api.list(), []);
  } finally { globalThis.fetch = originalFetch; }
});

test('Deleting an article only removes the confirmed Markdown file and never its cover', async () => {
  const path = articlePath(values().slug);
  const mock = transport({ existing: [{ path, sha: 'original-blob', type: 'blob', mode: '100644' }, { path: 'public/images/shared.webp', sha: 'cover-blob', type: 'blob', mode: '100644' }] });
  const api = new StudioGitHub(repository, 'test-only-credential', columns, mock.send);
  const result = await api.deleteArticle({ path, baseSha: 'original-blob' }, values().slug);
  assert.equal(result.commitSha, 'next-commit');
  const tree = mock.requests.find(item => item.path === '/git/trees' && item.method === 'POST').body;
  assert.equal(tree.base_tree, 'old-tree');
  assert.deepEqual(tree.tree, [{ path, mode: '100644', type: 'blob', sha: null }]);
  assert.equal(mock.requests.some(item => item.path === '/git/blobs' && item.method === 'POST'), false);
  assert.deepEqual(mock.requests.at(-1).body, { sha: 'next-commit', force: false });
});

test('An incorrect deletion confirmation or out-of-scope path never reaches GitHub', async () => {
  let requests = 0;
  const api = new StudioGitHub(repository, 'test-only-credential', columns, async () => { requests++; throw new Error('Must not call'); });
  await assert.rejects(api.deleteArticle({ path: articlePath(values().slug), baseSha: 'original-blob' }, 'another-article'));
  await assert.rejects(api.deleteArticle({ path: '.github/workflows/deploy.yml', baseSha: 'original-blob' }, values().slug));
  await assert.rejects(api.deleteArticle({ path: articlePath(values().slug), baseSha: '' }, values().slug));
  await assert.rejects(api.unpublish({ path: 'public/images/shared.webp', baseSha: 'cover-blob' }));
  assert.equal(requests, 0);
});

test('Deleting or withdrawing an outdated, missing, or symlink article stops before writes', async () => {
  const path = articlePath(values().slug);
  for (const existing of [[], [{ path, sha: 'newer-blob', type: 'blob', mode: '100644' }], [{ path, sha: 'original-blob', type: 'blob', mode: '120000' }]]) {
    for (const operation of ['delete', 'unpublish']) {
      const mock = transport({ existing });
      const api = new StudioGitHub(repository, 'test-only-credential', columns, mock.send);
      const reference = { path, baseSha: 'original-blob' };
      await assert.rejects(operation === 'delete' ? api.deleteArticle(reference, values().slug) : api.unpublish(reference), RepositoryConflict);
      assert.equal(mock.requests.some(item => item.method !== 'GET'), false);
    }
  }
});

test('Withdrawing changes only the repository draft flag and preserves content and metadata', async () => {
  const path = articlePath(values().slug);
  const source = '---\n# Keep the note\ntitle: Original\ndescription: original\ndate: 2026-11-10\ncategory: 技术\ncustom: preserved\ndraft: false\ndemo: true\nfeatured: true\n---\n\n\n# Existing document\n\n## Exact body\n\n```\n---\n```\n\n';
  const mock = transport({ existing: [{ path, sha: 'original-blob', type: 'blob', mode: '100644' }], editSource: source });
  const api = new StudioGitHub(repository, 'test-only-credential', columns, mock.send);
  const result = await api.unpublish({ path, baseSha: 'original-blob' });
  assert.equal(result.changed, true);
  assert.equal(result.source.slice(result.source.indexOf('\n---\n') + 5), source.slice(source.indexOf('\n---\n') + 5));
  assert.match(result.source, /# Keep the note/);
  assert.match(result.source, /custom: preserved/);
  const original = parseArticle(source, values().slug);
  assert.deepEqual(parseArticle(result.source, values().slug), { ...original, draft: true });
  assert.deepEqual(mock.requests.at(-1).body, { sha: 'next-commit', force: false });
});

test('Withdrawing an existing repository draft is a read-only no-op', async () => {
  const path = articlePath(values().slug);
  const source = serializeArticle({ ...values(), draft: true });
  const mock = transport({ existing: [{ path, sha: 'original-blob', type: 'blob', mode: '100644' }], editSource: source });
  const api = new StudioGitHub(repository, 'test-only-credential', columns, mock.send);
  const result = await api.unpublish({ path, baseSha: 'original-blob' });
  assert.equal(result.changed, false);
  assert.equal(result.source, source);
  assert.equal(mock.requests.some(item => item.method !== 'GET'), false);
});

test('Concurrent branch changes reject deletion and withdrawal without forcing the branch', async () => {
  const path = articlePath(values().slug);
  for (const operation of ['delete', 'unpublish']) {
    const mock = transport({ conflict: true, existing: [{ path, sha: 'original-blob', type: 'blob', mode: '100644' }], editSource: serializeArticle(values()) });
    const api = new StudioGitHub(repository, 'test-only-credential', columns, mock.send);
    const reference = { path, baseSha: 'original-blob' };
    await assert.rejects(operation === 'delete' ? api.deleteArticle(reference, values().slug) : api.unpublish(reference), RepositoryConflict);
    assert.equal(mock.requests.filter(item => item.method === 'PATCH').length, 1);
    assert.equal(mock.requests.at(-1).body.force, false);
  }
});

test('Removing a local draft preserves other drafts and clears the last-draft pointer', async () => {
  const originalIndexedDB = globalThis.indexedDB;
  try {
    globalThis.indexedDB = memoryIndexedDB;
    const first = { ...draft(), id: 'local:first' };
    const second = { ...draft(), id: 'local:second' };
    await storeDraft(first); await storeDraft(second);
    await deleteDraft(first.id);
    const afterFirst = await readDrafts();
    assert.deepEqual(afterFirst.drafts.map(item => item.id), [second.id]);
    assert.equal(afterFirst.last, second.id);
    await deleteDraft(second.id);
    const afterSecond = await readDrafts();
    assert.deepEqual(afterSecond.drafts, []);
    assert.equal(afterSecond.last, undefined);
    await deleteDraft('local:missing');
    assert.deepEqual((await readDrafts()).drafts, []);
  } finally { globalThis.indexedDB = originalIndexedDB; }
});

test('Reading and listing articles resolve the branch to immutable commit and tree IDs', async () => {
  const calls = [];
  const path = articlePath(values().slug);
  const source = serializeArticle(values());
  const api = new StudioGitHub(repository, 'test-only-credential', columns, async (url, init) => {
    const parsed = new URL(url); calls.push(parsed.pathname + parsed.search);
    assert.equal(init.cache, 'no-store');
    if (parsed.pathname.endsWith('/git/ref/heads/main')) return response({ object: { sha: 'fresh-head' } });
    if (parsed.pathname.endsWith('/git/commits/fresh-head')) return response({ tree: { sha: 'fresh-tree' } });
    if (parsed.pathname.endsWith('/git/trees/fresh-tree')) return response({ tree: [{ path, sha: 'fresh-blob', type: 'blob', mode: '100644' }] });
    if (parsed.pathname.endsWith(`/contents/${path}`)) { assert.equal(parsed.searchParams.get('ref'), 'fresh-head'); return response({ encoding: 'base64', content: encoded(source), sha: 'fresh-blob' }); }
    throw new Error('Unexpected mutable content request');
  });
  assert.deepEqual(await api.list(), [{ path, sha: 'fresh-blob' }]);
  assert.deepEqual(await api.read(path), { source, sha: 'fresh-blob' });
  assert.ok(calls.some(url => url.endsWith('/git/trees/fresh-tree?recursive=1')));
  assert.equal(calls.some(url => url.includes('/git/trees/main') || url.endsWith('?ref=main')), false);
});
