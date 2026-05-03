/**
 * 記事一覧サムネ用の WebP 縮小版（*-thumb.webp）を生成するスクリプト
 *
 * 使い方:
 *   npm run optimize-images                  # 全件（未生成 / 元画像のほうが新しいものだけ）
 *   npm run optimize-images -- slug          # 特定slugの記事のサムネのみ
 *   npm run optimize-images -- slug --force  # 特定slugを強制再生成
 *   npm run optimize-images:force            # 全件強制再生成
 *
 * 仕様:
 *   - content/posts/*.md と content/pages/*.md の frontmatter `image:` を読む
 *   - 一覧サムネとして使われる画像のみを対象に <basename>-thumb.webp を生成
 *     （本文中画像や OGP は対象外）
 *   - 320x320 max（retinaで80px表示の4倍）, fit: "inside", quality 78
 *   - 元の縦横比は維持。CSS の object-fit:cover で表示時にトリミングされる
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, parse } from "node:path";
import sharp from "sharp";
import { parseFrontmatter } from "../src/markdown";

const CONTENT_DIR = "./content";
const POSTS_DIR = join(CONTENT_DIR, "posts");
const PAGES_DIR = join(CONTENT_DIR, "pages");
const IMAGES_DIR = join(CONTENT_DIR, "images");
const THUMB_MAX = 320;
const QUALITY = 78;

const targetSlug = process.argv[2];
const force = process.argv.includes("--force");

interface Result {
  src: string;
  thumb: string;
  srcSize: number;
  thumbSize: number;
  generated: boolean;
}

/**
 * frontmatter `image:` に書かれた `/images/foo.png` を
 * ローカル絶対パス `content/images/foo.png` に変換
 */
function resolveImagePath(imageUrl: string): string | null {
  if (!imageUrl) return null;
  const m = imageUrl.match(/^\/images\/(.+)$/);
  if (!m) return null;
  return join(IMAGES_DIR, m[1]);
}

/**
 * content/posts と content/pages から frontmatter image: を集める
 * slug が指定された場合は該当記事のみに絞り込む
 */
function collectThumbnailImages(slug?: string): string[] {
  const paths = new Set<string>();
  let matchedSlug = false;
  for (const dir of [POSTS_DIR, PAGES_DIR]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const raw = readFileSync(join(dir, file), "utf-8");
      const meta = parseFrontmatter(raw);
      if (slug && meta.slug !== slug) continue;
      if (slug) matchedSlug = true;
      const local = resolveImagePath(meta.image);
      if (local && existsSync(local)) {
        paths.add(local);
      } else if (meta.image) {
        console.warn(`⚠️  Image not found: ${meta.image} (in ${file})`);
      }
    }
  }
  if (slug && !matchedSlug) {
    console.warn(`⚠️  No post/page found with slug: ${slug}`);
  }
  return [...paths];
}

async function processFile(filePath: string): Promise<Result | null> {
  const { dir, name, ext } = parse(filePath);
  if (!/\.(jpe?g|png)$/i.test(ext)) return null;

  const stat = statSync(filePath);
  const thumbPath = join(dir, `${name}-thumb.webp`);

  if (!force && existsSync(thumbPath)) {
    const thumbStat = statSync(thumbPath);
    if (thumbStat.mtime >= stat.mtime) {
      return {
        src: filePath,
        thumb: thumbPath,
        srcSize: stat.size,
        thumbSize: thumbStat.size,
        generated: false,
      };
    }
  }

  await sharp(filePath)
    .resize(THUMB_MAX, THUMB_MAX, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY })
    .toFile(thumbPath);

  const thumbStat = statSync(thumbPath);
  return {
    src: filePath,
    thumb: thumbPath,
    srcSize: stat.size,
    thumbSize: thumbStat.size,
    generated: true,
  };
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

async function main() {
  const start = Date.now();
  // slug 引数（位置引数）。"--force" は除外
  const slug = targetSlug && targetSlug !== "--force" ? targetSlug : undefined;
  const targets = collectThumbnailImages(slug);
  if (slug) {
    console.log(`Slug: ${slug}`);
  }
  console.log(`Found ${targets.length} thumbnail image(s) in frontmatter\n`);

  let generated = 0;
  let skipped = 0;
  let totalSrc = 0;
  let totalThumb = 0;

  for (const file of targets) {
    const r = await processFile(file);
    if (!r) continue;
    totalSrc += r.srcSize;
    totalThumb += r.thumbSize;
    if (r.generated) {
      generated++;
      console.log(
        `✅ ${r.thumb.replace(`${IMAGES_DIR}/`, "")} (${fmt(r.srcSize)} → ${fmt(r.thumbSize)})`,
      );
    } else {
      skipped++;
    }
  }

  const ratio = totalSrc > 0 ? ((totalThumb / totalSrc) * 100).toFixed(1) : "0";
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\nGenerated: ${generated}, up-to-date: ${skipped}, in ${elapsed}s`,
  );
  console.log(
    `Total: src ${fmt(totalSrc)} → thumb ${fmt(totalThumb)} (${ratio}%)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
