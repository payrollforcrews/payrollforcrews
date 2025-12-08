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
 * Build short, generic alt text from title / description / slug.
 * No domain locking, no blog name, no keyword salad.
 */
function buildAltFromTitle({ slug, title, description }) {
  let base = (title || '').trim();

  if (!base && description) {
    base = description.trim();
  }
  if (!base && slug) {
    base = slug.replace(/[-_]/g, ' ').trim();
  }

  if (!base) {
    base = 'Hero image for this article';
  }

  // Normalize spaces
  base = base.replace(/\s+/g, ' ');

  // Hard cap length so we do not get absurdly long alt text
  const maxLength = 140;
  if (base.length > maxLength) {
    const sliced = base.slice(0, maxLength);
    const lastSpace = sliced.lastIndexOf(' ');
    base = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
    base = base.trimEnd() + '…';
    return base;
  }

  // Ensure it ends with punctuation
  if (!/[.!?…]$/.test(base)) {
    base = base + '.';
  }

  return base;
}

function buildPromptAndAlt({ slug, title, description }) {
  const lowerTitle = (title || slug || '').toLowerCase();

  // Scene for the IMAGE MODEL (no title, no alt, no blog/SEO junk).
  let scene;

  if (lowerTitle.includes('foremen') || lowerTitle.includes('time tracking')) {
    scene =
      'A male foreman with a worn, dusty cap and faded work shirt stands in the middle of a half-finished job, holding a clipboard while a small crew of men in dirty work clothes listen around him. The ground is rough with mud, lumber offcuts, and cords, and everyone looks like they have been working hard for hours.';
  } else if (lowerTitle.includes('switch') || lowerTitle.includes('mid-year')) {
    scene =
      'A crew owner and a few workers in scuffed boots and dusty jackets stand outside a beat-up jobsite trailer at midday, leaning on a rough folding table covered with crumpled time sheets and notes. One man points at a page while the others look on, faces focused and a little worn out, with trucks, lumber stacks, and scattered tools in the background.';
  } else if (lowerTitle.includes('w2') || lowerTitle.includes('1099')) {
    scene =
      'A small mixed crew of tradesmen gather around a rough plywood bench used as a desk. One man in a company shirt and vest and another in more casual but dirty work clothes stand across from a crew leader with a notebook and a cheap calculator. Their hands and clothes show dust, grime, and wear. Around them are tools, pallets, and a partially built structure, giving the sense of employees and subcontractors sorting out work and pay together.';
  } else if (lowerTitle.includes('ai ') || lowerTitle.includes('adam by tyms')) {
    scene =
      'A crew owner in worn work pants and a faded flannel shirt sits at a cramped corner desk inside a small shop office. The desk is piled with receipts, notebooks, and bank statements, with a plain laptop open beside them. The owner leans over the papers, hands dusty and tired, thinking through the numbers. The walls are imperfect, with taped notes and a few tools or gear hanging nearby, clearly part of a working crew space, not a polished corporate office.';
  } else {
    scene =
      'A small blue collar construction crew of mostly men gathered around a foreman on a dusty jobsite, talking through hours and payroll at a folding table. The ground is rough with mud and debris, with tools and materials scattered around, and everyone looks like they have been working hard all day.';
  }

  const style =
    'Ultra realistic IMAX-level cinematic photograph. Shot on a modern digital cinema camera with wide, immersive framing and rich dynamic range. Natural, believable lighting in real-world conditions, with honest shadows and contrast, whether cloudy daylight, harsh afternoon sun, or early evening. A small blue collar crew, mostly men in their 20s to 50s, captured mid-shift or at the end of the day. Clothing clearly shows hard work: scuffed boots, worn work pants, sweat marks, dust, mud, and grime on fabric and hands. The environment is gritty and lived-in with tools, materials, cords, pallets, mud or dust on the ground, coffee cups and small clutter, nothing polished or staged. People are caught mid-task or mid-conversation, not looking at the camera, with real, hard-working expressions.';

  // FINAL IMAGE PROMPT (no title, no SEO / alt content for Nano Banana)
  const prompt = `${style}  ${scene}`;

  // ALT TEXT: short, generic, derived from title/description.
  const alt = buildAltFromTitle({ slug, title, description });

  return { prompt, alt };
}

async function main() {
  if (!fs.existsSync(blogDir)) {
    console.error(`Blog directory not found: ${blogDir}`);
    process.exit(1);
  }

  const existing = safeReadJson(promptsFile);
  const files = fs.readdirSync(blogDir).filter((f) => f.endsWith('.md'));

  console.log('Found %d blog articles. Generating hero prompts...', files.length);

  const updated = { ...existing };
  let createdCount = 0;

  for (const file of files) {
    const slug = path.basename(file, '.md');
    const fullPath = path.join(blogDir, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const fm = matter(raw);
    const data = fm.data || {};
    const title = data.title || slug;
    const description = data.description || '';

    const { prompt, alt } = buildPromptAndAlt({ slug, title, description });

    // Update JSON store (used by the image agent)
    updated[slug] = {
      prompt,
      alt,
      title,
      lastUpdated: new Date().toISOString(),
    };
    createdCount++;

    console.log(`  Prompt stored for "${slug}".`);
  }

  fs.mkdirSync(path.dirname(promptsFile), { recursive: true });
  fs.writeFileSync(promptsFile, JSON.stringify(updated, null, 2), 'utf8');

  console.log();
  console.log(
    `Hero prompt generation complete. Prompts created/updated for ${createdCount} article(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
