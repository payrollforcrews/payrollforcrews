import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const blogDir = path.join(rootDir, 'src', 'content', 'blog');

function splitFrontmatter(content) {
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  const lines = content.split('\n');
  if (lines[0].trim() !== '---') {
    return { frontmatter: null, body: content };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { frontmatter: null, body: content };
  }

  const frontmatter = lines.slice(0, endIdx + 1).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  return { frontmatter, body };
}

function stripHeroFields(frontmatter) {
  const lines = frontmatter.split('\n');

  const kept = lines.filter((line) => {
    const t = line.trim();
    if (t.startsWith('heroImage:')) return false;
    if (t.startsWith('heroAlt:')) return false;
    return true;
  });

  return kept.join('\n');
}

async function main() {
  if (!fs.existsSync(blogDir)) {
    console.error('Blog directory not found:', blogDir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(blogDir)
    .filter((f) => f.toLowerCase().endsWith('.md'));

  if (!files.length) {
    console.log('No markdown files found in', blogDir);
    return;
  }

  console.log(`Stripping heroImage/heroAlt from ${files.length} articles...\n`);

  for (const file of files) {
    const fullPath = path.join(blogDir, file);
    const slug = path.basename(file, '.md');

    const content = fs.readFileSync(fullPath, 'utf8');
    const { frontmatter, body } = splitFrontmatter(content);

    if (!frontmatter) {
      console.log(`- ${slug}: no frontmatter, skipped.`);
      continue;
    }

    const newFrontmatter = stripHeroFields(frontmatter);
    const newContent = `${newFrontmatter}\n${body.replace(/^\n+/, '')}`;

    fs.writeFileSync(fullPath, newContent, 'utf8');
    console.log(`- ${slug}: heroImage/heroAlt removed.`);
  }

  console.log('\nDone. All blog posts now have no heroImage / heroAlt in frontmatter.');
}

main().catch((err) => {
  console.error('Fatal error in hero-strip:', err);
  process.exit(1);
});
