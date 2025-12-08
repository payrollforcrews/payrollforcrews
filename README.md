# Payroll for Crews

Static SEO and affiliate site for owners who run jobsite crews. Built on Astro, deployed to Netlify, and kept fresh by a small set of local agents that:

- Pull real queries from Google Programmable Search
- Enrich articles with PAA and PASF style sections using OpenAI
- Generate cinematic hero prompts and images for each post
- Push updated content to GitHub, which triggers Netlify deploys

Production site: `https://payrollforcrews.com/`  
Repository: `github.com/payrollforcrews/payrollforcrews`  
Last updated: 2025-12-08

---

## Project structure

High level layout of the repo, with the parts that actually matter for this engine.

```text
.
├── agent/                       # Local-only "brains" for SEO, content, and heroes
│   ├── content-enrich.js        # Uses OpenAI + keyword map to enrich articles
│   ├── cron-agent.js            # Orchestrates seo:refresh + build + git push
│   ├── hero-images.js           # Calls KIE to render hero images (local only)
│   ├── hero-prompts.js          # Builds cinematic hero prompts and alt text JSON
│   ├── seo-expand.js            # Uses Google Programmable Search to expand keyword map
│   ├── niche-draft.js           # Prints JSON drafts to clone this engine for new niches
│   └── README.md                # Rules for what the agents are allowed to touch
│
├── config/                      # JSON config that drives the engine
│   ├── site.json                # Brand, audience, positioning, tone
│   ├── products.json            # Affiliate tools and metadata
│   ├── content-plan.json        # Slugs, primary keywords, and status per article
│   ├── keyword-map.json         # PAA / PASF questions per slug (generated)
│   ├── hero-prompts.json        # Hero prompt + alt per slug (generated)
│   └── hero-images.json         # Hero image file mappings per slug (generated)
│
├── public/
│   ├── _redirects               # /go/... affiliate shortlinks -> real URLs
│   └── hero/                    # Optional raw hero PNGs (not used by Astro directly)
│
├── src/
│   ├── assets/
│   │   └── blog/                # Final .webp hero images used by Astro
│   │       └── *.webp
│   │
│   ├── components/
│   │   ├── BaseHead.astro       # <head>, GA4, affiliate click tracking
│   │   ├── Header.astro         # Site header and nav
│   │   ├── Footer.astro         # Footer
│   │   └── FormattedDate.astro  # Date formatter for blog posts
│   │
│   ├── content/
│   │   └── blog/                # Markdown articles (content collections)
│   │       └── *.md
│   │
│   ├── layouts/
│   │   └── BlogPost.astro       # Layout for individual posts, hero image + CTA
│   │
│   └── pages/
│       ├── index.astro          # Home page
│       ├── about.astro          # About page
│       └── blog/
│           ├── index.astro      # Blog index listing posts
│           └── [...slug].astro  # Dynamic blog route (single source of truth for posts)
│
├── astro.config.mjs             # Astro config
├── package.json                 # Scripts for dev, build, and agents
├── tsconfig.json
└── README.md                    # This file
How the system works
Content and layouts
Blog content lives in src/content/blog/*.md.

Frontmatter is type checked via src/content/config.ts and includes:

title, description

pubDate, optional updatedDate

heroImage (optional, Astro image or string)

heroAlt (optional manual override)

Routing:

/blog index page: src/pages/blog/index.astro

/blog/[...slug].astro dynamic route:

Uses getCollection('blog')

Uses src/layouts/BlogPost.astro as the layout

BlogPost.astro:

Renders the hero image if heroImage exists.

<img alt="..."> defaults to the article title.

If heroAlt is set in frontmatter, that value overrides the alt text.

Adds a newsletter CTA that links to Substack at the bottom of each article.

SEO and enrichment agents
Agents live in /agent and are meant to run locally, not on Netlify.

Key config:

config/content-plan.json

Drives which slugs exist

Stores status (published or planned)

Defines each slug’s primaryKeyword, intent, and mainProducts

config/keyword-map.json

Grows over time

Holds Google PAA / PASF style questions per slug

Key scripts:

agent/seo-expand.js

Reads content-plan.json for items with status: "published".

Calls Google Programmable Search for each slug’s primary keyword.

Extracts relevant questions and merges them into keyword-map.json.

agent/content-enrich.js

Uses OpenAI plus:

The existing article markdown

The questions in keyword-map.json

Adds FAQ and PAA style sections near the bottom of each article.

Writes .bak backups next to the markdown files so nothing is lost.

You usually drive these via the scripts in package.json:

npm run seo:expand

npm run seo:enrich

npm run seo:refresh (runs both)

There is also a higher level orchestrator:

agent/cron-agent.js

Runs seo:refresh

Runs npm run build

Does git add, git commit, and git push origin main

Exposed as npm run agent:seo
This is what your scheduled task calls weekly.

Netlify never runs these agent scripts. They are local only.

Hero image pipeline
Hero images are generated locally and treated as static assets in the repo.

Prompts
agent/hero-prompts.js:

Scans src/content/blog/*.md using gray-matter.

Builds cinematic descriptions and alt text candidates per slug.

Writes the results to config/hero-prompts.json.

It no longer writes heroAlt back to markdown. Alt text is handled in the layout.

Image generation
agent/hero-images.js:

Uses KIE_API_KEY to call the KIE API with prompts from config/hero-prompts.json.

Downloads resulting images.

Writes:

.webp files into src/assets/blog/ for use in the site

Optional .png files into public/hero/ for reference or manual use

Updates config/hero-images.json with slug to file mappings.

Netlify build is simply:

sh
Copy code
npm run build
No hero prompts or image generation scripts run in Netlify. Hero generation and SEO enrichment are local only.

Analytics and affiliate tracking
GA4
GA4 measurement ID is injected in BaseHead.astro.

The script is the standard gtag.js snippet, loaded on every page.

Affiliate click tracking
public/_redirects defines /go/<tool> shortlinks, for example:

text
Copy code
/go/tyms  https://actual-affiliate-url-here  302
A global click handler in BaseHead.astro listens for clicks on links whose href starts with /go/ and fires a GA4 event:

Event name: affiliate_click

Event category: affiliate

Event label: the /go/... path

This lets you track which shortlinks are clicked without exposing raw affiliate URLs.

Newsletter
Newsletter is handled via Substack:
https://payrollforcrews.substack.com/

BlogPost.astro includes a CTA block at the bottom of each article:

Copy: “Get new crew payroll guides in your inbox…”

Button: “Join the newsletter” linking to Substack.

Commands
All commands run from the project root.

Core Astro commands
sh
Copy code
# Install dependencies
npm install

# Local dev server at http://localhost:4321
npm run dev

# Production build (used by Netlify)
npm run build

# Preview build locally
npm run preview
SEO and agent commands
sh
Copy code
# Expand keyword map using Google Programmable Search (PASF / PAA data)
npm run seo:expand

# Enrich articles using OpenAI and keyword map
npm run seo:enrich

# Convenient combo: expand + enrich
npm run seo:refresh

# Full cron agent: seo:refresh + build + git add + commit + push
npm run agent:seo

# Generate hero prompts (no external API calls)
npm run hero:prompts

# Generate hero images with KIE (local only, requires KIE_API_KEY in .env)
npm run hero:generate

# Hero prompts + images
npm run hero:refresh

# Niche draft: generate JSON drafts to clone this engine for a new topic
npm run niche:draft -- "your niche idea"
Environment variables
In .env on your box (not in Netlify):

OPENAI_API_KEY

GOOGLE_SEARCH_API_KEY

GOOGLE_SEARCH_ENGINE_ID

KIE_API_KEY (for hero-images.js, local only)

Reusing this framework for a new niche
When you want to spin up another SEO and affiliate site with the same pattern, use this flow.

1. Clone this repo as a template
Create a new GitHub repo for the new niche.

Locally:

powershell
Copy code
git clone https://github.com/payrollforcrews/payrollforcrews.git C:\dev\<new-folder>
cd C:\dev\<new-folder>
rmdir /s /q .git
git init
git remote add origin <new-repo-url>
You now have a clean copy of the engine without history.

2. Update site identity
Edit config/site.json:

Set new siteName, domain, and tagline.

Update audience description and topic clusters.

Update any site constants (for example src/consts.ts if present).

Update src/pages/about.astro with the new story.

3. Reset content plan
Edit config/content-plan.json:

Remove or rewrite old items to match the new niche.

Keep the same shape:

slug

status

primaryKeyword

intent

mainProducts

Delete or rewrite markdown files in src/content/blog/ so they fit the new plan.

4. Wire products and affiliates
Edit config/products.json:

Replace the payroll tools with the new niche tools.

Update public/_redirects:

Add /go/<slug> redirects to the new affiliate URLs.

In posts and CTAs, always link to /go/<slug> instead of dropping raw affiliate URLs.

5. SEO and enrichment setup
Keep agent/seo-expand.js, agent/content-enrich.js, and agent/cron-agent.js unchanged.

Create a .env for the new project:

text
Copy code
OPENAI_API_KEY=...
GOOGLE_SEARCH_API_KEY=...
GOOGLE_SEARCH_ENGINE_ID=...
KIE_API_KEY=...   # only if you plan to use hero-images
Bootstrap the new niche:

sh
Copy code
npm install
npm run seo:refresh
npm run build
git add .
git commit -m "Initial niche setup"
git push origin main
6. Connect hosting and automation
Hook the new repo up to Netlify (or similar) and map the custom domain.

On your box (or server) add a scheduled task that:

Changes directory into the new project folder.

Runs npm run agent:seo on whatever cadence you want.

Once that is done, the new niche behaves like Payroll for Crews:

content-plan.json and keyword-map.json drive enrichment.

Agents keep posts fresh and structured.

Affiliate CTAs go through /go/... shortlinks.

Deploys are automatic when the agent pushes to main.

AI pickup context (for ChatGPT sessions)
When starting a new ChatGPT session about this project, you can paste this section as the pickup prompt.

You are helping me with a specific Astro and Netlify project called Payroll for Crews. It is an SEO and affiliate content engine for owners who run jobsite crews.

Current state:

Framework: Astro static site.

Repo: github.com/payrollforcrews/payrollforcrews.

Hosting: Netlify. Production URL https://payrollforcrews.com/. Production branch is main only.

Content: Markdown blog posts in src/content/blog. Frontmatter includes title, description, pubDate, optional updatedDate, heroImage, optional heroAlt.

Routing:

/blog index at src/pages/blog/index.astro.

Dynamic blog route at src/pages/blog/[...slug].astro that uses getCollection('blog') and src/layouts/BlogPost.astro.

Do not add or change blog slug routes without a very good reason.

Layouts:

BlogPost.astro renders a hero image from heroImage.

<img alt> defaults to the article title. If heroAlt is set in frontmatter it overrides the alt text.

A newsletter CTA at the bottom links to https://payrollforcrews.substack.com.

SEO and agents:

Config lives in config/site.json, config/products.json, config/content-plan.json, config/keyword-map.json.

agent/seo-expand.js calls Google Programmable Search to build a PASF style keyword map per slug in keyword-map.json.

agent/content-enrich.js uses OpenAI plus keyword-map.json to enrich articles and writes .bak backups next to markdown files.

npm run seo:refresh runs both expand and enrich.

agent/cron-agent.js runs seo:refresh, builds, then git add and commit and push. npm run agent:seo is the entry point for scheduled runs.

Hero images:

agent/hero-prompts.js builds cinematic hero prompts per slug and writes them into config/hero-prompts.json. It does not modify markdown frontmatter.

agent/hero-images.js uses KIE_API_KEY locally to render hero images and writes .webp files into src/assets/blog/. Netlify never calls KIE.

Analytics and affiliates:

GA4 is wired in BaseHead.astro using measurement ID G-M9DTLXNERH.

Affiliate shortlinks are defined in public/_redirects as /go/<slug> that redirect to real URLs.

A global click handler in BaseHead.astro sends GA4 affiliate_click events whenever a /go/... link is clicked.

When I say “clone this for a new niche” assume I want to copy this entire pattern. Same agents and scripts. New site.json, products.json, content-plan.json, and new content in src/content/blog.

Maintaining this README
There is no automatic sync between code and docs. The discipline is:

When you make a structural change (new agent script, new config file, routing change, new major directory), update:

The treemap in “Project structure”

Any affected descriptions in “How the system works”

The “Last updated” date at the top

Commit the README change as part of the same work.

If you want a simple rule for yourself:

Do not merge structural changes without updating this README.

That way future you, and any future AI sessions, can treat this file as the single source of truth for how Payroll for Crews actually works.

yaml
Copy code

---

If you paste that over your current `README.md`, you will:

- Get rid of the duplicated conversational stuff at the bottom.
- Have a real treemap.
- Have a clean “AI pickup context” block you can reuse.
- Have a clear section on how to keep it updated.

After you paste, run:

```powershell
git add README.md
git commit -m "Clean up README and document current engine state"
git push origin main
and Netlify will redeploy with the same code but nicer docs.







