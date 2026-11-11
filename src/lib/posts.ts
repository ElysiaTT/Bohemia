import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;
export const categories = ['技术', '设计', '生活', '随想'] as const;
export const withBase = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
export const postUrl = (post: Post) => withBase(`posts/${post.id}/`);
export const readingTime = (post: Post) => {
  const body = post.body || '';
  const chinese = (body.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (body.replace(/[\u3400-\u9fff]/g, ' ').match(/\b\w+\b/g) || []).length;
  return Math.max(1, Math.ceil(chinese / 350 + words / 200));
};
export const getPosts = async () => (await getCollection('posts', ({ data }) => !data.draft))
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
export const formatDate = (date: Date) => date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).replaceAll('/', '.');
export const categoryUrl = (category: string) => withBase(`writing/?category=${encodeURIComponent(category)}`);
