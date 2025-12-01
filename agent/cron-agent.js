// agent/cron-agent.js
// Fully unattended SEO maintenance loop for payrollforcrews

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

// 2) Run SEO refresh (uses your existing agent scripts + OpenAI key)
if (!tryRun('npm run seo:refresh')) {
  console.error('Aborting: seo:refresh failed.');
  process.exit(1);
}

// 3) Run Astro build to be sure site still compiles
if (!tryRun('npm run build')) {
  console.error('Aborting: build failed, not committing anything.');
  process.exit(1);
}

// 4) Check for changes
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

// 5) Stage and commit everything the SEO scripts changed
// This is intentionally broad: it grabs content + key config.
tryRun('git add src/content/blog config/keyword-map.json config/content-plan.json');

// 6) Commit
if (!tryRun('git commit -m "Automated SEO refresh (cron agent)"')) {
  console.error('Aborting: git commit failed.');
  process.exit(1);
}

// 7) Push to main
if (!tryRun('git push origin main')) {
  console.error('Push failed. Manual check may be needed.');
  process.exit(1);
}

console.log('\n=== Payroll for Crews cron agent finished successfully ===');
process.exit(0);