import tracklist from '../data/tracklist.json';
import type { Post } from './posts';

/** Track slugs are permanent column IDs, independent of article titles or categories. */
export const recordSides = tracklist;
export type RecordSide = (typeof recordSides)[number];
export type RecordTrack = RecordSide['tracks'][number];
export const columnSlugs = new Set(recordSides.flatMap(side => side.tracks.map(track => track.slug)));
export const columnPosts = (posts: Post[], slug: string) => posts.filter(post => post.data.column === slug && !post.data.demo);
export const COLUMN_ARTICLE_LIMIT = 4;

/** Layout examples remain demos and never become column membership or archive counts. */
export const columnLayoutExamples = (posts: Post[], track: RecordTrack) => {
  const ids = 'layoutPreviewPosts' in track ? track.layoutPreviewPosts : [];
  return (ids || []).flatMap(id => {
    const post = posts.find(post => post.id === id && post.data.demo);
    return post ? [post] : [];
  }).slice(0, COLUMN_ARTICLE_LIMIT);
};
