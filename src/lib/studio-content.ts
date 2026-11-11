import { Document, isMap, parseDocument } from 'yaml';

export const ARTICLE_DIRECTORY = 'src/content/posts';
export const articleCategories = ['技术', '设计', '生活', '随想'] as const;
export interface ArticleValues {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  column: string;
  tags: string[];
  cover: string;
  coverAlt: string;
  body: string;
  draft: boolean;
  demo: boolean;
  featured: boolean;
}
export interface CoverUpload { path: string; content: string; mime: string }
export interface ArticleDraft {
  id: string;
  values: ArticleValues;
  sourcePath?: string;
  baseSha?: string;
  originalSource?: string;
  coverUpload?: CoverUpload;
  savedAt: string;
}
export interface PublishedArticle { values: ArticleValues; path: string; sha: string }

export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const emptyArticle = (): ArticleValues => ({ slug: '', title: '', description: '', date: localDate(), category: '随想', column: '', tags: [], cover: '', coverAlt: '', body: '', draft: false, demo: false, featured: false });
export const validSlug = (slug: string) => slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(slug);
export const articlePath = (slug: string) => {
  if (!validSlug(slug)) throw new Error('文章地址请使用小写英文、数字和短横线。');
  return `${ARTICLE_DIRECTORY}/${slug}.md`;
};
export const isArticlePath = (path: string) => path.startsWith(`${ARTICLE_DIRECTORY}/`) && path.endsWith('.md') && validSlug(path.slice(ARTICLE_DIRECTORY.length + 1, -3));
export const validCoverPath = (path: string) => !path || /^images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp|gif)$/i.test(path);

export function validateArticle(values: ArticleValues, columns: Set<string>) {
  const errors: string[] = [];
  if (!values.title.trim()) errors.push('请填写文章标题。');
  if (values.title.length > 180) errors.push('文章标题请控制在 180 字以内。');
  if (!validSlug(values.slug)) errors.push('请填写文章地址，使用小写英文、数字和短横线，例如 my-first-song。');
  if (!values.description.trim()) errors.push('请填写摘要，供首页卡片展示。');
  if (values.description.length > 500) errors.push('摘要请控制在 500 字以内。');
  let dateIsValid = false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
    const date = new Date(`${values.date}T00:00:00Z`);
    dateIsValid = !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === values.date;
  }
  if (!dateIsValid) errors.push('请选择有效的发布日期。');
  if (!(articleCategories as readonly string[]).includes(values.category)) errors.push('请选择文章分类。');
  if (values.column && !columns.has(values.column)) errors.push('请选择现有专栏。');
  if (!validCoverPath(values.cover)) errors.push('封面请上传图片，或使用 images/ 下的 JPG、PNG、WebP、GIF 路径。');
  if (!values.body.trim()) errors.push('正文还是空白的，先写下几句话。');
  if (new TextEncoder().encode(values.body).length > 1_000_000) errors.push('正文过长，请控制在 1 MB 以内。');
  return errors;
}

function frontmatter(source: string) {
  const normalized = source.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  const match = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!match) throw new Error('这份 Markdown 缺少文章信息区，暂时无法作为博客文章载入。');
  const document = parseDocument(match[1]);
  if (document.errors.length || !isMap(document.contents)) throw new Error('文章信息格式有误，请先在 GitHub 检查文件顶部的 YAML。');
  return { document, body: normalized.slice(match[0].length).replace(/^\n/, '') };
}

export function parseArticle(source: string, slug: string): ArticleValues {
  const { document, body } = frontmatter(source);
  const data = document.toJS({ maxAliasCount: 30 }) as Record<string, unknown>;
  const text = (key: string) => typeof data[key] === 'string' ? data[key] as string : '';
  return {
    slug, title: text('title'), description: text('description'),
    date: text('date').slice(0, 10), category: text('category') || '随想',
    column: text('column'), tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    cover: text('cover'), coverAlt: text('coverAlt'), body,
    draft: data.draft === true, demo: data.demo === true, featured: data.featured === true,
  };
}

/** Preserve other frontmatter fields and comments when editing an existing article. */
export function serializeArticle(values: ArticleValues, originalSource?: string) {
  const document = originalSource ? frontmatter(originalSource).document : new Document({});
  for (const key of ['title', 'description', 'date', 'category', 'tags', 'draft', 'demo', 'featured'] as const) document.set(key, values[key]);
  for (const key of ['column', 'cover', 'coverAlt'] as const) {
    if (values[key]) document.set(key, values[key]); else document.delete(key);
  }
  return `---\n${document.toString({ lineWidth: 0 })}---\n\n${values.body.replaceAll('\r\n', '\n').trimEnd()}\n`;
}

export function decodeBase64(value: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), character => character.charCodeAt(0)));
}
