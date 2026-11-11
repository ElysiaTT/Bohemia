import { articlePath, decodeBase64, isArticlePath, serializeArticle, validateArticle, validCoverPath } from './studio-content.ts';
import type { ArticleDraft } from './studio-content.ts';

export interface StudioRepository { owner: string; repo: string; branch: string }
export interface RepositoryFile { path: string; sha: string }
interface Tree { sha: string; truncated?: boolean; tree: Array<{ path: string; sha: string; type: string; mode: string }> }
type RequestFetch = (input: string, init?: RequestInit) => Promise<Response>;
export class RepositoryConflict extends Error {}

/** Credentials stay in this instance, never in drafts, URLs or browser storage. */
export class StudioGitHub {
  private token: string;
  private repository: StudioRepository;
  private transport: RequestFetch;
  private columns: Set<string>;
  constructor(repository: StudioRepository, token: string, columns: Set<string>, transport: RequestFetch = (input, init) => globalThis.fetch(input, init)) {
    this.repository = repository;
    this.token = token.trim();
    this.columns = columns;
    this.transport = transport;
  }
  disconnect() { this.token = ''; }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.token) throw new Error('请先连接 GitHub。');
    const { owner, repo } = this.repository;
    const response = await this.transport(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`, {
      method, headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000), credentials: 'omit', redirect: 'error',
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('GitHub 凭据无效或已过期，请重新连接。');
      if (response.status === 403) throw new Error('GitHub 暂未允许这次操作。请确认凭据已选择 Bohemia 仓库，并启用 Contents 的 Read and write 权限；若已启用，请稍后重试。');
      if (response.status === 409 || response.status === 422) throw new RepositoryConflict('仓库在编辑期间发生了变化。请载入最新版后合并，或下载 Markdown 备份。');
      if (response.status === 404) throw new Error('没有找到仓库或文章，请检查凭据是否可以访问 Bohemia。');
      throw new Error(`GitHub 暂时无法完成操作（${response.status}），请稍后重试。`);
    }
    return response.json() as Promise<T>;
  }
  async connect() {
    const repository = await this.request<{ permissions?: { push?: boolean }; archived?: boolean }>('');
    if (repository.archived || repository.permissions?.push !== true) throw new Error('这个 GitHub 身份没有 Bohemia 的写入权限。');
    return this.list();
  }
  async list(): Promise<RepositoryFile[]> {
    const tree = await this.request<Tree>(`/git/trees/${encodeURIComponent(this.repository.branch)}?recursive=1`);
    if (tree.truncated) throw new Error('仓库文章目录过大，无法完整载入。请通过 GitHub 编辑。');
    return tree.tree.filter(file => file.type === 'blob' && /^(100644|100755)$/.test(file.mode) && isArticlePath(file.path)).map(({ path, sha }) => ({ path, sha }));
  }
  async read(path: string) {
    if (!isArticlePath(path)) throw new Error('只能编辑博客文章目录中的 Markdown 文件。');
    const file = await this.request<{ content: string; sha: string; encoding: string }>(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(this.repository.branch)}`);
    if (file.encoding !== 'base64') throw new Error('文章超过在线编辑支持的大小。');
    return { source: decodeBase64(file.content), sha: file.sha };
  }
  async publish(draft: ArticleDraft) {
    const errors = validateArticle(draft.values, this.columns);
    if (errors.length) throw new Error(errors[0]);
    const path = articlePath(draft.values.slug);
    if (draft.sourcePath && (!isArticlePath(draft.sourcePath) || draft.sourcePath !== path || !draft.baseSha)) throw new Error('仓库文章的地址保持固定，请新建文章来使用另一个地址。');
    if (!draft.sourcePath && draft.baseSha) throw new Error('文章来源信息不完整，请重新载入。');
    const upload = draft.coverUpload;
    if (upload && (upload.path !== draft.values.cover || !upload.path.startsWith('images/uploads/') || !validCoverPath(upload.path) || !/^image\/(jpeg|png|webp|gif)$/.test(upload.mime) || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.content) || upload.content.length > 7_000_000)) throw new Error('封面图片信息不完整，请重新选择图片。');
    const branch = this.repository.branch.split('/').map(encodeURIComponent).join('/');
    const head = await this.request<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
    const commit = await this.request<{ tree: { sha: string } }>(`/git/commits/${head.object.sha}`);
    const tree = await this.request<Tree>(`/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new Error('无法完整检查仓库，本次没有发布。');
    const current = tree.tree.find(file => file.path === path);
    if (draft.sourcePath ? (!current || current.type !== 'blob' || current.sha !== draft.baseSha) : !!current) throw new RepositoryConflict('这个文章地址已存在，或文章已被其他编辑更新。请载入最新版后合并。');
    if (upload && tree.tree.some(file => file.path === `public/${upload.path}`)) throw new RepositoryConflict('封面文件已存在，请重新选择图片后发布。');
    let originalSource: string | undefined;
    if (current) {
      const blob = await this.request<{ content: string; encoding: string }>(`/git/blobs/${current.sha}`);
      if (blob.encoding !== 'base64') throw new Error('无法载入文章原文，本次没有发布。');
      originalSource = decodeBase64(blob.content);
    }
    const source = serializeArticle(draft.values, originalSource);
    const articleBlob = await this.request<{ sha: string }>('/git/blobs', 'POST', { content: source, encoding: 'utf-8' });
    const changes = [{ path, mode: '100644', type: 'blob', sha: articleBlob.sha }];
    if (upload) {
      const coverBlob = await this.request<{ sha: string }>('/git/blobs', 'POST', { content: upload.content, encoding: 'base64' });
      changes.push({ path: `public/${upload.path}`, mode: '100644', type: 'blob', sha: coverBlob.sha });
    }
    const nextTree = await this.request<{ sha: string }>('/git/trees', 'POST', { base_tree: commit.tree.sha, tree: changes });
    const nextCommit = await this.request<{ sha: string }>('/git/commits', 'POST', { message: `${current ? 'Edit' : 'Add'} article: ${draft.values.title}`, tree: nextTree.sha, parents: [head.object.sha] });
    // A concurrent branch update is rejected; article and image become visible together.
    await this.request(`/git/refs/heads/${branch}`, 'PATCH', { sha: nextCommit.sha, force: false });
    return { path, source, blobSha: articleBlob.sha, commitSha: nextCommit.sha };
  }
}
