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
    throw new Error(`Config file not found: ${relativePath}`);
  }
  const raw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(raw);
}

function stripFences(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
  }
  return cleaned.trim();
}

async function callOpenAIForMarkdown(prompt) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const res = await axios.post(
    url,
    {
      model: 'gpt-4.1-mini',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You are an editor for a niche site about payroll, time tracking, and job costing for small crew-based businesses. ' +
            'You only return updated markdown content for the article. No explanations, no code fences. ' +
            'Do not use em dashes (—). Use commas, parentheses, or periods instead.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 90000
    }
  );

  const content = res.data.choices[0].message.content || '';
  return stripFences(content);
}

function selectSuggestionsForSlug(keywordMap, slug) {
  const all = keywordMap.filter((k) => k.slug === slug);

  if (!all.length) return [];

  // Sort by priority (1 = best), then type so pillar/support tend to come before faq
  const sorted = [...all].sort((a, b) => {
    const pa = a.priority ?? 2;
    const pb = b.priority ?? 2;
    if (pa !== pb) return pa - pb;
    if (a.type === 'pillar' && b.type !== 'pillar') return -1;
    if (b.type === 'pillar' && a.type !== 'pillar') return 1;
    return 0;
  });

  const newSections = sorted.filter(
    (s) => s.sectionType === 'new-section'
  ).slice(0, 3);

  const faqs = sorted.filter(
    (s) => s.sectionType === 'faq-item'
  ).slice(0, 5);

  return [...newSections, ...faqs];
}

async function main() {
  const site = readJson('site.json');
  const contentPlan = readJson('content-plan.json');
  const keywordMap = readJson('keyword-map.json');

  const itemsToEnrich = contentPlan.items.filter(
    (item) => item.status === 'published' && item.action === 'enrich'
  );

  if (!itemsToEnrich.length) {
    console.log('No published items with action "enrich" found.');
    return;
  }

  // Build a list of other articles for internal links
  const internalTargets = contentPlan.items
    .filter((item) => item.status === 'published')
    .map((item) => ({
      slug: item.slug,
      title: item.title
    }));

  console.log(
    `Found ${itemsToEnrich.length} articles to enrich. Starting updates...`
  );

  for (const item of itemsToEnrich) {
    const { slug, title, primaryKeyword, pillarId } = item;
    const mdPath = path.join(blogDir, `${slug}.md`);

    if (!fs.existsSync(mdPath)) {
      console.warn(
        `Markdown file not found for slug "${slug}" at ${mdPath}, skipping.`
      );
      continue;
    }

    const suggestions = selectSuggestionsForSlug(keywordMap, slug);
    if (!suggestions.length) {
      console.log(
        `No keyword suggestions found for ${slug}, skipping enrichment.`
      );
      continue;
    }

    const articleContent = fs.readFileSync(mdPath, 'utf8');

    const otherArticles = internalTargets
      .filter((t) => t.slug !== slug)
      .map(
        (t) =>
          `- Title: "${t.title}", slug: "${t.slug}", url: "https://${
            site.domain || 'payrollforcrews.com'
          }/blog/${t.slug}/"`
      )
      .join('\n');

    const prompt = `
You are updating an existing markdown blog post for the site "${site.siteName}".

Audience:
${site.audience?.description || 'Owners and managers who run small crew-based businesses.'}

Tone guidelines:
- ${site.contentStyle?.tone?.join(', ') || 'plain, direct, no jargon'}
Rules:
- Explain tradeoffs, use concrete crew scenarios, and keep intros tight.
- Do not use em dashes (—). Use commas, parentheses, or periods instead.

Existing article markdown (frontmatter + body) is between <<<ARTICLE>>> and <<<END ARTICLE>>>.
Keep the YAML frontmatter exactly as it is (same keys and values).

<<<ARTICLE>>>
${articleContent}
<<<END ARTICLE>>>

You also have a set of search queries and suggestions to enrich this article:

${JSON.stringify(suggestions, null, 2)}

Each suggestion has:
- "query": what a crew owner might type into Google
- "type": "pillar" | "support" | "faq"
- "sectionType": "new-section" or "faq-item"
- "priority": 1 (high) to 3 (low)

Your job:

1. Add 1–3 new H2 or H3 sections that naturally answer the highest-priority suggestions where sectionType is "new-section".
   - Use headings that feel like real questions or clear statements (not spammy keyword strings).
   - Weave in the queries in natural language, do not keyword stuff.

2. Add a short FAQ section near the end of the article.
   - Use a heading like "Common questions from owners" or similar.
   - Include 3–5 Q&A pairs based on suggestions where sectionType is "faq-item".
   - Each question can echo how an owner would actually ask it.

3. Add 1–2 internal links to relevant existing articles, only where it reads naturally.
   You can use any of these as targets:
${otherArticles}

For internal links:
- Use natural anchor text (for example "our payroll checklist" or "our guide to switching providers").
- Link to the correct URL for the slug, for example: https://${site.domain ||
      'payrollforcrews.com'}/blog/construction-payroll-setup/

Do NOT:
- Change the frontmatter.
- Drastically rewrite the whole article.
- Add salesy copy or tool shilling.

Output:
Return the full updated markdown file (frontmatter + body) with your additions applied.
Return only the markdown. No explanations, no code fences.
`;

    console.log(`\nEnriching article: ${slug} (${title})`);

    let updated;
    try {
      updated = await callOpenAIForMarkdown(prompt);
    } catch (err) {
      console.error(`OpenAI error while enriching ${slug}:`, err.message);
      continue;
    }

    if (!updated || typeof updated !== 'string') {
      console.error(`Unexpected response for ${slug}, skipping write.`);
      continue;
    }

    fs.writeFileSync(mdPath, updated, 'utf8');
    console.log(`Updated: ${slug}`);
  }

  console.log('\nContent enrichment complete.');
}

main().catch((err) => {
  console.error('Fatal error in content-enrich agent:', err);
  process.exit(1);
});
