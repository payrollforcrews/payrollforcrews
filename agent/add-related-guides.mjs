import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CONTENT_PLAN_PATH = path.join(ROOT, "config", "content-plan.json");
const BLOG_DIR = path.join(ROOT, "src", "content", "blog");

async function main() {
  const raw = await fs.readFile(CONTENT_PLAN_PATH, "utf8");
  const plan = JSON.parse(raw);

  const items = plan.items || [];
  const itemsBySlug = new Map(items.map((item) => [item.slug, item]));

  const pillars = plan.pillars || [];
  if (pillars.length === 0) {
    console.error("No pillars found in config/content-plan.json");
    process.exit(1);
  }

  for (const pillar of pillars) {
    const postSlugs = pillar.postSlugs || [];
    const hubSlugs = pillar.hubSlugs || [];

    for (const slug of postSlugs) {
      const mdPath = path.join(BLOG_DIR, `${slug}.md`);

      let md;
      try {
        md = await fs.readFile(mdPath, "utf8");
      } catch (err) {
        console.warn(`Skipping ${slug} - markdown file not found at ${mdPath}`);
        continue;
      }

      // If it already has a Related guides section, skip
      if (/^##\s+Related guides/im.test(md)) {
        console.log(`Skipping ${slug} - already has Related guides section`);
        continue;
      }

      // Build related slugs: all hubs in this pillar (except self), plus one sibling
      const relatedSlugs = [];

      // add all hub posts in this pillar, except self
      for (const hubSlug of hubSlugs) {
        if (hubSlug !== slug && !relatedSlugs.includes(hubSlug)) {
          relatedSlugs.push(hubSlug);
        }
      }

      // add one sibling from this pillar
      for (const sibling of postSlugs) {
        if (sibling === slug) continue;
        if (relatedSlugs.includes(sibling)) continue;
        relatedSlugs.push(sibling);
        break; // only one sibling for now
      }

      if (relatedSlugs.length === 0) {
        console.log(`No related slugs found for ${slug}, skipping`);
        continue;
      }

      const lines = [];
      lines.push("");
      lines.push("## Related guides");
      lines.push("");

      for (const related of relatedSlugs) {
        const item = itemsBySlug.get(related);
        const title = item && item.title ? item.title : related;
        lines.push(`- [${title}](/blog/${related}/)`);
      }

      lines.push("");

      const updated = md.trimEnd() + "\n\n" + lines.join("\n") + "\n";
      await fs.writeFile(mdPath, updated, "utf8");

      console.log(`Updated ${slug} with Related guides section`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});