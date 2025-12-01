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

function writeJson(relativePath, data) {
  const fullPath = path.join(configDir, relativePath);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
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

function splitFrontmatter(content) {
  // Expect YAML frontmatter at the top: --- ... ---
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  const lines = content.split('\n');
  if (lines[0].trim() !== '---') {
    return { frontmatter: null, body: content };
  }

  let secondIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      secondIdx = i;
      break;
    }
  }

  if (secondIdx === -1) {
    return { frontmatter: null, body: content };
  }

  const frontmatter = lines.slice(0, secondIdx + 1).join('\n');
  const body = lines.slice(secondIdx + 1).join('\n');
  return { frontmatter, body };
}

async function callOpenAIForBody(prompt) {
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
            'You only return the UPDATED BODY of a markdown article, not the frontmatter. ' +
            'Do not wrap the result in code fences. Do not include YAML frontmatter. ' +
            'Do not escape characters with unnecessary backslashes. ' +
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

  const sorted = [...all].sort((a, b) => {
    const pa = a.priority ?? 2;
    const pb = b.priority ?? 2;
    if (pa !== pb) return pa - pb;
    if (a.type === 'pillar' && b.type !== 'pillar') return -1;
    if (b.type === 'pillar' && a.type !== 'pillar') return 1;
    return 0;
  });

  const newSections = sorted
    .filter((s) => s.sectionType === 'new-section')
    .slice(0, 3);

  const faqs = sorted
    .filter((s) => s.sectionType === 'faq-item')
    .slice(0, 5);

  return [...newSections, ...faqs];
}

async function main() {
  const site = readJson('site.json');
  const contentPlan = readJson('content-plan.json');
  const keywordMap = readJson('keyword-map.json');

  // PASF phrases harvested by seo-expand, keyed by slug
  let pasfMap = {};
  try {
    pasfMap = readJson('pasf-map.json');
  } catch (err) {
    pasfMap = {};
  }

  // Enrichment log to avoid re-touching articles when nothing new is available
  let enrichLog = {};
  try {
    enrichLog = readJson('enrich-log.json');
  } catch (err) {
    enrichLog = {};
  }

  const itemsToEnrich = contentPlan.items.filter(
    (item) => item.status === 'published' && item.action === 'enrich'
  );

  if (!itemsToEnrich.length) {
    console.log('No published items with action "enrich" found.');
    return;
  }

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
    const { slug, title } = item;
    const mdPath = path.join(blogDir, `${slug}.md`);

    if (!fs.existsSync(mdPath)) {
      console.warn(
        `Markdown file not found for slug "${slug}" at ${mdPath}, skipping.`
      );
      continue;
    }

    const allSuggestions = selectSuggestionsForSlug(keywordMap, slug);
    if (!allSuggestions.length) {
      console.log(
        `No keyword suggestions found for ${slug}, skipping enrichment.`
      );
      continue;
    }

    const logEntry = enrichLog[slug] || { usedQueries: [] };
    const usedSet = new Set(
      (logEntry.usedQueries || [])
        .filter((q) => typeof q === 'string')
        .map((q) => q.toLowerCase().trim())
    );

    // Only treat *new* and *high-priority* suggestions as triggers to touch the article
    const newHighValueSuggestions = allSuggestions.filter((s) => {
      const q = (s.query || '').trim();
      if (!q) return false;

      const lower = q.toLowerCase();
      if (usedSet.has(lower)) return false;

      const priority = s.priority ?? 2;
      // Only treat priority 1 or 2 as "worth touching the article"
      if (priority > 2) return false;

      return true;
    });

    if (!newHighValueSuggestions.length) {
      console.log(
        `No NEW high-priority suggestions for ${slug}, leaving article unchanged.`
      );
      continue;
    }

    const pasfPhrases = Array.isArray(pasfMap[slug]) ? pasfMap[slug] : [];

    const articleContent = fs.readFileSync(mdPath, 'utf8');
    const { frontmatter, body } = splitFrontmatter(articleContent);

    if (!frontmatter) {
      console.warn(
        `Could not detect frontmatter for ${slug}, leaving file unchanged.`
      );
      continue;
    }

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
You are updating the BODY of an existing markdown blog post for the site "${site.siteName}".

Audience:
${site.audience?.description || 'Owners and managers who run small crew-based businesses.'}

Tone:
- ${site.contentStyle?.tone?.join(', ') || 'plain, direct, no jargon'}
Rules:
- Explain tradeoffs, use concrete crew scenarios, keep intros tight.
- Do not use em dashes. Use commas, parentheses, or periods instead.

FRONTMATTER (read only, do not change this):
${frontmatter}

CURRENT BODY (what you are allowed to change) is between <<<BODY>>> and <<<END BODY>>>:

<<<BODY>>>
${body}
<<<END BODY>>>

You also have a set of search queries and suggestions to enrich this article:

All suggestions (for context):
${JSON.stringify(allSuggestions, null, 2)}

New high-priority suggestions that justify updating this article RIGHT NOW:
${JSON.stringify(newHighValueSuggestions, null, 2)}

In addition, you may optionally use the following PASF-style search phrases (People Also Search For style) as light seasoning. 
Treat these as hints, not the main topic, and only use them if they fit naturally in the updated body:

${
  pasfPhrases.length
    ? pasfPhrases.map((p) => `- ${p}`).join('\n')
    : '- (No PASF phrases available for this article)'
}

Rules for PASF usage:
- Use at most 3 to 5 PASF phrases in the entire updated body.
- Do not repeat the same PASF phrase more than once.
- Only use PASF phrases in:
  - Section headings (H2 or H3),
  - FAQ questions,
  - Internal link anchor text,
  - Short clarifying sentences where it reads naturally.
- Never force a PASF phrase if it sounds unnatural or spammy for small crew owners.

Each suggestion has:
- "query": what a crew owner might type into Google
- "type": "pillar" | "support" | "faq"
- "sectionType": "new-section" or "faq-item"
- "priority": 1 (high) to 3 (low)

Your job:

1. Focus primarily on the "newHighValueSuggestions". 
   - Add 1 to 3 new H2 or H3 sections that naturally answer the highest-priority new suggestions where sectionType is "new-section".
   - Use headings that feel like real questions or clear statements (not spammy keyword strings).
   - You can weave in PASF phrases in headings when it sounds natural and helpful.
   - Avoid dramatically rewriting parts of the article that already answer older suggestions unless needed for clarity.

2. Add or update a short FAQ section near the end of the BODY.
   - Use a heading like "Common questions from owners" or similar.
   - Include 3 to 5 Q and A pairs based primarily on new or under-served "faq-item" suggestions.
   - Each question can echo how an owner would actually ask it.
   - You may lightly incorporate PASF phrases into FAQ questions if it still sounds like a real person.

3. Add 1 or 2 internal links to relevant existing articles, only where it reads naturally.
   You can use any of these as targets:
${otherArticles}

For internal links:
- Use natural anchor text (for example "our payroll checklist" or "our guide to switching providers").
- Link to the correct URL for the slug, for example: https://${site.domain ||
      'payrollforcrews.com'}/blog/construction-payroll-setup/

4. When you choose headings, FAQ questions, or anchor text, treat PASF phrases as seasoning.
   - It is better to skip a PASF phrase than to make the sentence feel awkward.

Important output rules:
- Return ONLY the UPDATED BODY markdown (no frontmatter).
- Do NOT wrap the result in backticks or code fences.
- Do NOT include YAML frontmatter.
- Do NOT escape characters unnecessarily (no leading backslashes before # or -).
`;

    console.log(
      `\nEnriching article: ${slug} (${title}) using ${newHighValueSuggestions.length} new high-priority suggestions.`
    );

    let updatedBody;
    try {
      updatedBody = await callOpenAIForBody(prompt);
    } catch (err) {
      console.error(`OpenAI error while enriching ${slug}:`, err.message);
      continue;
    }

    if (!updatedBody || typeof updatedBody !== 'string') {
      console.error(`Unexpected response for ${slug}, skipping write.`);
      continue;
    }

    // Simple sanity check: body should contain at least one heading or paragraph
    if (!updatedBody.includes('#') && updatedBody.trim().length < 200) {
      console.warn(
        `Updated body for ${slug} looks too small or malformed, keeping original.`
      );
      continue;
    }

    // Backup original file
    fs.writeFileSync(`${mdPath}.bak`, articleContent, 'utf8');

    const newContent = `${frontmatter}\n${updatedBody.trimStart()}`;
    fs.writeFileSync(mdPath, newContent, 'utf8');
    console.log(`Updated: ${slug} (backup written to ${mdPath}.bak)`);

    // Update enrich log with the queries we just used
    const newlyUsedQueries = newHighValueSuggestions
      .map((s) => (s.query || '').trim())
      .filter((q) => q.length > 0);

    const mergedUsed = Array.from(
      new Set([
        ...(logEntry.usedQueries || []),
        ...newlyUsedQueries
      ])
    );

    enrichLog[slug] = {
      usedQueries: mergedUsed,
      lastUpdated: new Date().toISOString()
    };
  }

  // Persist enrichment log so future runs can decide whether to touch an article
  writeJson('enrich-log.json', enrichLog);

  console.log('\nContent enrichment complete.');
}

main().catch((err) => {
  console.error('Fatal error in content-enrich agent:', err);
  process.exit(1);
});
