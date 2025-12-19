// agent/niche-draft.js
import 'dotenv/config';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

const topic = process.argv.slice(2).join(' ').trim();

if (!topic) {
  console.error('Usage: node agent/niche-draft.js "your niche topic here"');
  process.exit(1);
}

const systemPrompt = `
You help create boring, high value, recurring revenue affiliate content sites.

You will output ONLY JSON with this shape, no markdown, no comments:

{
  "site": {
    "siteName": "string",
    "domainIdea": "string",
    "tagline": "string",
    "audience": {
      "description": "string",
      "companySizeRange": "string",
      "industries": ["string", "string"],
      "painSummary": "string"
    },
    "positioning": {
      "promise": "string",
      "nonGoals": ["string", "string"]
    },
    "topicClusters": ["string", "string", "string"],
    "contentStyle": {
      "tone": ["plain language", "direct"],
      "rules": [
        "Explain tradeoffs, not just features.",
        "Avoid fluffy intros.",
        "Always include at least one practical checklist or step by step sequence."
      ]
    }
  },
  "products": [
    {
      "id": "short_id",
      "name": "Tool or service name",
      "category": "category label",
      "whoItHelps": "one line, audience specific",
      "valueProp": "one line, outcome focused",
      "affiliateInfo": {
        "payoutType": "recurring" ,
        "notes": "how the program usually works in this niche",
        "exampleProgramNames": ["Example Partner 1", "Example Partner 2"]
      }
    }
  ],
  "contentPlanItems": [
    {
      "slug": "kebab-case-slug",
      "status": "planned",
      "title": "Readable title in sentence case",
      "primaryKeyword": "one main keyword or phrase",
      "intent": "how_to | explainer | checklist | problem | comparison",
      "mainProducts": ["productId1", "productId2"]
    }
  ]
}

Rules:
- Topic must be: {{TOPIC}}.
- Focus on boring, recurring spend niches with potential for recurring affiliate payouts.
- No hype or AI fanboy language.
- 3 to 7 products max.
- 6 to 10 contentPlanItems max.
- Slugs must be short and kebab case.
- Make sure mainProducts only reference ids that exist in products.
- Do not use em dashes. Use commas, parentheses, or periods instead.
`.trim();

const userPrompt = `
Create a JSON config for a new niche site.

Topic:
"${topic}"

The site should be an independent project, not tied to payroll or construction. 
Do not mention "Payroll for Crews" or any existing site by name.
`.trim();

async function callOpenAI() {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt.replace('{{TOPIC}}', topic) },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('OpenAI API error:', res.status, text);
    process.exit(1);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    console.error('No content returned from OpenAI');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    console.error('Could not parse JSON from model. Raw output:');
    console.log(content);
    process.exit(1);
  }

  console.log('=== site.json draft ===');
  console.log(JSON.stringify(parsed.site, null, 2));
  console.log('\n=== products.json draft ===');
  console.log(JSON.stringify(parsed.products, null, 2));
  console.log('\n=== content-plan items draft ===');
  console.log(JSON.stringify(parsed.contentPlanItems, null, 2));
}

callOpenAI().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
