---
translationLanguage: en
sourceHash: "bfa96857a403a3806cf5b866fffec396f6b4c9ce917c69d74e3500a6aed80df8"
title: "How Much Technology Does a Small, Beautiful Blog Need?"
description: "From static pages and Markdown to automatic deployment: keep your attention on the writing, and give the tools just enough room."
tags: ["Astro", "GitHub Pages", "static blogs"]
coverAlt: "A laptop, paper and a cup of coffee on a wooden desk"
---

When building a personal blog, the most common problem is not a shortage of tools, but an abundance of choices. Frameworks, databases and content management systems all seem to have good reasons to be used.

Start with a different question: what does this blog actually need to do? If the main requirements are publishing articles, organizing them and making them comfortable to read, a static website is a good place to begin.

## Let the content stand on its own

Markdown keeps an article in an ordinary text file. You can open it in an editor, track it with Git and move it elsewhere.

An article has a simple structure: metadata such as its title and date at the top, followed by the body.

```markdown
---
title: "One Small Thing I Learned Today"
description: "Explaining one problem clearly."
date: 2026-11-10
category: "技术" # Stored category ID: Technology
tags: ["learning notes"]
---

## Where the problem begins

Write down your observations and thoughts.
```

This way, the life of an article does not have to depend on a particular online editor.

## Do most of the work at build time

Astro can read articles and generate pages during the build. Visitors receive HTML that is already there, rather than waiting for a whole client application to start before the text appears.

Only a few blog interactions need JavaScript: switching themes, filtering categories and searching articles. Reading itself can stay simple.

| Need | How this blog handles it |
| --- | --- |
| Write articles | Markdown files |
| Publish pages | An Astro static build |
| Search content | A JSON index generated at build time |
| Receive updates | RSS subscriptions |
| Publish automatically | GitHub Actions |

## Turn publishing into a commit

GitHub Pages can host the generated static files. With Actions, committing a new article can trigger checks, a build and deployment.

Pay attention to the website’s path. A personal homepage repository usually uses the root path; a project repository includes its name in the URL. Internal links and image paths need to account for both cases.

```sh
npm install
npm run dev

# Check types and generate static files before publishing
npm run check
npm run build
```

## Practice a little restraint

You can keep adding technology, but maintenance grows along with it. First make reading, writing and publishing work smoothly. Add capabilities as real needs arise.

A small, beautiful blog does not need the most features. It simply makes you more willing to write, and others more willing to read.

## Further reading

- [Astro documentation](https://docs.astro.build/)
- [Deploy Astro to GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)
