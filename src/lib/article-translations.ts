import {createHash} from 'node:crypto';

type SourceArticle = {title: string; description: string; tags: string[]; coverAlt?: string; body?: string};
/** Bind a translation to the exact words it translates, independent of dates or flags. */
export function translationSourceHash(article: SourceArticle) {
  const normalized = {title: article.title, description: article.description, tags: article.tags, coverAlt: article.coverAlt || '', body: (article.body || '').replaceAll('\r\n', '\n').trim()};
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
export function translationIsCurrent(source: SourceArticle, translation?: {sourceHash: string}) {
  return !!translation && translation.sourceHash === translationSourceHash(source);
}
