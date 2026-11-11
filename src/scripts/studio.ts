import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { articlePath, emptyArticle, parseArticle, serializeArticle, validateArticle, validCoverPath } from '../lib/studio-content';
import type { ArticleDraft, ArticleValues, PublishedArticle } from '../lib/studio-content';
import { StudioGitHub } from '../lib/studio-github';
import type { RepositoryFile, StudioRepository } from '../lib/studio-github';
import { deleteDraft, readDrafts, storeDraft } from '../lib/studio-storage';
import { articleHeadingDepth } from '../lib/article-headings';

type Configuration = { repository: StudioRepository; base: string; index: string; columns: Array<{ slug: string; title: string; side: string }> };
const configuration = JSON.parse(document.querySelector('#studio-config')!.textContent!) as Configuration;
const columns = new Set(configuration.columns.map(column => column.slug));
const room = document.querySelector<HTMLElement>('#writing-room')!;
const form = document.querySelector<HTMLFormElement>('#studio-form')!;
const fieldset = document.querySelector<HTMLFieldSetElement>('#studio-fields')!;
const library = document.querySelector<HTMLElement>('#studio-library-list')!;
const librarySearch = document.querySelector<HTMLInputElement>('#studio-library-search')!;
const authDialog = document.querySelector<HTMLDialogElement>('#studio-auth')!;
const tokenField = document.querySelector<HTMLInputElement>('#studio-token')!;
const authStatus = document.querySelector<HTMLElement>('#studio-auth-status')!;
const saveState = document.querySelector<HTMLElement>('#studio-save-state')!;
const publishButton = document.querySelector<HTMLButtonElement>('#studio-publish')!;
const bodyField = document.querySelector<HTMLTextAreaElement>('#studio-body')!;
const previewBody = document.querySelector<HTMLElement>('#studio-preview-body')!;
const snapshotPosts = new Map<string, PublishedArticle>();
const drafts = new Map<string, ArticleDraft>();
const remoteTitles = new Map<string, string>();
const repositoryValues = new Map<string, ArticleValues>();
const deletedPaths = new Set<string>();
const management = document.querySelector<HTMLDetailsElement>('#studio-management')!;
const confirmDialog = document.querySelector<HTMLDialogElement>('#studio-confirm')!;
const confirmInput = document.querySelector<HTMLInputElement>('#studio-confirm-input')!;
const confirmSubmit = document.querySelector<HTMLButtonElement>('#studio-confirm-submit')!;
const confirmCancel = document.querySelector<HTMLButtonElement>('#studio-confirm-cancel')!;
type ManagementAction = 'unpublish' | 'delete-article' | 'delete-draft';
let pendingManagement: { action: ManagementAction; id: string; path?: string; baseSha?: string; slug: string } | undefined;
let remoteFiles: RepositoryFile[] = [];
let client: StudioGitHub | undefined;
let current = newDraft();
let libraryMode = 'posts';
let changed = false;
let busy = false;
let unsaved = false;
let revision = 0;
let saveQueue: Promise<void> = Promise.resolve();
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let loadVersion = 0;
let authVersion = 0;

function newDraft(): ArticleDraft { return { id: `local:${crypto.randomUUID()}`, values: emptyArticle(), savedAt: new Date().toISOString() }; }
function field(name: string) { return form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; }
function makeText(tag: string, text: string, className?: string) {
  const element = document.createElement(tag); element.textContent = text;
  if (className) element.className = className;
  return element;
}
function announce(text: string, links: Array<{ text: string; url: string }> = []) {
  document.querySelector<HTMLElement>('#studio-message')!.hidden = false;
  document.querySelector('#studio-message-text')!.textContent = text;
  const target = document.querySelector('#studio-message-links')!;
  target.replaceChildren(...links.map(({ text, url }) => {
    const link = document.createElement('a'); link.textContent = text; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  }));
}
function collect(): ArticleValues {
  const value = (name: string) => field(name).value;
  const checked = (name: string) => (field(name) as HTMLInputElement).checked;
  return { slug: value('slug').trim(), title: value('title'), description: value('description'), date: value('date'), category: value('category'), column: value('column'), tags: [...new Set(value('tags').split(/[,，]/).map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))], cover: value('cover').trim(), coverAlt: value('coverAlt'), body: value('body'), draft: checked('draft'), demo: checked('demo'), featured: checked('featured') };
}
function setPublishLabel() {
  publishButton.replaceChildren(document.createTextNode(current.values.draft ? '保存仓库草稿 ' : '发布到博客 '), makeText('span', '↗'));
  publishButton.lastElementChild?.setAttribute('aria-hidden', 'true');
}
function setArticleQuery(slug?: string) {
  const url = new URL(location.href);
  if (slug) url.searchParams.set('post', slug); else url.searchParams.delete('post');
  history.replaceState(null, '', url);
}
function renderManagement() {
  const source = current.sourcePath;
  if (source && current.originalSource && !repositoryValues.has(source)) {
    try { repositoryValues.set(source, parseArticle(current.originalSource, source.slice('src/content/posts/'.length, -3))); } catch { /* An unreadable local backup never changes the repository. */ }
  }
  const known = source ? repositoryValues.get(source) : undefined;
  const status = document.querySelector<HTMLElement>('#studio-document-status')!;
  status.textContent = !source ? '本机草稿' : !known ? '仓库文章' : known.draft ? '仓库草稿' : known.demo ? '已发布 · 示例' : '已发布';
  status.dataset.state = !source ? 'local' : known?.draft ? 'draft' : 'published';
  document.querySelector('#studio-document-hint')!.textContent = source ? client ? '修改先保存在本机，发布后更新博客。' : '连接 GitHub 后可发布、撤下或删除。' : '先写下来，再决定何时发布。';
  document.querySelector<HTMLElement>('#studio-unpublish')!.hidden = !source || known?.draft === true;
  document.querySelector<HTMLElement>('#studio-republish')!.hidden = !source || known?.draft !== true;
  document.querySelector<HTMLElement>('#studio-delete-article')!.hidden = !source;
  document.querySelector<HTMLButtonElement>('#studio-delete-draft')!.disabled = !drafts.has(current.id);
  const view = document.querySelector<HTMLAnchorElement>('#studio-open-article')!;
  view.hidden = !source || known?.draft === true;
  if (source) view.href = `${configuration.base}posts/${source.slice('src/content/posts/'.length, -3)}/`;
}
function setBusy(value: boolean) {
  busy = value; fieldset.disabled = value; publishButton.disabled = value;
  document.querySelector('.studio-library')!.toggleAttribute('inert', value);
  document.querySelector('.studio-document-bar')!.toggleAttribute('inert', value);
  for (const selector of ['#studio-export', '#studio-save', '#studio-connect', '#studio-reload']) document.querySelector<HTMLButtonElement>(selector)!.disabled = value;
}
function deploymentLinks(commitSha: string) {
  const repository = `https://github.com/${configuration.repository.owner}/${configuration.repository.repo}`;
  return [{ text: '查看这次提交 ↗', url: `${repository}/commit/${commitSha}` }, { text: '查看发布进度 ↗', url: `${repository}/actions?query=branch%3A${encodeURIComponent(configuration.repository.branch)}` }];
}
function populate() {
  document.querySelector<HTMLElement>('#studio-message')!.hidden = true;
  for (const [name, value] of Object.entries(current.values)) {
    const target = field(name);
    if (!target) continue;
    if (typeof value === 'boolean') (target as HTMLInputElement).checked = value;
    else target.value = Array.isArray(value) ? value.join('，') : value;
  }
  (field('slug') as HTMLInputElement).readOnly = !!current.sourcePath;
  document.querySelector('#studio-slug-hint')!.textContent = current.sourcePath ? '这篇文章的地址已固定，编辑内容不会改变原有链接。' : '小写英文、数字和短横线；发布后地址固定。';
  document.querySelector<HTMLElement>('#studio-reload')!.hidden = !current.sourcePath || !client;
  changed = false; unsaved = false; revision++;
  setPublishLabel(); renderPreview(); renderLibrary();
}
function localForPath(path: string) { return [...drafts.values()].filter(draft => draft.sourcePath === path).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0]; }
function renderLibrary() {
  renderManagement();
  document.querySelector('#studio-post-count')!.textContent = String(client ? remoteFiles.length : [...snapshotPosts.keys()].filter(path => !deletedPaths.has(path)).length);
  document.querySelector('#studio-draft-count')!.textContent = String(drafts.size);
  const term = librarySearch.value.trim().toLocaleLowerCase();
  const items = libraryMode === 'drafts'
    ? [...drafts.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).map(draft => ({ id: draft.id, path: draft.sourcePath, title: draft.values.title || '未命名的作品', note: `${new Date(draft.savedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · 本机草稿`, demo: draft.values.demo, draft }))
    : (client ? remoteFiles : [...snapshotPosts.values()].map(post => ({ path: post.path, sha: post.sha }))).filter(file => !deletedPaths.has(file.path)).map(file => {
      const values = repositoryValues.get(file.path);
      const title = remoteTitles.get(file.path) || values?.title || file.path.slice('src/content/posts/'.length, -3);
      return { id: file.path, path: file.path, title, note: values ? `${values.draft ? '仓库草稿' : '已发布'} · ${values.date} · ${values.category}` : '仓库文章 · 点击载入', demo: values?.demo || false, draft: undefined };
    });
  const filtered = items.filter(item => `${item.title} ${item.path || ''}`.toLocaleLowerCase().includes(term));
  library.replaceChildren();
  if (!filtered.length) { library.append(makeText('p', term ? '没有找到这段文字，换个关键词试试。' : libraryMode === 'drafts' ? '还没有本机草稿。写下的文字会自动保存在这里。' : '还没有文章，写下第一篇吧。', 'studio-library-empty')); return; }
  for (const item of filtered) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'studio-library-item';
    if (item.id === current.id || (libraryMode === 'posts' && item.path === current.sourcePath)) button.setAttribute('aria-current', 'true');
    button.append(makeText('strong', item.title));
    const note = makeText('span', item.note);
    if (item.demo) note.prepend(makeText('small', '示例'));
    button.append(note);
    button.addEventListener('click', async () => {
      if (busy) return;
      await saveIfChanged();
      if (item.draft) { loadVersion++; current = structuredClone(item.draft); setArticleQuery(); populate(); saveState.textContent = '已恢复本机草稿。'; }
      else if (item.path) await openPost(item.path);
    });
    library.append(button);
  }
}
async function saveCurrent() {
  current.values = collect(); current.savedAt = new Date().toISOString();
  const copy = structuredClone(current); const version = ++revision;
  drafts.set(copy.id, copy); renderLibrary();
  unsaved = true; saveState.textContent = '正在保存本机草稿…';
  const operation = saveQueue.then(() => storeDraft(copy));
  saveQueue = operation.then(() => {
    if (version === revision && current.id === copy.id) { unsaved = false; saveState.textContent = `已保存至本机 · ${new Date(copy.savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`; }
  }).catch(() => { if (version === revision) { unsaved = true; saveState.textContent = '本机保存失败，请导出 Markdown 备份。'; } });
  return saveQueue;
}
async function saveIfChanged() { if (changed) await saveCurrent(); else await saveQueue; }

function previewImageUrl() {
  if (current.coverUpload && current.coverUpload.path === current.values.cover) return `data:${current.coverUpload.mime};base64,${current.coverUpload.content}`;
  return current.values.cover && validCoverPath(current.values.cover) ? `${configuration.base}${current.values.cover}` : '';
}
function renderPreview() {
  const values = current.values;
  document.querySelector('#studio-preview-title')!.textContent = values.title || '未命名的作品';
  document.querySelector('#studio-preview-description')!.textContent = values.description || '给读者留一句关于这篇文章的介绍。';
  const column = configuration.columns.find(column => column.slug === values.column);
  document.querySelector('#studio-preview-meta')!.textContent = [values.draft ? '仓库草稿' : values.demo ? '示例文章' : '', values.category, column?.title, values.date].filter(Boolean).join(' / ');
  document.querySelector('#studio-word-count')!.textContent = `${values.body.replace(/\s/g, '').length.toLocaleString('zh-CN')} 字`;
  const coverUrl = previewImageUrl();
  const thumbnail = document.querySelector<HTMLImageElement>('#studio-cover-thumbnail')!;
  const cover = document.querySelector<HTMLImageElement>('#studio-preview-cover')!;
  for (const image of [thumbnail, cover]) {
    image.hidden = !coverUrl;
    if (coverUrl) { if (image.getAttribute('src') !== coverUrl) image.src = coverUrl; image.alt = values.coverAlt; }
    else image.removeAttribute('src');
  }
  document.querySelector<HTMLElement>('#studio-cover-placeholder')!.hidden = !!coverUrl;
  if (!values.body.trim()) { previewBody.replaceChildren(makeText('p', '你的文字，会在这里慢慢成形。', 'studio-preview-empty')); return; }
  const html = marked.parse(values.body, { async: false, gfm: true });
  previewBody.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'], FORBID_ATTR: ['style', 'srcset', 'id', 'name'], SANITIZE_NAMED_PROPS: true });
  if (previewBody.querySelector('h1')) previewBody.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(heading => {
    const normalized = document.createElement(`h${articleHeadingDepth(Number(heading.tagName[1]), true)}`);
    normalized.append(...heading.childNodes);
    heading.replaceWith(normalized);
  });
  previewBody.querySelectorAll<HTMLAnchorElement>('a').forEach(link => { link.target = '_blank'; link.rel = 'noopener noreferrer'; });
  previewBody.querySelectorAll<HTMLImageElement>('img').forEach(image => { const source = image.getAttribute('src') || ''; if (source.startsWith('images/')) image.src = `${configuration.base}${source}`; image.loading = 'lazy'; });
}

async function openPost(path: string, fresh = false) {
  const version = ++loadVersion;
  const local = localForPath(path);
  if (local && !fresh) { current = structuredClone(local); setArticleQuery(current.values.slug); populate(); saveState.textContent = '已恢复这篇文章的本机草稿。'; return; }
  if (fresh && !client) { authDialog.showModal(); return; }
  saveState.textContent = '正在载入文章…';
  try {
    let next: ArticleDraft;
    if (client) {
      const file = await client.read(path);
      next = { id: `post:${path}`, sourcePath: path, baseSha: file.sha, originalSource: file.source, values: parseArticle(file.source, path.slice('src/content/posts/'.length, -3)), savedAt: new Date().toISOString() };
    } else {
      const post = snapshotPosts.get(path);
      if (!post) throw new Error('请连接 GitHub 后载入这篇文章。');
      next = { id: `post:${path}`, sourcePath: path, baseSha: post.sha, values: structuredClone(post.values), savedAt: new Date().toISOString() };
    }
    if (version !== loadVersion) return;
    if (fresh && local) {
      const backup = structuredClone(local); backup.id = `backup:${crypto.randomUUID()}`; backup.savedAt = new Date().toISOString();
      drafts.set(backup.id, backup); await storeDraft(backup);
    }
    if (version !== loadVersion) return;
    current = next; setArticleQuery(current.values.slug); remoteTitles.set(path, next.values.title); repositoryValues.set(path, structuredClone(next.values)); populate();
    if (fresh) { await saveCurrent(); announce('已载入仓库最新版。之前的本机版本已另存为草稿，可以在左侧切换查看。'); }
    else saveState.textContent = '已载入文章，编辑后会自动保存到本机。';
  } catch (error) { if (version === loadVersion) { saveState.textContent = '未能载入文章，当前文字保持不变。'; announce(error instanceof Error ? error.message : '文章载入失败，请稍后重试。'); } }
}

form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', event => {
  loadVersion++;
  current.values = collect(); changed = true;
  if (event.target === field('cover') && current.coverUpload?.path !== current.values.cover) delete current.coverUpload;
  setPublishLabel();
  clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, event.target === bodyField ? 120 : 0);
  void saveCurrent();
});
document.querySelector('#studio-new')!.addEventListener('click', async () => {
  if (busy) return;
  loadVersion++; await saveIfChanged(); current = newDraft(); setArticleQuery(); populate(); saveState.textContent = '新的一页，等你落笔。'; field('title').focus();
});
document.querySelector('#studio-save')!.addEventListener('click', () => { changed = true; void saveCurrent(); });
librarySearch.addEventListener('input', renderLibrary);
document.querySelectorAll<HTMLButtonElement>('[data-library]').forEach(button => button.addEventListener('click', () => {
  libraryMode = button.dataset.library!;
  document.querySelectorAll('[data-library]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  renderLibrary();
}));
function setView(view: string) {
  room.dataset.view = view;
  document.querySelectorAll('.studio-view-controls [data-view]').forEach(button => button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.view === view)));
  renderPreview();
}
document.querySelectorAll<HTMLButtonElement>('.studio-view-controls [data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view!)));
if (matchMedia('(max-width: 600px)').matches) setView('edit');
matchMedia('(max-width: 600px)').addEventListener('change', event => { if (event.matches && room.dataset.view === 'split') setView('edit'); });
document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  const selection = bodyField.value.slice(bodyField.selectionStart, bodyField.selectionEnd);
  const formats: Record<string, string> = { heading: `\n## ${selection || '小标题'}\n`, bold: `**${selection || '重点文字'}**`, quote: `\n> ${(selection || '留下这段话。').replaceAll('\n', '\n> ')}\n`, link: `[${selection || '链接文字'}](https://)`, image: `\n![${selection || '图片说明'}](${current.values.cover || 'images/your-image.webp'})\n`, code: `\n\`\`\`\n${selection || '在这里写代码'}\n\`\`\`\n` };
  bodyField.setRangeText(formats[button.dataset.format!] || '', bodyField.selectionStart, bodyField.selectionEnd, 'end');
  bodyField.focus(); bodyField.dispatchEvent(new Event('input', { bubbles: true }));
}));
document.querySelector<HTMLInputElement>('#studio-cover-file')!.addEventListener('change', async event => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0]; if (!file) return;
  const targetId = current.id;
  try {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('请选择 JPG、PNG、WebP 或 GIF 图片。');
    if (file.size > 5 * 1024 * 1024) throw new Error('封面最多支持 5 MB，请缩小图片后重试。');
    const image = await createImageBitmap(file); image.close();
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败，请重新选择。')); reader.readAsDataURL(file); });
    if (current.id !== targetId || busy) return;
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `images/uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
    current.coverUpload = { path, mime: file.type, content: dataUrl.slice(dataUrl.indexOf(',') + 1) };
    field('cover').value = path; current.values = collect(); changed = true;
    renderPreview(); await saveCurrent();
  } catch (error) { announce(error instanceof Error ? error.message : '无法读取这张图片，请重新选择。'); }
  input.value = '';
});
for (const selector of ['#studio-cover-thumbnail', '#studio-preview-cover']) document.querySelector<HTMLImageElement>(selector)!.addEventListener('error', event => {
  (event.currentTarget as HTMLImageElement).hidden = true;
  document.querySelector<HTMLElement>('#studio-cover-placeholder')!.hidden = false;
});

document.querySelector('#studio-export')!.addEventListener('click', async () => {
  await saveCurrent();
  try {
    const source = serializeArticle(current.values, current.originalSource);
    const blob = new Blob([source], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${(current.values.slug || 'bohemia-draft').replaceAll('/', '-')}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(current.coverUpload ? 'Markdown 已下载。新选择的封面仍保存在本机草稿中，会在发布时一起上传。' : 'Markdown 已下载，你也可以继续在这里编辑和发布。');
  } catch { announce('Markdown 导出失败，请复制正文备份。'); }
});
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!busy) void saveCurrent(); } });
addEventListener('beforeunload', event => { if (unsaved || busy) event.preventDefault(); });

function updateConnection() {
  const connected = !!client;
  document.querySelector<HTMLElement>('#studio-connect')!.dataset.connected = String(connected);
  document.querySelector('#studio-connection-label')!.textContent = connected ? 'GitHub 已连接' : '连接 GitHub';
  document.querySelector<HTMLElement>('#studio-auth-form')!.hidden = connected;
  document.querySelector<HTMLElement>('#studio-auth-connected')!.hidden = !connected;
  document.querySelector<HTMLElement>('#studio-library-note')!.textContent = connected ? '已连接仓库，文章与仓库草稿都可以载入。文字会先自动保存到本机。' : '未连接时可编辑已公开文章；连接后也能载入仓库草稿。';
  document.querySelector<HTMLElement>('#studio-reload')!.hidden = !connected || !current.sourcePath;
  renderLibrary();
}
document.querySelector('#studio-connect')!.addEventListener('click', () => { if (!busy) { authDialog.showModal(); if (!client) tokenField.focus(); } });
document.querySelector('#studio-auth-close')!.addEventListener('click', () => authDialog.close());
authDialog.addEventListener('close', () => { tokenField.value = ''; authVersion++; });
document.querySelector('#studio-auth-form')!.addEventListener('submit', async event => {
  event.preventDefault();
  const token = tokenField.value.trim(); if (!token) return;
  const version = ++authVersion;
  const button = document.querySelector<HTMLButtonElement>('#studio-auth-submit')!;
  button.disabled = true; tokenField.value = ''; authStatus.textContent = '正在连接 GitHub…';
  const candidate = new StudioGitHub(configuration.repository, token, columns);
  try {
    const files = await candidate.connect();
    if (version !== authVersion) { candidate.disconnect(); return; }
    client?.disconnect(); client = candidate; remoteFiles = files;
    updateConnection(); authStatus.textContent = ''; authDialog.close();
    announce('GitHub 已连接。可以载入已有文章，或点击“发布到博客”提交当前文字。');
  } catch (error) { candidate.disconnect(); if (version === authVersion) authStatus.textContent = error instanceof Error && !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name) ? error.message : '暂时无法连接 GitHub，请检查网络后重试。'; }
  finally { button.disabled = false; }
});
document.querySelector('#studio-disconnect')!.addEventListener('click', () => { client?.disconnect(); client = undefined; remoteFiles = []; updateConnection(); authStatus.textContent = '已断开连接，本机草稿仍然保留。'; });
document.querySelector('#studio-sync')!.addEventListener('click', async () => {
  if (!client) return;
  authStatus.textContent = '正在同步文章列表…';
  try { remoteFiles = await client.list(); renderLibrary(); authStatus.textContent = '文章列表已同步。'; }
  catch (error) { authStatus.textContent = error instanceof Error ? error.message : '同步失败，请稍后重试。'; }
});
document.querySelector('#studio-reload')!.addEventListener('click', async () => { if (busy || !current.sourcePath) return; await saveIfChanged(); await openPost(current.sourcePath, true); });

publishButton.addEventListener('click', async () => {
  if (busy) return;
  current.values = collect();
  const errors = validateArticle(current.values, columns);
  if (errors.length) { announce(errors.join(' ')); form.reportValidity(); return; }
  if (!client) { await saveCurrent(); authDialog.showModal(); tokenField.focus(); return; }
  setBusy(true);
  saveState.textContent = '正在提交文章与封面…';
  try {
    await saveCurrent();
    const result = await client.publish(structuredClone(current));
    current.sourcePath = result.path; current.baseSha = result.blobSha; current.originalSource = result.source;
    deletedPaths.delete(result.path); repositoryValues.set(result.path, structuredClone(current.values));
    snapshotPosts.set(result.path, { path: result.path, sha: result.blobSha, values: structuredClone(current.values) });
    delete current.coverUpload; remoteTitles.set(result.path, current.values.title);
    remoteFiles = [{ path: result.path, sha: result.blobSha }, ...remoteFiles.filter(file => file.path !== result.path)];
    (field('slug') as HTMLInputElement).readOnly = true;
    document.querySelector('#studio-slug-hint')!.textContent = '这篇文章的地址已固定，编辑内容不会改变原有链接。';
    document.querySelector<HTMLElement>('#studio-reload')!.hidden = false;
    await saveCurrent(); renderLibrary();
    const links = deploymentLinks(result.commitSha);
    if (!current.values.draft) links.push({ text: '打开文章（部署后生效）↗', url: `${location.origin}${configuration.base}posts/${current.values.slug}/` });
    announce(current.values.draft ? '仓库草稿已保存，未显示在博客。以后连接 GitHub 后可以从文章库继续编辑。' : '文章与封面已一起提交到 GitHub，博客正在自动部署。部署完成后，专栏、搜索和 RSS 会随之更新。', links);
  } catch (error) {
    const retained = unsaved ? '当前文字仍在页面中，请导出 Markdown 备份。' : '本机草稿已保留。';
    saveState.textContent = retained;
    announce((error instanceof Error && !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name) ? error.message : '连接中断，提交结果还未确认。请先查看 GitHub 的文章或提交记录，再重试。') + ' ' + retained);
  } finally {
    setBusy(false);
    setPublishLabel();
  }
});

async function requestManagement(action: ManagementAction) {
  if (busy) return;
  const id = current.id;
  management.open = false;
  if (action !== 'delete-draft' && !client) { authDialog.showModal(); tokenField.focus(); return; }
  await saveIfChanged();
  if (current.id !== id || busy) return;
  if (action === 'delete-draft' && !drafts.has(id)) { announce('这是一张新的空白页，还没有可移除的本机草稿。'); return; }
  if (action !== 'delete-draft' && (!current.sourcePath || !current.baseSha)) { announce('请先从左侧载入要管理的仓库文章。'); return; }
  const slug = current.sourcePath ? current.sourcePath.slice('src/content/posts/'.length, -3) : current.values.slug;
  pendingManagement = { action, id, path: current.sourcePath, baseSha: current.baseSha, slug };
  const copy = {
    unpublish: { title: '从博客撤下这篇文章？', description: '将已提交的文章改为仓库草稿。部署完成后，它会从博客、专栏、搜索和 RSS 中移除；之后可以再次发布。', note: '只修改仓库版本的发布状态，本机尚未发布的修改继续保留。公开仓库中的草稿文件仍可在 GitHub 查看。', submit: '确认撤下' },
    'delete-article': { title: '删除这篇仓库文章？', description: '将文章文件从仓库当前版本移除。部署完成后，原文章链接将失效，博客中的相关入口也会移除。', note: '图片与 Git 历史保留；本机草稿保留为可编辑备份。仅想暂时隐藏文章时，可以取消并选择“从博客撤下”。', submit: '确认删除文章' },
    'delete-draft': { title: '移除这份本机草稿？', description: '将当前草稿及尚未上传的封面从这个浏览器中移除。此操作无法从写作台撤销，可先取消并导出 Markdown。', note: '只清理这一份本机草稿，GitHub 仓库中的文章与图片保持原样。', submit: '移除本机草稿' },
  }[action];
  document.querySelector('#studio-confirm-title')!.textContent = copy.title;
  document.querySelector('#studio-confirm-article')!.textContent = `${current.values.title || '未命名的作品'}${slug ? ` / ${slug}` : ''}`;
  document.querySelector('#studio-confirm-description')!.textContent = copy.description;
  document.querySelector('#studio-confirm-note')!.textContent = copy.note;
  document.querySelector('#studio-confirm-status')!.textContent = '';
  document.querySelector('#studio-confirm-slug')!.textContent = slug;
  document.querySelector<HTMLElement>('#studio-confirm-input-wrap')!.hidden = action !== 'delete-article';
  confirmInput.value = ''; confirmSubmit.textContent = copy.submit;
  confirmSubmit.classList.toggle('studio-danger', action === 'delete-article');
  confirmSubmit.disabled = action === 'delete-article';
  confirmDialog.showModal(); confirmCancel.focus();
}
for (const action of ['unpublish', 'delete-article', 'delete-draft'] as const) document.querySelector(`#studio-${action}`)!.addEventListener('click', () => { void requestManagement(action); });
document.querySelector('#studio-republish')!.addEventListener('click', () => {
  if (busy) return;
  management.open = false;
  (field('draft') as HTMLInputElement).checked = false;
  field('draft').dispatchEvent(new Event('input', { bubbles: true }));
  publishButton.click();
});
confirmInput.addEventListener('input', () => { if (!busy) confirmSubmit.disabled = pendingManagement?.action === 'delete-article' && confirmInput.value.trim() !== pendingManagement.slug; });
confirmCancel.addEventListener('click', () => { if (!busy) confirmDialog.close(); });
confirmDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
confirmDialog.addEventListener('close', () => { pendingManagement = undefined; confirmInput.value = ''; });
document.querySelector('#studio-confirm-form')!.addEventListener('submit', async event => {
  event.preventDefault();
  const target = pendingManagement;
  if (busy || !target || target.id !== current.id) return;
  if (target.action === 'delete-article' && confirmInput.value.trim() !== target.slug) return;
  setBusy(true); loadVersion++; confirmSubmit.disabled = true; confirmCancel.disabled = true; confirmInput.disabled = true;
  const status = document.querySelector('#studio-confirm-status')!;
  status.textContent = '正在处理，请稍候…';
  try {
    await saveQueue;
    if (target.action === 'delete-draft') {
      await deleteDraft(target.id); drafts.delete(target.id);
      current = newDraft(); setArticleQuery(); populate();
      saveState.textContent = '本机草稿已移除。';
      confirmDialog.close(); announce('已移除这份本机草稿，仓库内容保持原样。');
    } else {
      if (!client || current.sourcePath !== target.path || current.baseSha !== target.baseSha) throw new Error('文章或 GitHub 连接已改变，请关闭弹窗后重新确认。');
      await saveCurrent();
      if (unsaved) throw new Error('本机备份尚未保存成功，请先导出 Markdown，再重试管理操作。');
      const reference = { path: target.path!, baseSha: target.baseSha! };
      if (target.action === 'unpublish') {
        const result = await client.unpublish(reference);
        const values = parseArticle(result.source, target.slug);
        repositoryValues.set(result.path, values);
        snapshotPosts.set(result.path, { path: result.path, sha: result.blobSha, values: structuredClone(values) });
        current.baseSha = result.blobSha; current.originalSource = result.source; current.values.draft = true;
        (field('draft') as HTMLInputElement).checked = true;
        remoteFiles = remoteFiles.map(file => file.path === result.path ? { path: file.path, sha: result.blobSha } : file);
        setPublishLabel(); renderPreview(); await saveCurrent();
        confirmDialog.close();
        announce(result.changed ? '已提交撤下操作。部署完成后文章将不再显示在博客；可在写作台中继续编辑，取消“仅作为仓库草稿”后重新发布。' : '这篇文章已是仓库草稿，本次无需再次修改。', deploymentLinks(result.commitSha));
      } else {
        const result = await client.deleteArticle(reference, confirmInput.value);
        deletedPaths.add(result.path); snapshotPosts.delete(result.path); repositoryValues.delete(result.path); remoteTitles.delete(result.path);
        remoteFiles = remoteFiles.filter(file => file.path !== result.path);
        const copies = [...drafts.values()].filter(draft => draft.sourcePath === result.path).map(draft => {
          const copy = structuredClone(draft); delete copy.sourcePath; delete copy.baseSha;
          copy.savedAt = new Date().toISOString(); drafts.set(copy.id, copy); return copy;
        });
        const backup = copies.find(draft => draft.id === current.id)!;
        const storage = await Promise.allSettled(copies.filter(draft => draft.id !== current.id).map(storeDraft));
        current = backup; setArticleQuery(); populate(); await saveCurrent();
        confirmDialog.close();
        announce(`文章已从仓库当前版本删除，正在自动部署。本机草稿已保留，图片和 Git 历史仍在。${storage.some(result => result.status === 'rejected') || unsaved ? '部分本机备份信息未能更新，请导出 Markdown 备份。' : ''}`, deploymentLinks(result.commitSha));
      }
    }
  } catch (error) {
    status.textContent = error instanceof Error && !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name) ? error.message : '连接中断，操作结果尚未确认。请先查看 GitHub 提交记录，再重试；本机文字仍保留。';
  } finally {
    setBusy(false); confirmCancel.disabled = false; confirmInput.disabled = false;
    confirmSubmit.disabled = target.action === 'delete-article' && confirmInput.value.trim() !== target.slug;
    renderLibrary();
  }
});

async function initialize() {
  populate();
  const results = await Promise.allSettled([
    fetch(configuration.index, { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error('文章列表暂时无法载入。'); return response.json() as Promise<PublishedArticle[]>; }),
    readDrafts(),
  ]);
  const postsResult = results[0]; const draftsResult = results[1];
  if (postsResult.status === 'fulfilled') for (const post of postsResult.value) { snapshotPosts.set(post.path, post); repositoryValues.set(post.path, structuredClone(post.values)); }
  else announce('已公开的文章列表暂时没有载入。你仍可以新建文章，或连接 GitHub 同步。');
  if (draftsResult.status === 'fulfilled') {
    for (const draft of draftsResult.value.drafts) drafts.set(draft.id, draft);
    const last = draftsResult.value.last && drafts.get(draftsResult.value.last);
    if (last && !changed) { current = structuredClone(last); populate(); saveState.textContent = '已恢复上次的本机草稿。'; }
  } else saveState.textContent = '当前浏览器无法保存草稿，请使用导出 Markdown 备份。';
  renderLibrary();
  const requested = new URLSearchParams(location.search).get('post');
  if (requested && !changed) { try { const path = articlePath(requested); if (snapshotPosts.has(path)) await openPost(path); } catch { /* Unknown article URLs do not change the current draft. */ } }
}
void initialize();
