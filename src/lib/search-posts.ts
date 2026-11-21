import {categoryName, type Language} from './i18n.ts';

type SearchText = {title: string; description: string; tags: string[]; body: string};
export type SearchPost = SearchText & {category: string; url: string; english?: SearchText};
export const searchPostText = (post: SearchPost) => [post.title, post.description, post.category, categoryName(post.category,'en'), ...post.tags, post.body, ...(post.english ? [post.english.title, post.english.description, ...post.english.tags, post.english.body] : [])].join(' ').toLocaleLowerCase();
export const displayedSearchPost = (post: SearchPost, language: Language) => language === 'en' && post.english ? post.english : post;
