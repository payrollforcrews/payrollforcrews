# Astro Starter Kit: Blog

```sh
npm create astro@latest -- --template blog
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and OpenGraph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
├── public/
├── src/
│   ├── components/
│   ├── content/
│   ├── layouts/
│   └── pages/
├── astro.config.mjs
├── README.md
├── package.json
└── tsconfig.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

The `src/content/` directory contains "collections" of related Markdown and MDX documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and type-check your frontmatter using an optional schema. See [Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/) to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Check out [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).


---

## Reusing this framework for a new niche

When I want to spin up another affiliate site with the same pattern, the rough steps are:

1. **Clone this repo as a template**

   - Create a new GitHub repo for the new niche.
   - Locally:
     - `git clone <new-repo-url> C:\dev\<new-folder>`
     - Remove the old `.git` history and re-init if needed:
       - `cd C:\dev\<new-folder>`
       - `rmdir /s /q .git`
       - `git init`
       - `git remote add origin <new-repo-url>`

2. **Update site identity**

   - Edit `config/site.json` with:
     - New `siteName`, `domain`, `tagline`.
     - New audience description and topic clusters.
   - Update `src/consts.ts` (if present) with the new site title / description.
   - Update `src/pages/about.astro` with the new story.

3. **Reset content plan**

   - Edit `config/content-plan.json`:
     - Remove old items or change them to match the new niche.
     - Keep the same shape (`slug`, `status`, `primaryKeyword`, `intent`, `mainProducts`).
   - Delete or rewrite the markdown files in `src/content/blog/` so they fit the new plan.

4. **Wire products and affiliates**

   - Edit `config/products.json`:
     - Replace the payroll tools with the new niche’s tools.
     - Keep `slug`, `name`, `role`, `affiliateUrl`, `notes`.
   - Make sure `/go/<slug>` redirects exist in `public/_redirects`.
   - Use the same pattern for affiliate CTAs in posts:
     - Link to `/go/<slug>` instead of dropping raw affiliate URLs.

5. **SEO and enrichment agents**

   - Keep `agent/seo-expand.js`, `agent/content-enrich.js`, and `agent/cron-agent.js`.
   - Make sure `.env` has:
     - `OPENAI_API_KEY=...`
     - `GOOGLE_API_KEY=...`
     - `GOOGLE_CSE_ID=...`
   - Run once by hand on the new project to bootstrap:
     - `npm install`
     - `npm run seo:refresh`
     - `npm run build`
     - Commit and push.

6. **Hook up hosting and cron**

   - Connect the new GitHub repo to Netlify (or similar) and set the custom domain.
   - On the Geekom box, add a new scheduled task that:
     - `cd` into the new folder.
     - Runs `npm run agent:seo` weekly at 2am (or whatever cadence).

After that, the new niche should behave like Payroll for Crews:
- Content plan and keyword map drive enrichment.
- Agents keep posts fresh.
- Affiliate CTAs are wired through `/go/...` redirects and tracked with GA.

