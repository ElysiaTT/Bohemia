import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import tracklist from './data/tracklist.json';

const columnSlugs = new Set(tracklist.flatMap(side => side.tracks.map(track => track.slug)));

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.enum(['技术', '设计', '生活', '随想']),
    column: z.string().refine(slug => columnSlugs.has(slug), 'Unknown record column slug').optional(),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    demo: z.boolean().default(false),
  }),
});

export const collections = { posts };
