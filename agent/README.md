# Payroll for Crews Content and SEO Agents

This folder describes how automated agents are allowed to work with the `payrollforcrews` repo.

There are two main roles:

- **SEO / content agents** that expand keywords and enrich articles.
- **Orchestration / cron** that can run those agents and do git work when you explicitly call it.

The goal:

- Keep articles fresh and useful with real search data.
- Add FAQ and PAA style sections.
- Never break the Astro build or change routing.
- Never touch production infra like Netlify settings.

---

## What agents can read

Any content or SEO agent should treat these as read first sources:

- `config/site.json`  
  Site purpose, audience, voice, rules.

- `config/products.json`  
  Available tools, names, roles, and `/go/...` slugs.

- `config/content-plan.json`  
  Planned and published article ideas. Slugs, primary keywords, intent, and product focus.

- `config/keyword-map.json`  
  Existing PAA / PASF style questions for each slug.

- Existing markdown files in `src/content/blog/*.md`  
  To match tone, structure, and internal link style.

Agents may also read:

- `src/layouts/BlogPost.astro`  
  To understand how hero images and newsletter CTAs are rendered.

- `src/pages/blog/index.astro` and `src/pages/blog/[...slug].astro`  
  To understand routing, but not to edit them.

---

## What content agents are allowed to change

Content agents are allowed to edit only a narrow set of files.

They may:

1. **Create new articles**

   - Create new markdown files in `src/content/blog/` for `content-plan` items where `status` is `"planned"` or `"drafted"`.
   - Use the slug from `config/content-plan.json` when provided.

2. **Update existing articles**

   In `src/content/blog/*.md`, they may:

   - Fix typos and clarity.
   - Restructure or tighten paragraphs.
   - Add FAQ or PAA style sections based on `keyword-map.json`.
   - Add or adjust internal links between existing articles.
   - Add or adjust links that use `/go/...` redirects.

3. **Update the content plan**

   In `config/content-plan.json`, they may:

   - Move an item from `"planned"` to `"drafted"` or `"published"`.
   - Add a short summary or note of what was actually written.
   - Add new planned items following the existing shape.

4. **Update the keyword map**

   In `config/keyword-map.json`, they may:

   - Add new questions and queries discovered via Google search.
   - Merge questions into existing entries for the same slug.

---

## What agents must not change

Content and SEO agents must **never**:

- Edit build or tooling:

  - `astro.config.mjs`
  - `package.json`
  - `tsconfig.json`
  - Any files under `.github/` if present

- Edit routing or layout files:

  - `src/pages/blog/[...slug].astro`
  - `src/pages/blog/index.astro`
  - `src/layouts/BlogPost.astro`
  - Any other files in `src/pages/` that define routes

- Edit infra or deploy related files:

  - `public/_redirects`
  - Netlify configuration files, if added later

- Edit hero pipelines:

  - `agent/hero-prompts.js`
  - `agent/hero-images.js`
  - `config/hero-prompts.json`
  - `config/hero-images.json`

- Touch analytics wiring:

  - `src/components/BaseHead.astro`

- Delete existing blog posts.
- Delete entries from `config/content-plan.json` or `config/keyword-map.json` unless explicitly instructed by a human.

### Git and pushing

- Content and SEO agents must **not** call `git push` on their own.
- Git add / commit / push is handled by `agent/cron-agent.js` when the human runs `npm run agent:seo`.

---

## File naming and frontmatter for new articles

When creating a new article:

1. Use the `slug` from `config/content-plan.json` if one is provided.
2. Place the file at:

   ```text
   src/content/blog/<slug>.md
Include frontmatter with at least:

---
title: 'Readable title in sentence case'
description: 'One or two sentence summary in plain language.'
pubDate: 'Nov 27 2025'
---


Optional frontmatter fields that are allowed:

updatedDate: 'Dec 08 2025'
When the article has a clear updated date.

heroImage: '../path-or-import'
Only if an actual hero asset already exists. It is fine to leave this out and let the hero pipeline handle assets later.

heroAlt: 'Short manual alt text override.'
Only when a human deliberately sets this. Automated agents should not generate or change heroAlt. The layout already falls back to the title when heroAlt is missing.

Relationship to the scripts in this folder

These rules apply to how automation behaves, not just to a single script.

seo-expand.js
Reads content-plan.json and keyword-map.json.
Makes Google Programmable Search calls and writes new entries into keyword-map.json.

content-enrich.js
Reads markdown in src/content/blog/ and questions in keyword-map.json.
Uses OpenAI to enrich articles and writes .bak backups next to each file it touches.

cron-agent.js
Orchestrates:

npm run seo:refresh

npm run build

git add, git commit, git push origin main

This script is allowed to run git commands only when a human runs npm run agent:seo.

hero-prompts.js and hero-images.js
Handle hero prompts and image generation. They should not be modified by content agents.

niche-draft.js
Prints JSON drafts for cloning this engine into a new niche. It only prints to stdout and does not write files.

AI pickup context for this folder

If you are using a remote AI or agent specifically for content work and you want to give it a quick rule sheet, you can hand it this summary:

You are a content and SEO agent working on the Payroll for Crews repo.
You are allowed to:

Read config in config/site.json, config/products.json, config/content-plan.json, and config/keyword-map.json.

Read and update markdown in src/content/blog/*.md.

Update only config/content-plan.json and config/keyword-map.json for planning and questions.

Create new markdown files under src/content/blog/ based on content-plan.

You are not allowed to:

Edit any files in src/pages/, src/layouts/, astro.config.mjs, package.json, or infra files like public/_redirects.

Edit hero pipeline files or analytics wiring.

Delete content or run git push.

When creating or editing posts:

Use frontmatter with title, description, pubDate, and optional updatedDate.

Do not generate or change heroAlt. The layout uses the title as a default and humans can override it.

All git commit and push work is handled by cron-agent.js when a human runs npm run agent:seo.

This keeps the automated stuff on the content side and away from the parts that can break the site or the build.


---

If you replace `agent/README.md` with that, you will have:

- Main `README.md` that explains the whole engine.
- `agent/README.md` that is a tight rule sheet for any automation you point at `/agent` and `/src/content/blog`.

Next step after you paste:

```powershell
git add agent/README.md
git commit -m "Align agent README with current SEO and hero pipelines"
git push origin main


Netlify will redeploy with no behavioral change, only better docs.