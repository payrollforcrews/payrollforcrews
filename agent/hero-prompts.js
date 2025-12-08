#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const blogDir = path.join(rootDir, 'src', 'content', 'blog');
const promptsFile = path.join(rootDir, 'config', 'hero-prompts.json');

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    console.error(`Could not read ${filePath}, starting fresh.`, err);
    return {};
  }
}

/**
 * Scene library: we pick a scene "group" based on the title,
 * then choose one scene from that group. Each scene has a fragment
 * that is appended to the global cinematic style, and an alt text.
 *
 * Nothing in here mentions titles, articles, blogs, or alt text.
 * It is all pure image vibe.
 */
const SCENES = {
  timeTracking: [
    {
      key: 'foreman_huddle',
      fragment:
        'A male foreman with a worn, dusty cap and faded work shirt stands in the middle of a half-finished job, holding a clipboard while a small crew of men in dirty work clothes listen around him. The ground is rough with mud, lumber offcuts, and cords, and everyone looks like they have been working hard for hours.',
      alt:
        'Foreman in worn work clothes talking through time tracking rules with a small, tired crew on a messy jobsite.'
    }
  ],

  switchProvider: [
    {
      key: 'trailer_papers',
      fragment:
        'A crew owner and a few workers in scuffed boots and dusty jackets stand outside a beat-up jobsite trailer at midday, leaning on a rough folding table covered with crumpled time sheets and notes. One man points at a page while the others look on, faces focused and a little worn out, with trucks, lumber stacks, and scattered tools in the background.',
      alt:
        'Crew owner and workers outside a jobsite trailer leaning over a rough table full of paperwork, planning a change in how they run payroll.'
    }
  ],

  w2_1099: [
    {
      key: 'mixed_crew_table',
      fragment:
        'A small mixed crew of tradesmen gather around a rough plywood bench used as a desk. One man in a company shirt and vest and another in more casual but dirty work clothes stand across from a crew leader with a notebook and a cheap calculator. Their hands and clothes show dust, grime, and wear. Around them are tools, pallets, and a partially built structure, giving the sense of employees and subcontractors sorting out work and pay together.',
      alt:
        'Employees and subcontractors in different work clothes gathered at a rough jobsite table, sorting out work and pay together.'
    }
  ],

  aiAccountant: [
    {
      key: 'owner_cramped_desk',
      fragment:
        'A crew owner in worn work pants and a faded flannel shirt sits at a cramped corner desk inside a small shop office. The desk is piled with receipts, notebooks, and bank statements, with a plain laptop open beside them. The owner leans over the papers, hands dusty and tired, thinking through the numbers. The walls are imperfect, with taped notes and a few tools or gear hanging nearby, clearly part of a working crew space, not a polished corporate office.',
      alt:
        'Crew owner in dusty work clothes at a cramped shop office desk piled with receipts and a plain laptop, thinking through the numbers.'
    }
  ],

  generic: [
    {
      key: 'tailgate_paperwork',
      fragment:
        'Several men in beat-up boots and dusty jackets lean against the back of a pickup truck in a rough gravel lot, using the tailgate as a makeshift table. The tailgate is covered with time sheets, envelopes, a cheap calculator, and pens. One man gestures at a page while the others watch, mid-conversation. Around them are tools, pallets, mud, and jobsite clutter, clearly showing the end of a long, physical workday.',
      alt:
        'Hard-working crew gathered around a pickup tailgate covered in time sheets and envelopes at the end of a long day.'
    }
  ]
};

function chooseGroup({ slug, title }) {
  const lowerTitle = (title || slug || '').toLowerCase();

  if (
    lowerTitle.includes('foremen') ||
    lowerTitle.includes('time tracking') ||
    lowerTitle.includes('time-tracking')
  ) {
    return 'timeTracking';
  }

  if (
    lowerTitle.includes('switch') ||
    lowerTitle.includes('mid-year') ||
    lowerTitle.includes('mid year')
  ) {
    return 'switchProvider';
  }

  if (lowerTitle.includes('w2') || lowerTitle.includes('1099')) {
    return 'w2_1099';
  }

  if (
    lowerTitle.includes('ai ') ||
    lowerTitle.includes('ai accountant') ||
    lowerTitle.includes('adam by tyms')
  ) {
    return 'aiAccountant';
  }

  return 'generic';
}

function pickScene(group) {
  const list = SCENES[group] || SCENES.generic;
  if (!list || list.length === 0) {
    return SCENES.generic[0];
  }
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function buildPromptAndAlt({ slug, title, description }) {
  const group = chooseGroup({ slug, title });
  const scene = pickScene(group);

  const baseStyle =
    'Ultra realistic IMAX-level cinematic photograph. ' +
    'Shot on a modern digital cinema camera with wide, immersive framing and rich dynamic range. ' +
    'Natural, believable lighting in real-world conditions, with honest shadows and contrast, whether cloudy daylight, harsh afternoon sun, or early evening. ' +
    'A small blue collar crew, mostly men in their 20s to 50s, captured mid-shift or at the end of the day. ' +
    'Clothing clearly shows hard work: scuffed boots, worn work pants, sweat marks, dust, mud, and grime on fabric and hands. ' +
    'The environment is gritty and lived-in with tools, materials, cords, pallets, mud or dust on the ground, coffee cups and small clutter, nothing polished or staged. ' +
    'People are caught mid-task or mid-conversation, not looking at the camera, with real, hard-working expressions. ';

  // Important: prompt is pure vibe. No title, no description, no mention of blogs or alt text.
  const prompt = `${baseStyle} ${scene.fragment}`;

  // Alt text is separate and is NOT used in the prompt.
  const alt = scene.alt;

  return { prompt, alt };
}

async function main() {
  if (!fs.existsSync(blogDir)) {
    console.error(`Blog directory not found: ${blogDir}`);
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  const existing = safeReadJson(promptsFile);
  const files = fs.readdirSync(blogDir).filter((f) => f.endsWith('.md'));

  console.log(`Found ${files.length} blog articles. Generating hero prompts where missing...`);

  const updated = { ...existing };
  let createdCount = 0;

  for (const file of files) {
    const slug = path.basename(file, '.md');
    const already = existing[slug];

    if (already && !force) {
      console.log(
        `Skipping "${slug}", hero prompt already exists (lastUpdated: ${already.lastUpdated || 'n/a'}).`
      );
      continue;
    }

    const fullPath = path.join(blogDir, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const fm = matter(raw);
    const title = fm.data.title || slug;
    const description = fm.data.description || '';

    const { prompt, alt } = buildPromptAndAlt({ slug, title, description });
    updated[slug] = {
      prompt,
      alt,
      title,
      lastUpdated: new Date().toISOString()
    };

    createdCount++;
    console.log(`  Prompt + alt stored for "${slug}".`);
  }

  fs.mkdirSync(path.dirname(promptsFile), { recursive: true });
  fs.writeFileSync(promptsFile, JSON.stringify(updated, null, 2), 'utf8');

  console.log();
  console.log(
    `Hero prompt generation complete. Created/updated prompts for ${createdCount} article(s), skipped ${
      files.length - createdCount
    } existing.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
