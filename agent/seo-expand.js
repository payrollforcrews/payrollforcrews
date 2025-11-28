import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

if (!GOOGLE_SEARCH_API_KEY) {
  console.error('Missing GOOGLE_SEARCH_API_KEY in .env');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const configDir = path.join(rootDir, 'config');

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

function stripJsonFences(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
  }
  return cleaned.trim();
}

async function callOpenAI(prompt) {
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
            'You are an SEO assistant for a niche site about payroll, time tracking, and job costing for small crew-based businesses. ' +
            'You only respond with valid JSON. No markdown, no commentary.'
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
      timeout: 60000
    }
  );

  const content = res.data.choices[0].message.content;
  const cleaned = stripJsonFences(content);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Failed to parse JSON from OpenAI. Raw:', cleaned);
    throw err;
  }
}

async function fetchGoogleResults(query, cx, num = 5) {
  const url = 'https://www.googleapis.com/customsearch/v1';

  try {
    const res = await axios.get(url, {
      params: {
        key: GOOGLE_SEARCH_API_KEY,
        cx,
        q: query,
        num
      },
      timeout: 15000
    });

    const items = res.data.items || [];
    return items.map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet
    }));
  } catch (err) {
    console.error(`Google search failed for "${query}":`, err.message);
    return [];
  }
}

async function main() {
  const site = readJson('site.json');
  const contentPlan = readJson('content-plan.json');
  const searchConfig = readJson('search.json');

  const gps = searchConfig.googleProgrammableSearch;
  if (!gps || !gps.enabled || !gps.cx) {
    console.error(
      'googleProgrammableSearch not properly configured in config/search.json'
    );
    process.exit(1);
  }

  let keywordMap = [];
  const keywordMapPath = path.join(configDir, 'keyword-map.json');
  if (fs.existsSync(keywordMapPath)) {
    const raw = fs.readFileSync(keywordMapPath, 'utf8').trim();
    if (raw) {
      keywordMap = JSON.parse(raw);
    }
  }

  const publishedItems = contentPlan.items.filter(
    (item) => item.status === 'published'
  );

  if (publishedItems.length === 0) {
    console.log('No published items found in content-plan.json');
    return;
  }

  console.log(
    `Found ${publishedItems.length} published items. Generating SEO questions with Google SERP context...`
  );

  const existingKeys = new Set(
    keywordMap.map((k) => `${k.pillarId}::${k.slug}::${k.query}`)
  );

  for (const item of publishedItems) {
    const {
      slug,
      title,
      primaryKeyword,
      pillarId = 'unknown',
      intent
    } = item;

    console.log(`\nProcessing: ${slug} (${title})`);
    console.log(`Running Google search for: "${primaryKeyword}"`);

    const results = await fetchGoogleResults(
      primaryKeyword,
      gps.cx,
      gps.resultsPerQuery || 5
    );

    const serpSummary = results
      .map(
        (r, idx) =>
          `${idx + 1}. Title: ${r.title}\n   Snippet: ${r.snippet}\n   URL: ${r.link}`
      )
      .join('\n');

    const prompt = `
You are helping plan and enrich SEO content for the site "${site.siteName}".

Existing article:
- Title: "${title}"
- Slug: "${slug}"
- Primary keyword: "${primaryKeyword}"
- Intent: "${intent}"
- Pillar id: "${pillarId}"
- Audience: "${site.audience?.description || ''}" (crew-based owners with 5-50 workers)

You also have a Google search results snapshot for the primary keyword. These are the top results:

${serpSummary || '(No external results available)'}

Your job:

1. From the perspective of a small crew owner searching for this topic, suggest 5-10 high intent search queries that:
   - Are closely related to the primary keyword and the SERP above, and
   - This article should either fully answer, or
   - Partially answer and could be expanded to cover.

2. Mark each query as one of:
   - "pillar" - broad topic query closely aligned with the main article focus
   - "support" - narrower how-to or scenario that might be its own post later
   - "faq" - short, specific question that belongs in an FAQ section of this same article

3. For each query, suggest:
   - "sectionType": "new-section" or "faq-item"
   - "priority": 1 (high), 2 (medium), or 3 (low) based on value to small crew owners and alignment with the SERP.

Output JSON only in this exact shape:

[
  {
    "query": "string",
    "type": "pillar" | "support" | "faq",
    "sectionType": "new-section" | "faq-item",
    "priority": 1 | 2 | 3
  }
]
`;

    let suggestions;
    try {
      suggestions = await callOpenAI(prompt);
    } catch (err) {
      console.error(`OpenAI call failed for ${slug}:`, err.message);
      continue;
    }

    if (!Array.isArray(suggestions)) {
      console.error(`Unexpected response format for ${slug}`, suggestions);
      continue;
    }

    let added = 0;

    for (const s of suggestions) {
      if (!s || typeof s.query !== 'string') continue;

      const q = s.query.trim();
      if (!q) continue;

      const key = `${pillarId}::${slug}::${q}`;
      if (existingKeys.has(key)) continue;

      const record = {
        pillarId,
        slug,
        baseKeyword: primaryKeyword,
        query: q,
        type: s.type || 'support',
        sectionType: s.sectionType || 'faq-item',
        priority: s.priority || 2
      };

      keywordMap.push(record);
      existingKeys.add(key);
      added += 1;
    }

    console.log(`Added ${added} new queries for ${slug}.`);
  }

  writeJson('keyword-map.json', keywordMap);
  console.log(
    `\nDone. keyword-map.json now has ${keywordMap.length} total entries.`
  );
}

main().catch((err) => {
  console.error('Fatal error in seo-expand agent:', err);
  process.exit(1);
});
