import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import site from '../data/site.json';
import { getPosts, postUrl } from '../lib/posts';
export async function GET(context: APIContext) {
  return rss({ title: site.title, description: site.description, site: context.site!, items: (await getPosts()).map(post => ({ title: post.data.title, pubDate: post.data.date, description: post.data.description, link: postUrl(post), categories: [post.data.category, ...post.data.tags] })), customData: '<language>zh-CN</language>' });
}
