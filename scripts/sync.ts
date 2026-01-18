/**
 * コンテンツをR2に同期するスクリプト（本番専用）
 *
 * 使い方:
 *   npm run sync               # 本番R2に全て同期
 *   npm run sync -- slug-name  # 本番R2に指定slugのみ同期
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// TODO: wrangler.toml の bucket_name と同じ値に変更してください
const BUCKET = "shimabox-blog-demo";
const CONTENT_DIR = "./content";

const targetSlug = process.argv.find(
  (arg) =>
    !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1],
);

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function syncFile(localPath: string, remotePath: string): boolean {
  try {
    execSync(
      `npx wrangler r2 object put ${BUCKET}/${remotePath} --file="${localPath}" --remote`,
      { stdio: "pipe" },
    );
    console.log(`✅ ${remotePath}`);
    return true;
  } catch {
    console.error(`❌ Failed: ${remotePath}`);
    return false;
  }
}

function getSlugFromFile(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(/^slug:\s*["']?([^"'\n]+)["']?$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getDateFromFile(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(/^date:\s*["']?([^"'\n]+)["']?$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function syncAll() {
  let total = 0;

  // 記事
  console.log("📝 Syncing posts...");
  const postsDir = join(CONTENT_DIR, "posts");
  if (existsSync(postsDir)) {
    for (const file of readdirSync(postsDir).filter((f) => f.endsWith(".md"))) {
      if (syncFile(join(postsDir, file), `posts/${file}`)) total++;
    }
  }

  // 固定ページ
  console.log("\n📄 Syncing pages...");
  const pagesDir = join(CONTENT_DIR, "pages");
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir).filter((f) => f.endsWith(".md"))) {
      if (syncFile(join(pagesDir, file), `pages/${file}`)) total++;
    }
  }

  // 画像
  console.log("\n🖼️  Syncing images...");
  const imagesDir = join(CONTENT_DIR, "images");
  if (existsSync(imagesDir)) {
    total += syncImagesRecursive(imagesDir, "images");
  }

  return total;
}

function syncImagesRecursive(dir: string, prefix: string): number {
  let count = 0;
  for (const file of readdirSync(dir)) {
    const fullPath = join(dir, file);
    const remotePath = `${prefix}/${file}`;

    if (statSync(fullPath).isDirectory()) {
      count += syncImagesRecursive(fullPath, remotePath);
    } else {
      if (syncFile(fullPath, remotePath)) count++;
    }
  }
  return count;
}

async function syncBySlug(slug: string) {
  let total = 0;

  // 記事を探す
  console.log(`🔍 Finding files for slug: ${slug}\n`);

  let foundPost: { file: string; date: string | null } | null = null;

  // posts から検索
  const postsDir = join(CONTENT_DIR, "posts");
  if (existsSync(postsDir)) {
    for (const file of readdirSync(postsDir).filter((f) => f.endsWith(".md"))) {
      const filePath = join(postsDir, file);
      const fileSlug = getSlugFromFile(filePath);
      if (fileSlug === slug) {
        foundPost = { file, date: getDateFromFile(filePath) };
        console.log("📝 Post:");
        if (syncFile(filePath, `posts/${file}`)) total++;
        break;
      }
    }
  }

  // pages から検索
  if (!foundPost) {
    const pagesDir = join(CONTENT_DIR, "pages");
    if (existsSync(pagesDir)) {
      for (const file of readdirSync(pagesDir).filter((f) =>
        f.endsWith(".md"),
      )) {
        const filePath = join(pagesDir, file);
        const fileSlug = getSlugFromFile(filePath);
        if (fileSlug === slug) {
          foundPost = { file, date: getDateFromFile(filePath) };
          console.log("📄 Page:");
          if (syncFile(filePath, `pages/${file}`)) total++;
          break;
        }
      }
    }
  }

  if (!foundPost) {
    console.log(`❌ No post/page found with slug: ${slug}`);
    return 0;
  }

  // OGP 画像を同期
  const ogpDir = join(CONTENT_DIR, "images/ogp");
  if (existsSync(ogpDir)) {
    const ogpFiles = readdirSync(ogpDir).filter((f) => f.includes(slug));
    if (ogpFiles.length > 0) {
      console.log("\n🖼️  OGP:");
      for (const file of ogpFiles) {
        if (syncFile(join(ogpDir, file), `images/ogp/${file}`)) total++;
      }
    }
  }

  // 記事内で参照されている画像を同期
  const postPath = foundPost.file.startsWith("posts/")
    ? join(CONTENT_DIR, foundPost.file)
    : join(postsDir, foundPost.file);

  try {
    const content = readFileSync(
      existsSync(postPath)
        ? postPath
        : join(CONTENT_DIR, "pages", foundPost.file),
      "utf-8",
    );

    // /images/... のパスを抽出
    const imageMatches = content.matchAll(/\/images\/([^\s)"']+)/g);
    const images = [...new Set([...imageMatches].map((m) => m[1]))];

    if (images.length > 0) {
      console.log("\n🖼️  Referenced images:");
      for (const img of images) {
        const imgPath = join(CONTENT_DIR, "images", img);
        if (existsSync(imgPath)) {
          if (syncFile(imgPath, `images/${img}`)) total++;
        } else {
          console.log(`   ⚠️  Not found: ${img}`);
        }
      }
    }
  } catch {
    // ignore
  }

  return total;
}

async function main() {
  const startTime = Date.now();

  console.log("Syncing to R2 (production)...\n");

  let total: number;

  if (targetSlug) {
    total = await syncBySlug(targetSlug);
  } else {
    total = await syncAll();
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n✅ Total: ${total} files synced in ${formatTime(totalTime)}`);
}

main().catch(console.error);
