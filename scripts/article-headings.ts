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
      const shift = headings.some(heading => heading.depth === 1);
      const english = (context.data.astro as {frontmatter?: {translationLanguage?: string}} | undefined)?.frontmatter?.translationLanguage === 'en';
      if (!shift && !english) return;
      for (const [index, { node, depth }] of headings.entries()) {
        if (node.type === 'element') context.replaceNode(node, { ...node, tagName: `h${articleHeadingDepth(depth, shift)}`, ...(english ? {properties: {...node.properties, id: `en-section-${index + 1}`}} : {}) });
      }
    },
  };
}
