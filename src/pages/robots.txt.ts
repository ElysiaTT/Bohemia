import type { APIContext } from 'astro';
import { withBase } from '../lib/posts';
export function GET(context: APIContext) { return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL(withBase('sitemap-index.xml'), context.site).href}\n`, { headers: { 'Content-Type': 'text/plain' } }); }
