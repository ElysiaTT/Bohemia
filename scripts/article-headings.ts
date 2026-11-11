import type { HastPluginEntry } from 'satteri';
import { articleHeadingDepth } from '../src/lib/article-headings.ts';

/** Normalize rendered headings before Astro generates its IDs and table of contents. */
export function articleHeadings(): HastPluginEntry {
  return {
    name: 'bohemia-article-headings',
    before(root, context) {
      const headings: Array<{ node: typeof root.children[number]; depth: number }> = [];
      const visit = (node: typeof root | typeof root.children[number]) => {
        if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) headings.push({ node, depth: Number(node.tagName[1]) });
        if ('children' in node) node.children.forEach(visit);
      };
      visit(root);
      if (!headings.some(heading => heading.depth === 1)) return;
      for (const { node, depth } of headings) {
        if (node.type === 'element') context.replaceNode(node, { ...node, tagName: `h${articleHeadingDepth(depth, true)}` });
      }
    },
  };
}
