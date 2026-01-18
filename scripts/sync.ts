/**
 * コンテンツをR2に同期するスクリプト（本番専用）
 *
 * 使い方:
 *   npm run sync                                 # 本番R2に全て同期
 *   npm run sync -- slug-name                    # 本番R2に指定slugのみ同期
 *   npm run sync -- --delete                     # 本番R2に全て同期 + R2から削除されたファイルを削除
 *   npm run sync -- --delete-paths path1 path2  # 本番R2から指定パスを削除
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// TODO: wrangler.toml の bucket_name と同じ値に変更してください
const BUCKET = "shimabox-blog-demo";
const CONTENT_DIR = "./content";

const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const deletePathsIndex = args.indexOf("--delete-paths");
const deletePaths =
  deletePathsIndex !== -1 ? args.slice(deletePathsIndex + 1) : [];
const targetSlug = args.find((arg) => !arg.startsWith("-"));

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

function deleteFile(remotePath: string): boolean {
  try {
    execSync(
      `npx wrangler r2 object delete "${BUCKET}/${remotePath}" --remote`,
      { stdio: "pipe" },
    );
    console.log(`🗑️  Deleted: ${remotePath}`);
    return true;
  } catch {
    console.error(`❌ Failed to delete: ${remotePath}`);
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

function listR2Objects(prefix?: string): string[] {
  try {
    const command = prefix
      ? `npx wrangler r2 object list ${BUCKET} --prefix="${prefix}" --remote`
      : `npx wrangler r2 object list ${BUCKET} --remote`;

    const output = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const objects: string[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      const match = line.match(/^Key:\s+(.+)$/);
      if (match) {
        objects.push(match[1]);
      }
    }

    return objects;
  } catch {
    console.error("Failed to list R2 objects");
    return [];
  }
}

function getLocalFiles(): Set<string> {
  const files = new Set<string>();

  const postsDir = join(CONTENT_DIR, "posts");
  if (existsSync(postsDir)) {
    for (const file of readdirSync(postsDir).filter((f) => f.endsWith(".md"))) {
      files.add(`posts/${file}`);
    }
  }

  const pagesDir = join(CONTENT_DIR, "pages");
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir).filter((f) => f.endsWith(".md"))) {
      files.add(`pages/${file}`);
    }
  }

  const imagesDir = join(CONTENT_DIR, "images");
  if (existsSync(imagesDir)) {
    collectImagesRecursive(imagesDir, "images", files);
  }

  return files;
}

function collectImagesRecursive(
  dir: string,
  prefix: string,
  files: Set<string>,
) {
  for (const file of readdirSync(dir)) {
    const fullPath = join(dir, file);
    const remotePath = `${prefix}/${file}`;

    if (statSync(fullPath).isDirectory()) {
      collectImagesRecursive(fullPath, remotePath, files);
    } else {
      files.add(remotePath);
    }
  }
}

async function deleteOrphanedFiles() {
  console.log("🔍 Checking for orphaned files in R2...\n");

  const r2Objects = listR2Objects();
  if (r2Objects.length === 0) {
    console.log("No objects found in R2.");
    return 0;
  }

  console.log(`Found ${r2Objects.length} objects in R2`);

  const localFiles = getLocalFiles();
  console.log(`Found ${localFiles.size} files locally\n`);

  let deletedCount = 0;
  for (const r2Path of r2Objects) {
    if (!localFiles.has(r2Path)) {
      console.log(`🗑️  Orphaned: ${r2Path}`);
      if (deleteFile(r2Path)) {
        deletedCount++;
      }
    }
  }

  if (deletedCount === 0) {
    console.log("No orphaned files found.");
  } else {
    console.log(`\n✅ Deleted ${deletedCount} orphaned files`);
  }

  return deletedCount;
}

async function deleteSpecificPaths(paths: string[]) {
  console.log(`🗑️ Deleting ${paths.length} files from R2...\n`);
  let deletedCount = 0;
  for (const path of paths) {
    if (deleteFile(path)) {
      deletedCount++;
    }
  }
  console.log(`\n✅ Deleted ${deletedCount} files`);
  return deletedCount;
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

  // --delete-paths が指定された場合は削除のみ実行
  if (deletePaths.length > 0) {
    await deleteSpecificPaths(deletePaths);
    return;
  }

  console.log("Syncing to R2 (production)...\n");

  let total: number;

  if (targetSlug) {
    total = await syncBySlug(targetSlug);
  } else {
    total = await syncAll();
  }

  // --delete が指定された場合は削除処理も実行
  if (shouldDelete) {
    console.log("\n");
    await deleteOrphanedFiles();
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n✅ Total: ${total} files synced in ${formatTime(totalTime)}`);
}

main().catch(console.error);
