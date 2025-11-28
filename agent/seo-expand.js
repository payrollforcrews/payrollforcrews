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

async function main() {
  const site = readJson('site.json');
  const contentPlan = readJson('content-plan.json');

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
    `Found ${publishedItems.length} published items. Generating SEO questions...`
  );

  // Simple in-memory set to avoid duplicates
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

    const pillarLabel =
      site.topicClusters?.find((cluster) =>
        cluster.toLowerCase().includes('construction')
      ) || pillarId;

    const prompt = `
Given this existing article on the site "${site.siteName}":

- Title: "${title}"
- Slug: "${slug}"
- Primary keyword: "${primaryKeyword}"
- Intent: "${intent}"
- Pillar id: "${pillarId}"
- Audience: "${site.audience?.description || ''}" (crew-based owners with 5-50 workers)

Your job:

1. Suggest 5-10 high intent search queries a small crew owner might actually type into Google that this article should either:
   - fully answer already, or
   - partially answer and could be expanded to cover.

2. Mark each query as one of:
   - "pillar" - broad topic query closely aligned with the main article focus
   - "support" - narrower how-to or scenario that might be its own post later
   - "faq" - short, specific question that belongs in an FAQ section of this same article

3. For each query, suggest:
   - "sectionType": "new-section" or "faq-item"
   - "priority": 1 (high), 2 (medium), or 3 (low) based on value to small crew owners.

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
