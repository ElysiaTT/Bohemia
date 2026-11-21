import {readFile} from 'node:fs/promises';
import {articlePath,parseArticle,validSlug} from '../src/lib/studio-content.ts';
import {translationSourceHash} from '../src/lib/article-translations.ts';

const slug = process.argv[2];
if (!slug || !validSlug(slug)) throw new Error('Usage: npm run translation:hash -- article-slug');
const source = await readFile(new URL('../'+articlePath(slug),import.meta.url),'utf8');
console.log('sourceHash: "'+translationSourceHash(parseArticle(source,slug))+'"');
