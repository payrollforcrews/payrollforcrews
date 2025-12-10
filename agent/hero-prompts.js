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
 * Small pool of visual styles so images feel related but not identical.
 * We pick one per slug in a deterministic way.
 */
const STYLE_TEMPLATES = [
  'Ultra realistic photograph with soft overcast daylight on an active construction site. Wide framing with natural colors, gritty textures, dust and mud visible, nothing staged or glossy.',
  'Ultra realistic photograph inside a cramped construction office with warm lamplight and window light mixed. Medium framing, shallow depth of field, paperwork and tools around the edges, nothing corporate.',
  'Ultra realistic photograph in a shop or warehouse workspace lit by cool fluorescent lights. Slightly high contrast, concrete floors, metal shelves and extension cords in the background, documentary feel.',
  'Ultra realistic photograph at sunrise or sunset on or near a jobsite. Long shadows, warm low angle light, sky visible in the distance, quiet moment between tasks.',
  'Ultra realistic photograph in a break area or corner table where crew members talk through work. Mixed lighting, coffee cups, clipboards and worn jackets in the scene.'
];

function hashSlug(slug) {
  let sum = 0;
  for (let i = 0; i < slug.length; i++) {
    sum += slug.charCodeAt(i);
  }
  return sum;
}

function pickStyleForSlug(slug) {
  if (!slug) return STYLE_TEMPLATES[0];
  const idx = Math.abs(hashSlug(slug)) % STYLE_TEMPLATES.length;
  return STYLE_TEMPLATES[idx];
}

/**
 * Scene is where we make each article feel different.
 * These are slug specific where we know them, with a generic fallback.
 */
function buildScene(slug, title) {
  const lower = (slug || title || '').toLowerCase();

  if (lower.includes('ai-accountant') || lower.includes('adam-by-tyms')) {
    return 'A crew owner in worn work pants and a flannel shirt sits at a cramped shop office desk, using a laptop that shows a clean AI accounting dashboard with simple charts and transaction summaries. Receipts, a small box of papers and a basic calculator surround the laptop, blending hard work with modern software.';
  }

  if (lower.includes('construction-payroll-setup')) {
    return 'A small general contractor owner and a foreman stand at a beat up folding table on a dusty jobsite. A laptop with a simple time tracking screen sits next to a stack of paper time cards and a cheap calculator. Framed house walls and scattered lumber sit in the background while a few workers in worn work clothes move around behind them.';
  }

  if (lower.includes('switching-payroll-mid-year')) {
    return 'Inside a cramped construction office, a tired owner and a bookkeeper sit at a cluttered desk with two thick binders labeled old payroll and new payroll. A wall calendar behind them has a mid year month circled in red while printed pay stubs, sticky notes and a laptop showing a payroll dashboard are scattered across the desk.';
  }

  if (lower.includes('time-tracking-rules-for-foremen')) {
    return 'At the back of a pickup truck parked on a muddy jobsite, a foreman in a worn high vis vest goes over a simple printed list of time tracking rules with a small crew. The list is clipped to a clipboard on the tailgate while workers in dusty gear lean in to listen, with tools and materials scattered around them.';
  }

  if (lower.includes('w2-and-1099')) {
    return 'In a small shop office, a whiteboard is split into two columns labeled W2 and 1099. A crew owner in dusty jeans and a company hoodie stands in front of it with a dry erase marker, explaining pay and tax differences to a mixed group of employees and subcontractors who are still in muddy boots and work jackets.';
  }

  if (lower.includes('certified-payroll-basics')) {
    return 'In a small office, a contractor owner studies a thick government style certified payroll form on a crowded desk. The form is marked with sticky notes and a highlighter, a binder labeled with a public job name sits open, and a corkboard behind them holds a notice about a prevailing wage project.';
  }

  if (lower.includes('job-costing-labor-small-crews')) {
    return 'A small crew owner sits at a rough wooden desk in a shop office, studying a hand drawn job cost sheet with columns for jobs and hours. A laptop with a basic spreadsheet is open beside a stack of invoices and time cards while a hard hat and tape measure sit nearby.';
  }

  if (lower.includes('multi-state-construction-payroll')) {
    return 'Inside a modest office, a contractor owner sits at a desk covered in pay stubs and notebooks while looking at a large paper map of the United States pinned to the wall. Two or three states are highlighted with marker, and a laptop with a payroll portal is open as the owner talks on the phone about multi state rules.';
  }

  if (lower.includes('overtime-mistakes')) {
    return 'A whiteboard in a shop office shows a weekly schedule grid with certain days highlighted for overtime. A frustrated owner and a foreman in worn work gear stand in front of it pointing at overlapping shifts, while work boots, a time clock and a stack of time cards sit on a nearby bench.';
  }

  if (lower.includes('payroll-checklist-pay-period')) {
    return 'On a corkboard in a small office, a simple handwritten checklist titled this pay period is pinned up with boxes for hours, approvals, rates and taxes. A crew owner in dusty clothes checks off items with a pen while glancing at a small stack of time cards and a laptop on a nearby desk.';
  }

  if (lower.includes('switching-from-paper-timesheets')) {
    return 'A contractor owner stands at a workbench with a messy stack of crumpled paper timesheets in one hand and a smartphone in the other that shows a clean time tracking app. A trash can full of old forms sits nearby, with clipboards, pens and dusty gloves scattered across the bench.';
  }

  // Generic fallback for future slugs
  return 'A small crew owner and a foreman review hours and pay at a simple table in a jobsite trailer or shop office, with clipboards, time cards and basic tools visible around them.';
}

function buildPromptAndAlt({ slug, title, description }) {
  const safeTitle = (title || slug || '').trim();
  const style = pickStyleForSlug(slug || safeTitle);
  const scene = buildScene(slug, safeTitle);

  let topicLine = '';
  if (description && description.trim()) {
    topicLine = `The scene should feel like it belongs to an article about ${description.trim()}.`;
  } else if (safeTitle) {
    topicLine = `The scene should feel like it belongs to an article titled "${safeTitle}" for small crew based construction businesses.`;
  }

  const prompt = `${style} ${scene} ${topicLine}`.trim();
  const alt = safeTitle || slug || '';

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

  console.log('Found %d blog articles. Generating hero prompts...', files.length);

  const updated = { ...existing };
  let createdCount = 0;
  let updatedCount = 0;

  for (const file of files) {
    const slug = path.basename(file, '.md');
    const fullPath = path.join(blogDir, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const fm = matter(raw);
    const data = fm.data || {};

    const title = data.title || slug;
    const description = data.description || '';

    const already = existing[slug];
    const { prompt, alt } = buildPromptAndAlt({ slug, title, description });

    const next = {
      prompt,
      alt,
      title,
      lastUpdated: new Date().toISOString()
    };

    if (!already) {
      createdCount++;
    } else if (force || already.prompt !== prompt || already.alt !== alt) {
      updatedCount++;
    }

    updated[slug] = next;
    console.log(`  Updated prompt for "${slug}".`);
  }

  fs.mkdirSync(path.dirname(promptsFile), { recursive: true });
  fs.writeFileSync(promptsFile, JSON.stringify(updated, null, 2), 'utf8');

  console.log();
  console.log(
    `Hero prompt generation complete. Created ${createdCount} and updated ${updatedCount} prompt(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
