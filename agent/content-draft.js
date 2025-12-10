#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const configDir = path.join(rootDir, 'config');
const blogDir = path.join(rootDir, 'src', 'content', 'blog');

function readJson(relativePath) {
  const fullPath = path.join(configDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  const raw = fs.readFileSync(fullPath, 'utf8');
  return raw.trim() ? JSON.parse(raw) : null;
}

function writeJson(relativePath, data) {
  const fullPath = path.join(configDir, relativePath);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
}

function stripFences(text) {
  let cleaned = (text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\s*/, '');
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
  }
  return cleaned.trim();
}

async function callOpenAIForDraft(systemPrompt, userPrompt) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const res = await axios.post(
    url,
    {
      model: 'gpt-4.1-mini',
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000
    }
  );

  const content = res.data.choices?.[0]?.message?.content || '';
  return stripFences(content);
}

function getTodayPubDate() {
  // Example: "Dec 8 2025"
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const day = now.getDate();
  const year = now.getFullYear();
  return `${month} ${day} ${year}`;
}

async function main() {
  const site = readJson('site.json') || {};
  const contentPlan = readJson('content-plan.json');

  if (!contentPlan || !Array.isArray(contentPlan.items)) {
    console.error('Invalid or missing config/content-plan.json');
    process.exit(1);
  }

  const productsList = readJson('products.json') || [];
  const productsById = {};
  for (const p of productsList) {
    if (p && p.id) {
      productsById[p.id] = p;
    }
  }

  const allItems = contentPlan.items;
  const publishedItems = allItems.filter((item) => item.status === 'published');
  const plannedItems = allItems.filter((item) => item.status === 'planned');

  if (!plannedItems.length) {
    console.log('No items with status "planned" found in content-plan.json. Nothing to draft.');
    return;
  }

  console.log(`Found ${plannedItems.length} planned item(s). Drafting any missing markdown files...`);

  const todayPubDate = getTodayPubDate();
  let draftedCount = 0;
  let updatedPlan = [...allItems];

  for (const item of plannedItems) {
    const { slug, title, primaryKeyword, intent, mainProducts } = item;
    if (!slug) {
      console.warn('Planned item is missing a slug, skipping:', item);
      continue;
    }

    const mdPath = path.join(blogDir, `${slug}.md`);
    if (fs.existsSync(mdPath)) {
      console.log(`  Markdown already exists for "${slug}", skipping draft.`);
      continue;
    }

    const articleProducts = Array.isArray(mainProducts)
      ? mainProducts
          .map((id) => productsById[id])
          .filter((p) => p && p.status === 'active')
      : [];

    const internalTargets = publishedItems
      .filter((p) => p.slug && p.title && p.slug !== slug)
      .map((p) => ({
        slug: p.slug,
        title: p.title
      }));

    const systemPrompt = `
You are writing as the single author of "Payroll for Crews", a niche site about payroll, time tracking, and job costing for small crew based businesses.

You talk like someone who has actually sat in the owner chair:
- Direct, plain language.
- Respectful of the reader's time.
- Opinionated when it helps them avoid dumb mistakes.
- No corporate one size fits all fluff.

Style rules:
- You write for owners and managers who run field crews, not cubicle employees.
- Use concrete examples from job sites, foremen, muddy boots, and messy time cards.
- Explain tradeoffs. Be willing to say "this is usually not worth it for a small crew".
- No em dashes. Use commas, parentheses, or periods instead.
- Do not include your own table of contents, the layout will handle navigation.
- Do not talk about "this article" in a meta way. Just talk to the reader.
`;

    const internalTargetsList = internalTargets.length
      ? internalTargets
          .map(
            (t) =>
              `- ${t.title}  (slug: ${t.slug}, url: https://${site.domain || 'payrollforcrews.com'}/blog/${t.slug}/)`
          )
          .join('\n')
      : '(No other published articles yet.)';

    let toolsSummary = 'For this article, there are no specific tools you need to mention.';
    let preferredToolId = null;

    if (articleProducts.length) {
      preferredToolId = articleProducts[0].id;
      const toolLines = articleProducts.map((p) => {
        const name = p.name || p.id;
        const who = p.who_it_helps || p.inline_note || '';
        return `- id: ${p.id}, name: ${name}, who_it_helps: ${who}`;
      });
      toolsSummary = `
Here are tools you MAY optionally mention.

${
  toolLines.length
    ? toolLines.join('\n')
    : '(No useful details found for tools in products.json.)'
}
`;
    }

    const userPrompt = `
You are drafting a brand new blog post for the site "${site.siteName || 'Payroll for Crews'}".

Audience:
${site.audience?.description || 'Owners and managers who run small crew based businesses.'}

Topic metadata:
- Slug: ${slug}
- Title: ${title}
- Primary keyword: ${primaryKeyword || '(none given)'}
- Intent: ${intent || '(none given)'}

Other published articles you can link to:
${internalTargetsList}

${toolsSummary}

Your job:

1. Write a complete, original article that would genuinely help a small crew based business owner on this topic.
   - Start fast with a short intro that calls out the real problem in plain language.
   - Use H2 and H3 headings only. Do not include an H1 in the body.
   - Use examples and simple checklists where they help.
   - Do not pad the article with generic SEO fluff. Every section should earn its keep.

2. Internal links:
   - Add 2 or 3 internal links to the articles listed above, if any exist.
   - Use natural anchor text like "our guide to switching payroll providers" instead of "read this article".
   - Link to the full https URL shown for each slug.
   - Do not wrap the links or the sentences containing them in parentheses.

3. Affiliate mention:
   - If tools were provided above, weave in exactly ONE inline mention of ONE tool, at most once.
   - Pick the tool that fits the advice best. If none fit naturally, you may skip it.
   - If you do mention a tool, link its name to "/go/${preferredToolId || 'tool-id'}".
   - Put the link in a normal sentence. Do not wrap the link or the sentence in parentheses.
   - Do not create a "recommended tools" list. It should feel like a natural aside inside real advice.

4. Tone:
   - You are not a neutral encyclopedia. You are a friendly, experienced operator.
   - It is fine to say things like "This usually backfires for small crews" if it is true.
   - Keep intros tight and avoid long, abstract build ups.

Output format:

Return ONLY a markdown document with:
- A YAML frontmatter block at the top.
- Then a blank line.
- Then the body.

Frontmatter rules:
- Use this exact title value: ${title}
- Create a 1 to 2 sentence "description" in plain language that would look good in search results.
- pubDate must be "${todayPubDate}" exactly.
- heroImage must be "../../assets/blog/${slug}-hero.webp"
- Do not include heroAlt. The layout handles alt text.
- Do not include slug or tags fields.

Example frontmatter shape (values will differ):

---
title: 'Readable title'
description: 'Short description.'
pubDate: 'Dec 8 2025'
heroImage: '../../assets/blog/example-hero.webp'
---

Then the body.

Important:
- Do NOT wrap the entire answer in code fences.
- Do NOT include any explanation, only the markdown file.
`;

    console.log(`\nDrafting article for slug "${slug}"...`);

    let draft;
    try {
      draft = await callOpenAIForDraft(systemPrompt, userPrompt);
    } catch (err) {
      console.error(`Error from OpenAI while drafting "${slug}":`, err.message);
      continue;
    }

    if (!draft || typeof draft !== 'string') {
      console.error(`Empty or invalid draft content for "${slug}", skipping write.`);
      continue;
    }

    if (!draft.trimStart().startsWith('---')) {
      console.error(
        `Draft for "${slug}" does not start with YAML frontmatter ("---"). Keeping this slug as planned.`
      );
      continue;
    }

    // Simple sanity check: make sure there is at least one H2 and a few hundred characters.
    const bodyPart = draft.split('---').slice(2).join('---');
    if (!bodyPart.includes('## ') || bodyPart.trim().length < 800) {
      console.warn(
        `Draft body for "${slug}" looks too short or lacks headings. Skipping write so you can inspect later.`
      );
      continue;
    }

    fs.writeFileSync(mdPath, `${draft.trim()}\n`, 'utf8');
    console.log(`  Wrote ${mdPath}`);

    // Update content plan entry to mark as published and ready for enrichment
    updatedPlan = updatedPlan.map((p) => {
      if (p.slug !== slug) return p;
      return {
        ...p,
        status: 'published',
        action: p.action || 'enrich',
        firstDraftedAt: new Date().toISOString()
      };
    });

    draftedCount++;
  }

  // Persist updated content plan if we drafted anything
  if (draftedCount > 0) {
    const nextPlan = {
      ...contentPlan,
      items: updatedPlan
    };
    writeJson('content-plan.json', nextPlan);
    console.log(`\nDrafted ${draftedCount} article(s) and updated content-plan.json.`);
  } else {
    console.log('\nNo new drafts were created. Either files already existed or drafts did not pass sanity checks.');
  }
}

main().catch((err) => {
  console.error('Fatal error in content-draft agent:', err);
  process.exit(1);
});
