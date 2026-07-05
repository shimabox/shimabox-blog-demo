/**
 * コンテンツをR2に同期するスクリプト（本番専用）
 *
 * 使い方:
 *   npm run sync                                 # 本番R2に全て同期
 *   npm run sync -- slug-name                    # 本番R2に指定slugのみ同期
 *   npm run sync:delete                          # `/content` 以下を正としてR2を同期（※ADMIN_KEY必須）
 *   npm run sync -- --posts-only                 # 記事・ページのみ同期（画像除く）
 *   npm run sync -- --posts-only --delete        # 記事・ページのみ同期 + 削除
 *   npm run sync -- --delete-paths path1 path2  # 本番R2から指定パスを削除
 *
 * 環境変数:
 *   ADMIN_KEY  - --delete時に必須（/api/r2-list認証用）
 *   SITE_URL   - --delete時に必須（/api/r2-list認証用）
 *
 * シェルインジェクション対策:
 *   wrangler コマンドの実行には execFileSync を使用し、シェルを経由せず
 *   argv 配列としてそのまま渡している（shell: false）。そのため引用符や
 *   `;` `|` `` ` `` などの特殊文字を含むパス（日本語ファイル名を含む）も
 *   構造的に安全に扱え、危険文字のブラックリスト検査は不要。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// TODO: wrangler.toml の bucket_name と同じ値に変更してください
const BUCKET = "your-blog-content";
const CONTENT_DIR = "./content";

// TODO: wrangler.toml の SITE_URL と同じ値に変更してください
const SITE_URL = process.env.SITE_URL;
const ADMIN_KEY = process.env.ADMIN_KEY;

const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const postsOnly = args.includes("--posts-only");
const deletePathsIndex = args.indexOf("--delete-paths");
const deletePaths =
  deletePathsIndex !== -1 ? args.slice(deletePathsIndex + 1) : [];
const targetSlug = args.find((arg) => !arg.startsWith("-"));

// 同期対象外のファイル
const IGNORE_FILES = [".DS_Store", "Thumbs.db", ".gitkeep"];

function shouldIgnore(filename: string): boolean {
  return IGNORE_FILES.includes(filename);
}

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
  // 除外ファイルをスキップ
  const filename = remotePath.split("/").pop() || "";
  if (shouldIgnore(filename)) {
    return false;
  }

  try {
    execFileSync(
      "npx",
      [
        "wrangler",
        "r2",
        "object",
        "put",
        `${BUCKET}/${remotePath}`,
        "--file",
        localPath,
        "--remote",
      ],
      { stdio: "pipe", shell: false },
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
    execFileSync(
      "npx",
      [
        "wrangler",
        "r2",
        "object",
        "delete",
        `${BUCKET}/${remotePath}`,
        "--remote",
      ],
      { stdio: "pipe", shell: false },
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

  // 画像（--posts-only時はスキップ）
  if (!postsOnly) {
    console.log("\n🖼️  Syncing images...");
    const imagesDir = join(CONTENT_DIR, "images");
    if (existsSync(imagesDir)) {
      total += syncImagesRecursive(imagesDir, "images");
    }
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

async function listR2Objects(prefix?: string): Promise<string[]> {
  if (!ADMIN_KEY || !SITE_URL) {
    console.error(
      "❌ ADMIN_KEY and SITE_URL environment variables are required for --delete",
    );
    console.error("   Set them via:");
    console.error("     export SITE_URL=https://your-blog-name.pages.dev");
    console.error("     export ADMIN_KEY=your-admin-key");
    return [];
  }

  try {
    const url = new URL("/api/r2-list", SITE_URL);
    if (prefix) {
      url.searchParams.set("prefix", prefix);
    }

    const response = await fetch(url.toString(), {
      headers: {
        "X-Admin-Key": ADMIN_KEY,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error("❌ Unauthorized: ADMIN_KEY is invalid");
      } else {
        console.error(`❌ Failed to list R2 objects: ${response.status}`);
      }
      return [];
    }

    const data = (await response.json()) as { objects: string[] };
    return data.objects;
  } catch (error) {
    console.error("Failed to list R2 objects:", error);
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

  // --posts-only時は画像をスキップ
  if (!postsOnly) {
    const imagesDir = join(CONTENT_DIR, "images");
    if (existsSync(imagesDir)) {
      collectImagesRecursive(imagesDir, "images", files);
    }
  }

  return files;
}

function collectImagesRecursive(
  dir: string,
  prefix: string,
  files: Set<string>,
) {
  for (const file of readdirSync(dir)) {
    // 除外ファイルをスキップ
    if (shouldIgnore(file)) {
      continue;
    }

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

  // --posts-only時はposts/とpages/のみ取得
  let r2Objects: string[];
  if (postsOnly) {
    const posts = await listR2Objects("posts/");
    const pages = await listR2Objects("pages/");
    r2Objects = [...posts, ...pages];
  } else {
    r2Objects = await listR2Objects();
  }

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

          // optimize-images.ts が生成する <basename>-thumb.webp も同期
          const ext = img.match(/\.[^.]+$/)?.[0] ?? "";
          const base = img.slice(0, img.length - ext.length);
          const thumbRel = `${base}-thumb.webp`;
          const thumbPath = join(CONTENT_DIR, "images", thumbRel);
          if (existsSync(thumbPath)) {
            if (syncFile(thumbPath, `images/${thumbRel}`)) total++;
          }
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
