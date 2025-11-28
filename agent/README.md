# Payroll for Crews Content Agent

This folder describes how an automated agent is allowed to work with the `payrollforcrews` repo.

The agent's job is simple:

- Propose and draft new blog posts.
- Improve internal links and FAQ sections.
- Never break the build or push straight to production.

## What the agent can read

The agent should always read these files before doing anything:

- `config/site.json`  
  Site purpose, audience, voice, and rules.
- `config/products.json`  
  Available tools, names, roles, and affiliate URLs.
- `config/content-plan.json`  
  Planned and published article ideas, including slugs and intents.
- Existing markdown files in `src/content/blog/`  
  To match tone, structure, and common phrases.

## What the agent is allowed to change

The agent may:

1. Create new markdown files in `src/content/blog/` for content-plan items where `status` is `"planned"`.
2. Update existing markdown files to:
   - Fix typos or clarity.
   - Add FAQ sections and internal links.
   - Add or update links that use `/go/...` redirects or known affiliate URLs.
3. Update `config/content-plan.json` to:
   - Change an item from `"planned"` to `"drafted"` or `"published"`.
   - Add a short summary of what was actually written.

The agent must **never**:

- Edit `astro.config.mjs`, `package.json`, or any build configuration.
- Edit Netlify-specific files like `public/_redirects` on its own.
- Delete existing blog posts.
- Run `git push` on its own.

## File naming rules for new articles

When creating a new article:

- Use the `slug` from `config/content-plan.json` if one is provided.
- Place the file at: `src/content/blog/<slug>.md`.
- Include frontmatter with:

```md
---
title: 'Readable title in sentence case'
description: 'One or two sentence summary in plain language.'
pubDate: 'Nov 27 2025'
heroImage: '../../assets/blog-placeholder-2.jpg'
---
