import type { Context } from "hono";
import { Hono } from "hono";
import {
  getAdjacentPosts,
  getPost,
  getPostsByCategory,
  invalidateCache,
  listPosts,
} from "./repository";
import { generateRssFeed } from "./rss";
import type { Env } from "./types";
import { NotFound } from "./views/NotFound";
import { PostList } from "./views/PostList";
import { PostView } from "./views/PostView";

const app = new Hono<{ Bindings: Env }>();

const PER_PAGE = 10;

// ========================================
// 静的ファイル（最初に定義）
// ========================================

// 画像配信（/images/...）
app.get("/images/:path{.+}", async (c) => {
  const path = c.req.param("path");

  // パストラバーサルを防止
  if (path.includes("..") || path.startsWith("/")) {
    return c.text("Bad Request", 400);
  }

  const key = `images/${path}`;

  const object = await c.env.BUCKET.get(key);
  if (!object) return c.html(<NotFound env={c.env} />, 404);

  const contentType = getContentType(path);

  return c.body(object.body as ReadableStream, 200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000",
  });
});

// OGP画像（静的ファイル配信）
app.get("/ogp/:slug", async (c) => {
  // Honoがデコードして渡してくる
  const slug = c.req.param("slug").replace(/\.png$/, "");

  // パストラバーサルを防止
  if (slug.includes("..") || slug.startsWith("/")) {
    return c.text("Bad Request", 400);
  }

  // デフォルトOGP
  if (slug === "default") {
    const object = await c.env.BUCKET.get("images/ogp/default.png");
    if (!object) return c.text("Not Found", 404);
    return c.body(object.body as ReadableStream, 200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000",
    });
  }

  // 記事を取得して日付を得る
  const post = await getPost(c.env, slug);
  if (!post) {
    return serveDefaultOgp(c);
  }

  // R2キーは日本語のまま（syncも日本語で保存している）
  const key = `images/ogp/${post.date}-${slug}.png`;
  const object = await c.env.BUCKET.get(key);

  if (!object) {
    return serveDefaultOgp(c);
  }

  return c.body(object.body as ReadableStream, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=31536000",
  });
});

// RSS フィード
app.get("/feed/", async (c) => {
  const posts = await listPosts(c.env);
  const recent = posts.slice(0, 20);
  const rss = generateRssFeed(recent, c.env);
  return c.body(rss, 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
  });
});

// ========================================
// ページ
// ========================================

// トップページ
app.get("/", async (c) => {
  const posts = await listPosts(c.env);
  const paged = posts.slice(0, PER_PAGE);
  const totalPages = Math.ceil(posts.length / PER_PAGE);
  return c.html(
    <PostList
      posts={paged}
      env={c.env}
      currentPage={1}
      totalPages={totalPages}
    />,
  );
});

// ページネーション
app.get("/page/:page/", async (c) => {
  const page = parseInt(c.req.param("page"), 10);
  if (Number.isNaN(page) || page < 1)
    return c.html(<NotFound env={c.env} />, 404);

  const posts = await listPosts(c.env);
  const start = (page - 1) * PER_PAGE;
  const paged = posts.slice(start, start + PER_PAGE);
  const totalPages = Math.ceil(posts.length / PER_PAGE);

  if (paged.length === 0) return c.html(<NotFound env={c.env} />, 404);

  return c.html(
    <PostList
      posts={paged}
      env={c.env}
      currentPage={page}
      totalPages={totalPages}
    />,
  );
});

// カテゴリページ
app.get("/category/:category/", async (c) => {
  const category = decodeURIComponent(c.req.param("category"));
  const posts = await getPostsByCategory(c.env, category);
  return c.html(<PostList posts={posts} env={c.env} category={category} />);
});

// 固定ページ
app.get("/about/", async (c) => {
  const page = await getPost(c.env, "about");
  if (!page) return c.html(<NotFound env={c.env} />, 404);
  return c.html(<PostView post={page} env={c.env} />);
});

app.get("/privacypolicy/", async (c) => {
  const page = await getPost(c.env, "privacypolicy");
  if (!page) return c.html(<NotFound env={c.env} />, 404);
  return c.html(<PostView post={page} env={c.env} />);
});

// 記事詳細（既存URL体系を維持）
app.get("/:year/:month/:day/:slug/", async (c) => {
  const { year, month, day, slug } = c.req.param();

  // 年月日のバリデーション（4桁-2桁-2桁の数字のみ）
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return c.html(<NotFound env={c.env} />, 404);
  }

  const post = await getPost(c.env, slug);

  if (!post) return c.html(<NotFound env={c.env} />, 404);

  // URLの日付と記事の日付が一致するか確認
  const postDate = new Date(post.date);
  const expectedYear = postDate.getFullYear().toString();
  const expectedMonth = String(postDate.getMonth() + 1).padStart(2, "0");
  const expectedDay = String(postDate.getDate()).padStart(2, "0");

  if (year !== expectedYear || month !== expectedMonth || day !== expectedDay) {
    return c.redirect(
      `/${expectedYear}/${expectedMonth}/${expectedDay}/${slug}/`,
      301,
    );
  }

  const { prev } = await getAdjacentPosts(c.env, slug);

  return c.html(<PostView post={post} env={c.env} prevPost={prev} />);
});

// 末尾スラッシュなし → ありにリダイレクト（記事のみ）
app.get("/:year/:month/:day/:slug", async (c) => {
  const { year, month, day, slug } = c.req.param();

  // 年月日のバリデーション
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return c.html(<NotFound env={c.env} />, 404);
  }

  return c.redirect(`/${year}/${month}/${day}/${slug}/`, 301);
});

// favicon
app.get("/favicon.ico", async (c) => {
  const object = await c.env.BUCKET.get("images/favicon.ico");
  if (!object) return c.text("Not Found", 404);

  return c.body(object.body as ReadableStream, 200, {
    "Content-Type": "image/x-icon",
    "Cache-Control": "public, max-age=31536000",
  });
});

// ========================================
// API
// ========================================

// キャッシュ無効化API
// POST /api/invalidate         → 全キャッシュ削除
// POST /api/invalidate?slug=xx → 特定記事のキャッシュ削除
app.post("/api/invalidate", async (c) => {
  const key = c.req.header("X-Admin-Key");

  // ADMIN_KEYが設定されていない、または提供されたキーが一致しない場合は拒否
  if (!c.env.ADMIN_KEY || key !== c.env.ADMIN_KEY) {
    return c.text("Unauthorized", 401);
  }

  const slug = c.req.query("slug");
  await invalidateCache(c.env, slug);
  return c.json({ ok: true, slug: slug || "all" });
});

// R2オブジェクト一覧API（sync:delete用）
// GET /api/r2-list           → 全オブジェクト一覧
// GET /api/r2-list?prefix=xx → 指定prefixのオブジェクト一覧
app.get("/api/r2-list", async (c) => {
  const key = c.req.header("X-Admin-Key");

  if (!c.env.ADMIN_KEY || key !== c.env.ADMIN_KEY) {
    return c.text("Unauthorized", 401);
  }

  const prefix = c.req.query("prefix");
  const objects: string[] = [];
  let cursor: string | undefined;

  // R2のlist()はページネーションが必要
  do {
    const listed = await c.env.BUCKET.list({
      prefix: prefix || undefined,
      cursor,
    });

    for (const obj of listed.objects) {
      objects.push(obj.key);
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return c.json({ objects });
});

// 404
app.notFound((c) => {
  return c.html(<NotFound env={c.env} />, 404);
});

// ========================================
// ヘルパー
// ========================================

function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };
  return types[ext || ""] || "application/octet-stream";
}

async function serveDefaultOgp(c: Context<{ Bindings: Env }>) {
  const defaultOgp = await c.env.BUCKET.get("images/ogp/default.png");
  if (!defaultOgp) return c.text("Not Found", 404);
  return c.body(defaultOgp.body as ReadableStream, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=86400",
  });
}

export default app;
