/** The page template owns h1; a Markdown document with its own title starts at h2. */
export const articleHeadingDepth = (depth: number, hasDocumentTitle: boolean) => hasDocumentTitle ? Math.min(6, depth + 1) : depth;
