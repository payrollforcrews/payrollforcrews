#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import sharp from 'sharp';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env from project root
dotenv.config({ path: path.join(rootDir, '.env') });

const KIE_API_KEY = process.env.KIE_API_KEY;

if (!KIE_API_KEY) {
  console.error('KIE_API_KEY is not set. Add it to your .env file.');
  process.exit(1);
}

const BLOG_DIR = path.join(rootDir, 'src', 'content', 'blog');
const PROMPTS_FILE = path.join(rootDir, 'config', 'hero-prompts.json');
const HERO_DIR = path.join(rootDir, 'src', 'assets', 'blog');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadPrompts() {
  if (!fs.existsSync(PROMPTS_FILE)) {
    console.error(`Hero prompts file not found: ${PROMPTS_FILE}`);
    console.error('Run: npm run hero:prompts');
    process.exit(1);
  }

  const raw = fs.readFileSync(PROMPTS_FILE, 'utf8').trim();
  if (!raw) {
    console.error(`Hero prompts file is empty: ${PROMPTS_FILE}`);
    process.exit(1);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('Could not parse hero-prompts.json as JSON.');
    console.error(err);
    process.exit(1);
  }
}

function loadSlugs() {
  if (!fs.existsSync(BLOG_DIR)) {
    console.error(`Blog directory not found: ${BLOG_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    console.error(`No blog markdown files found in: ${BLOG_DIR}`);
    process.exit(1);
  }

  return files.map((file) => path.basename(file, '.md'));
}

async function createKieTask(prompt) {
  const url = 'https://api.kie.ai/api/v1/jobs/createTask';

  const body = {
    model: 'nano-banana-pro',
    input: {
      prompt,
      image_input: [],
      aspect_ratio: '3:2',
      resolution: '1K',
      // KIE docs show "png" as a valid option.
      output_format: 'png',
    },
  };

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    const data = res.data;

    if (data?.code !== 200) {
      console.error(
        `  KIE createTask returned non-200 code (${data?.code}). Raw response: ${JSON.stringify(
          data
        )}`
      );
      return null;
    }

    let taskId = null;

    // Some KIE responses use data.taskId, some just data as a string
    if (data.data) {
      if (typeof data.data === 'string') {
        taskId = data.data;
      } else if (typeof data.data === 'object' && data.data.taskId) {
        taskId = data.data.taskId;
      }
    }

    if (!taskId) {
      console.error(
        `  KIE createTask did not return a taskId. Raw response: ${JSON.stringify(data)}`
      );
      return null;
    }

    console.log(`  KIE task created: ${taskId}`);
    return taskId;
  } catch (err) {
    console.error(`  Error calling KIE createTask: ${err.message}`);
    return null;
  }
}

async function pollKieTask(taskId) {
  const url = 'https://api.kie.ai/api/v1/jobs/recordInfo';
  const maxAttempts = 40;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await axios.get(url, {
        params: { taskId },
        headers: {
          Authorization: `Bearer ${KIE_API_KEY}`,
        },
        timeout: 60000,
      });

      const data = res.data;

      if (data?.code !== 200) {
        console.error(
          `  KIE recordInfo returned non-200 code (${data?.code}). Raw response: ${JSON.stringify(
            data
          )}`
        );
        return null;
      }

      const record = data.data;
      if (!record) {
        console.log(`  [${attempt}/${maxAttempts}] No record data yet. Waiting...`);
        await sleep(delayMs);
        continue;
      }

      const state = record.state;
      console.log(`  [${attempt}/${maxAttempts}] State = ${state}`);

      if (state === 'success') {
        if (!record.resultJson) {
          console.error('  recordInfo success but resultJson is missing.');
          return null;
        }

        let parsed;
        try {
          parsed = JSON.parse(record.resultJson);
        } catch (err) {
          console.error('  Could not parse resultJson as JSON.');
          console.error(err);
          return null;
        }

        const urls = parsed?.resultUrls;
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          console.error('  No resultUrls found in resultJson.');
          return null;
        }

        return urls;
      }

      if (state === 'fail') {
        console.error(
          `  KIE task failed. failCode=${record.failCode || ''}, failMsg=${
            record.failMsg || ''
          }`
        );
        return null;
      }

      // waiting / queuing / generating
      await sleep(delayMs);
    } catch (err) {
      console.error(`  Error calling KIE recordInfo: ${err.message}`);
      await sleep(delayMs);
    }
  }

  console.error('  Timed out waiting for KIE task to complete.');
  return null;
}

async function downloadAndSaveImage(imageUrl, slug) {
  fs.mkdirSync(HERO_DIR, { recursive: true });

  const heroPath = path.join(HERO_DIR, `${slug}-hero.webp`);

  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  const buffer = Buffer.from(response.data);

  // Convert whatever KIE returns (png/jpg) into a WebP hero asset for Astro
  await sharp(buffer)
    .webp({ quality: 82 })
    .toFile(heroPath);

  const stat = fs.statSync(heroPath);
  console.log(
    `  Saved hero image to ${path.relative(rootDir, heroPath)} (${(
      stat.size / 1024
    ).toFixed(1)} KB)`
  );
}

async function main() {
  const force = process.argv.includes('--force');

  const slugs = loadSlugs();
  const promptsMap = loadPrompts();

  fs.mkdirSync(HERO_DIR, { recursive: true });

  console.log(
    `Found ${slugs.length} blog articles. Generating hero images${
      force ? ' (force mode)' : ''
    }...`
  );

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of slugs) {
    const heroPath = path.join(HERO_DIR, `${slug}-hero.webp`);

    if (!force && fs.existsSync(heroPath)) {
      console.log(`Skipping "${slug}", hero image already exists.`);
      skipped++;
      continue;
    }

    const promptConfig = promptsMap[slug];
    if (!promptConfig || !promptConfig.prompt) {
      console.log(`Skipping "${slug}", no prompt found in hero-prompts.json.`);
      failed++;
      continue;
    }

    console.log();
    console.log(`Generating hero image for slug "${slug}"...`);
    console.log(`  Prompt: ${promptConfig.prompt}`);

    const taskId = await createKieTask(promptConfig.prompt);
    if (!taskId) {
      console.log(`  Failed to create KIE task for "${slug}".`);
      failed++;
      continue;
    }

    const urls = await pollKieTask(taskId);
    if (!urls || urls.length === 0) {
      console.log(`  No image URLs returned for "${slug}".`);
      failed++;
      continue;
    }

    const imageUrl = urls[0];

    try {
      await downloadAndSaveImage(imageUrl, slug);
      generated++;
    } catch (err) {
      console.error(`  Error saving hero image for "${slug}": ${err.message}`);
      failed++;
    }
  }

  console.log();
  console.log(
    `Hero image generation complete. Generated ${generated}, skipped ${skipped}, failed ${failed}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
