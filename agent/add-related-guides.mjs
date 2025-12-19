// agent/add-related-guides.mjs
// Add or refresh a "Related guides" section on each published blog post

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function splitFrontmatter(content) {
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

function buildRelatedList(currentSlug, items) {
  const current = items.find((i) => i.slug === currentSlug);
  if (!current) return [];

  const pillarId = current.pillarId || null;

  // Primary: other published items in the same pillar
  let candidates = items.filter(
    (i) =>
      i.slug !== currentSlug &&
      i.status === 'published' &&
      i.pillarId &&
      pillarId &&
      i.pillarId === pillarId
  );

  // Fallback: if fewer than 3, allow other published items as backup
  if (candidates.length < 3) {
    const backup = items.filter(
      (i) =>
        i.slug !== currentSlug &&
        i.status === 'published' &&
        (!pillarId || i.pillarId !== pillarId)
    );
    candidates = [...candidates, ...backup];
  }

  // Keep first 3 distinct items
  const uniqueBySlug = [];
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    uniqueBySlug.push(c);
    if (uniqueBySlug.length >= 3) break;
  }

  return uniqueBySlug;
}

function applyRelatedSection(mdContent, relatedItems) {
  const { frontmatter, body } = splitFrontmatter(mdContent);
  if (!frontmatter) {
    return null;
  }

  const marker = '## Related guides';
  let baseBody = body;

  const idx = body.indexOf(marker);
  if (idx !== -1) {
    // Strip everything from the existing Related guides heading down
    baseBody = body.slice(0, idx).trimEnd() + '\n\n';
  } else {
    baseBody = body.trimEnd() + '\n\n';
  }

  if (!relatedItems.length) {
    // No related posts, just drop any old section and return the cleaned body
    return `${frontmatter}\n${baseBody}`.trimEnd() + '\n';
  }

  const lines = relatedItems.map((item) => {
    const title = item.title || item.slug;
    return `- [${title}](/blog/${item.slug}/)`;
  });

  const section = `${marker}\n\n${lines.join('\n')}\n`;

  const combined = `${frontmatter}\n${baseBody}${section}`;
  return combined.trimEnd() + '\n';
}

async function main() {
  const contentPlan = readJson('content-plan.json');

  if (!contentPlan || !Array.isArray(contentPlan.items)) {
    console.error('Invalid or missing config/content-plan.json');
    process.exit(1);
  }

  const items = contentPlan.items.filter(
    (item) => item && typeof item.slug === 'string'
  );

  console.log('Running Related guides linker...');

  for (const item of items) {
    if (item.status !== 'published') continue;

    const slug = item.slug;
    const mdPath = path.join(blogDir, `${slug}.md`);

    if (!fs.existsSync(mdPath)) {
      console.warn(`Markdown not found for slug "${slug}", skipping.`);
      continue;
    }

    const relatedItems = buildRelatedList(slug, items);
    if (!relatedItems.length) {
      console.log(`No related slugs found for ${slug}, removing any old Related guides section.`);
      const raw = fs.readFileSync(mdPath, 'utf8');
      const updated = applyRelatedSection(raw, []);
      if (updated) {
        fs.writeFileSync(mdPath, updated, 'utf8');
      }
      continue;
    }

    const raw = fs.readFileSync(mdPath, 'utf8');
    const updated = applyRelatedSection(raw, relatedItems);
    if (!updated) {
      console.warn(`Could not parse frontmatter for ${slug}, leaving file unchanged.`);
      continue;
    }

    fs.writeFileSync(mdPath, updated, 'utf8');
    console.log(`Updated ${slug} with Related guides section`);
  }

  console.log('Related guides linking complete.');
}

main().catch((err) => {
  console.error('Fatal error in add-related-guides.mjs:', err);
  process.exit(1);
});