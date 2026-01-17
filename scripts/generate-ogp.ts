/**
 * OGP画像を生成するスクリプト
 *
 * 使い方:
 *   npm run generate-ogp          # 全記事のOGP生成
 *   npm run generate-ogp -- slug  # 特定記事のみ
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const POSTS_DIR = "./content/posts";
const PAGES_DIR = "./content/pages";
const OGP_DIR = "./content/images/ogp";
const FONT_PATH = "./fonts/NotoSansJP-Bold.ttf";
// アバター画像（オプション）- 配置するとOGP右下に表示されます
const AVATAR_PATH = "./content/images/avatar.png";

// TODO: サイト情報（wrangler.toml と合わせる）
const SITE_TITLE = "Your Blog Title";
const SITE_DESCRIPTION = "Your blog description";

interface PostMeta {
  title: string;
  slug: string;
  date: string;
  categories: string[];
  image?: string;
  ogpBg?: boolean;
}

function parseFrontmatter(content: string): PostMeta {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { title: "Untitled", slug: "", date: "", categories: [] };

  const frontmatter = match[1];
  const data: Record<string, string> = {};
  let categories: string[] = [];

  for (const line of frontmatter.split("\n")) {
    // カテゴリの配列をパース
    const categoriesMatch = line.match(/^categories:\s*\[(.*)\]$/);
    if (categoriesMatch) {
      categories = categoriesMatch[1]
        .split(",")
        .map((t) => t.trim().replace(/["']/g, ""))
        .filter((t) => t);
      continue;
    }

    const m = line.match(/^(\w+):\s*["']?([^"'\n]+)["']?$/);
    if (m) {
      data[m[1]] = m[2];
    }
  }

  return {
    title: data.title || "Untitled",
    slug: data.slug || "",
    date: data.date || "",
    categories,
    image: data.image,
    ogpBg: data.ogp_bg !== "false",
  };
}

async function generateOgpImage(
  post: PostMeta,
  fontData: Buffer,
  avatarDataUri: string | null,
  bgImageDataUri?: string,
): Promise<Buffer> {
  const isDefault = post.slug === "default";
  const hasCategories = post.categories.length > 0;
  const hasBgImage = !!bgImageDataUri;

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "60px",
          fontFamily: "Noto Sans JP",
          position: "relative",
          ...(hasBgImage
            ? {}
            : {
                background:
                  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
              }),
        },
        children: [
          // 背景画像（ある場合）
          ...(hasBgImage
            ? [
                {
                  type: "img",
                  props: {
                    src: bgImageDataUri,
                    width: 1200,
                    height: 630,
                    style: {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "1200px",
                      height: "630px",
                      objectFit: "cover",
                    },
                  },
                },
                // 暗いオーバーレイ
                {
                  type: "div",
                  props: {
                    style: {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "1200px",
                      height: "630px",
                      background: "rgba(0, 0, 0, 0.6)",
                    },
                  },
                },
              ]
            : []),
          {
            type: "div",
            props: {
              style: {
                fontSize: "52px",
                fontWeight: "bold",
                color: "#ffffff",
                textAlign: "center",
                lineHeight: 1.4,
                maxWidth: "1000px",
                wordBreak: "break-word",
                position: "relative",
              },
              children: post.title,
            },
          },
          {
            type: "div",
            props: {
              style: {
                marginTop: "30px",
                fontSize: "24px",
                color: "rgba(255,255,255,0.7)",
                position: "relative",
              },
              children: post.date,
            },
          },
          // カテゴリを表示
          ...(hasCategories
            ? [
                {
                  type: "div",
                  props: {
                    style: {
                      marginTop: "20px",
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "center",
                      gap: "10px",
                      maxWidth: "1000px",
                      position: "relative",
                    },
                    children: post.categories.map((category) => ({
                      type: "span",
                      props: {
                        style: {
                          padding: "6px 16px",
                          fontSize: "18px",
                          color: "#ffffff",
                          background: "rgba(26, 188, 156, 0.3)",
                          borderRadius: "20px",
                          border: "1px solid rgba(26, 188, 156, 0.6)",
                        },
                        children: category,
                      },
                    })),
                  },
                },
              ]
            : []),
          // 右下にブログ名とアバター
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                bottom: "40px",
                right: "60px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              },
              children: [
                // default以外はテキストを表示
                ...(isDefault
                  ? []
                  : [
                      {
                        type: "span",
                        props: {
                          style: {
                            fontSize: "28px",
                            color: "#1abc9c",
                            fontWeight: "bold",
                          },
                          // TODO: ブログ名に変更してください
                          children: "Your Blog Title",
                        },
                      },
                    ]),
                // アバター画像がある場合のみ表示
                ...(avatarDataUri
                  ? [
                      {
                        type: "img",
                        props: {
                          src: avatarDataUri,
                          width: 40,
                          height: 40,
                          style: {
                            borderRadius: "8px",
                          },
                        },
                      },
                    ]
                  : []),
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Noto Sans JP",
          data: fontData,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  });

  return Buffer.from(resvg.render().asPng());
}

async function main() {
  const targetSlug = process.argv[2];
  const isForce = process.argv.includes("--force");

  // フォント読み込み
  if (!existsSync(FONT_PATH)) {
    console.error(`❌ Font not found: ${FONT_PATH}`);
    console.error(
      "   Download from: https://fonts.google.com/noto/specimen/Noto+Sans+JP",
    );
    process.exit(1);
  }
  const fontData = readFileSync(FONT_PATH);

  // アバター読み込み（オプション）
  let avatarDataUri: string | null = null;
  if (existsSync(AVATAR_PATH)) {
    const avatarData = readFileSync(AVATAR_PATH);
    avatarDataUri = `data:image/png;base64,${avatarData.toString("base64")}`;
  } else {
    console.log(`ℹ️  Avatar not found: ${AVATAR_PATH} (optional)`);
  }

  // OGPディレクトリ作成
  if (!existsSync(OGP_DIR)) {
    mkdirSync(OGP_DIR, { recursive: true });
  }

  // 記事一覧取得
  const posts: PostMeta[] = [];

  for (const dir of [POSTS_DIR, PAGES_DIR]) {
    if (!existsSync(dir)) continue;

    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const content = readFileSync(join(dir, file), "utf-8");
      const meta = parseFrontmatter(content);
      if (meta.slug) {
        posts.push(meta);
      }
    }
  }

  // デフォルトOGPを追加
  posts.push({
    title: SITE_TITLE,
    slug: "default",
    date: SITE_DESCRIPTION,
    categories: [],
  });

  // フィルタ
  const targets =
    targetSlug && targetSlug !== "--force"
      ? posts.filter((p) => p.slug === targetSlug)
      : posts;

  if (targets.length === 0) {
    console.log("No posts to generate");
    return;
  }

  console.log(`Generating ${targets.length} OGP images...\n`);

  let generated = 0;
  let skipped = 0;

  for (const post of targets) {
    // ファイル名: default は default.png、それ以外は Y-m-d-slug.png
    const filename =
      post.slug === "default" ? "default.png" : `${post.date}-${post.slug}.png`;
    const outputPath = join(OGP_DIR, filename);

    // 既に存在する場合はスキップ（--force で上書き）
    if (existsSync(outputPath) && !isForce) {
      skipped++;
      continue;
    }

    try {
      // frontmatter に image がある場合は背景画像として読み込み（ogp_bg: false で無効化）
      let bgImageDataUri: string | undefined;
      if (post.ogpBg && post.image) {
        // パスが / で始まる場合は content を追加
        const imagePath = post.image.startsWith("/")
          ? `./content${post.image}`
          : post.image;

        if (existsSync(imagePath)) {
          const imageData = readFileSync(imagePath);
          // 拡張子から MIME タイプを判定
          const ext = imagePath.split(".").pop()?.toLowerCase();
          const mimeType =
            ext === "png"
              ? "image/png"
              : ext === "jpg" || ext === "jpeg"
                ? "image/jpeg"
                : ext === "gif"
                  ? "image/gif"
                  : "image/png";
          bgImageDataUri = `data:${mimeType};base64,${imageData.toString("base64")}`;
        }
      }

      const png = await generateOgpImage(
        post,
        fontData,
        avatarDataUri,
        bgImageDataUri,
      );
      writeFileSync(outputPath, png);
      console.log(`✅ ${filename}`);
      generated++;
    } catch (e) {
      console.error(`❌ Failed: ${post.slug}`, e);
    }
  }

  console.log(`\n✅ Generated ${generated} images, skipped ${skipped}`);
}

main().catch(console.error);
