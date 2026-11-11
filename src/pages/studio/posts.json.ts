import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getPosts } from '../../lib/posts';
import { articlePath } from '../../lib/studio-content';
import type { PublishedArticle } from '../../lib/studio-content';

// Only already-public articles are exported. Repository drafts require authentication.
export const GET: APIRoute = async () => {
  const articles: PublishedArticle[] = await Promise.all((await getPosts()).map(async post => {
    const path = articlePath(post.id);
    const source = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
    const bytes = Buffer.from(source);
    const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    return { path, sha, values: { ...post.data, slug: post.id, body: post.body || '', date: post.data.date.toISOString().slice(0, 10), column: post.data.column || '', cover: post.data.cover || '', coverAlt: post.data.coverAlt || '' } };
  }));
  return new Response(JSON.stringify(articles), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
