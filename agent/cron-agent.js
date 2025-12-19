// agent/cron-agent.js
// Fully unattended SEO + content + hero + linking loop for payrollforcrews

import { execSync } from 'node:child_process';

function run(cmd) {
  console.log(`\n>> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function tryRun(cmd) {
  try {
    run(cmd);
    return true;
  } catch (err) {
    console.error(`\n!! Command failed: ${cmd}`);
    console.error(String(err));
    return false;
  }
}

// Always work from the repo root (adjust if you ever move the folder)
process.chdir('C:\\dev\\payrollforcrews');

console.log('=== Payroll for Crews cron agent start ===');

// 1) Pull latest from GitHub
if (!tryRun('git pull origin main')) {
  console.error('Aborting: git pull failed.');
  process.exit(1);
}

// 2) Draft any missing articles for items with status "planned"
//    Safe to run every time. No-ops when there is nothing to draft.
if (!tryRun('node agent/content-draft.js')) {
  console.error('Aborting: content-draft failed.');
  process.exit(1);
}

// 3) Refresh hero prompts and hero images for any posts that need them
//    Uses your existing hero:prompts + hero:generate combo.
if (!tryRun('npm run hero:refresh')) {
  console.error('Aborting: hero:refresh failed.');
  process.exit(1);
}

// 4) Run SEO refresh (Google SERP questions + enrichment)
//    This calls seo-expand then content-enrich, which now use OPENAI_MODEL.
if (!tryRun('npm run seo:refresh')) {
  console.error('Aborting: seo:refresh failed.');
  process.exit(1);
}

// 5) Regenerate Related guides sections so internal linking stays fresh
//    This runs AFTER SEO so Related guides is always the last to touch the body.
if (!tryRun('npm run linking')) {
  console.error('Aborting: linking (add-related-guides) failed.');
  process.exit(1);
}

// 6) Run Astro build to be sure site still compiles
if (!tryRun('npm run build')) {
  console.error('Aborting: build failed, not committing anything.');
  process.exit(1);
}

// 7) Check for changes
let status = '';
try {
  status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
} catch (err) {
  console.error('Could not read git status, aborting.');
  process.exit(1);
}

if (!status) {
  console.log('No changes to commit. Nothing to do.');
  console.log('=== Payroll for Crews cron agent end ===');
  process.exit(0);
}

// 8) Stage everything this loop can reasonably touch:
//    - src/content/blog          (drafts + enrich + related guides)
//    - src/assets/blog           (hero images referenced in frontmatter)
//    - config                    (content-plan, keyword-map, pasf-map, enrich-log, hero config, etc.)
//    - public/_redirects         (affiliate /go links)
if (
  !tryRun(
    'git add src/content/blog src/assets/blog config public/_redirects'
  )
) {
  console.error('Aborting: git add failed.');
  process.exit(1);
}

// 9) Commit
if (!tryRun('git commit -m "Automated content + SEO + hero + linking (cron agent)"')) {
  console.error('Aborting: git commit failed.');
  process.exit(1);
}

// 10) Push to main
if (!tryRun('git push origin main')) {
  console.error('Push failed. Manual check may be needed.');
  process.exit(1);
}

console.log('\n=== Payroll for Crews cron agent finished successfully ===');
process.exit(0);
