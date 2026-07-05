import type { Context } from "hono";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
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
import { ServerError } from "./views/ServerError";

const app = new Hono<{ Bindings: Env }>();

const PER_PAGE = 10;

// ========================================
// セキュリティヘッダ（全レスポンス共通）
// ========================================
// hono@4.11 の secureHeaders() の挙動（デフォルト値含む）を全項目明示する。
// 曖昧なデフォルトに頼らず、このブログが実際に読み込む外部リソース
// （記事ページのみ: highlight.js(cdnjs) と Twitter widgets.js、本文中の
// gist.github.com 埋め込みスクリプト、外部サイトの<img>から参照される
// OGP・記事内画像）に合わせて値を選択している。
// CSPは本適用しない（highlight.js の onload 実行やテーマ初期化・Twitter/gist
// のインラインおよびクロスオリジンスクリプトがあり、安全に固めるには段階的な
// Report-Only 導入が必要なため）。
app.use(
  "*",
  secureHeaders({
    // ---- 必須の4ヘッダ ----
    xContentTypeOptions: true, // "X-Content-Type-Options: nosniff"（デフォルトと同値だが明示）
    referrerPolicy: "strict-origin-when-cross-origin", // デフォルトの "no-referrer" を上書き
    xFrameOptions: "DENY", // デフォルトの "SAMEORIGIN" を上書き
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
    }, // "camera=(), microphone=(), geolocation=()"

    // ---- 明示的に無効化 ----
    // OGP画像・記事内画像はSNSカードやソーシャルブックマーク等、外部サイトの
    // <img> から直接参照されるため、CORPを付けると壊れる。
    crossOriginResourcePolicy: false,
    // highlight.js(cdnjs) / Twitter widgets.js / gist.github.com の
    // <script>埋め込みはCORP無しのクロスオリジンリソースのため、COEPは無効のまま維持。
    crossOriginEmbedderPolicy: false,

    // ---- hono@4.11 のデフォルトをそのまま明示（意図して有効化） ----
    crossOriginOpenerPolicy: true, // "Cross-Origin-Opener-Policy: same-origin"
    originAgentCluster: true, // "Origin-Agent-Cluster: ?1"
    strictTransportSecurity: true, // "Strict-Transport-Security: max-age=15552000; includeSubDomains"
    // Layout.tsx の記事ページには <link rel="dns-prefetch"> / <link rel="preconnect">
    // （platform.twitter.com・cdnjs.cloudflare.com へのLighthouse対策ヒント）があるため、
    // "X-DNS-Prefetch-Control: off" を送るとこれを殺してしまう。ヘッダ自体を付けない。
    xDnsPrefetchControl: false,
    xDownloadOptions: true, // "X-Download-Options: noopen"
    xPermittedCrossDomainPolicies: true, // "X-Permitted-Cross-Domain-Policies: none"
    xXssProtection: true, // "X-XSS-Protection: 0"
    removePoweredBy: true, // X-Powered-By を削除
  }),
);

// ========================================
// 静的ファイル（最初に定義）
// ========================================

// 画像・動画配信（/images/...）
// Range リクエスト対応（Safari の <video> や大きな画像のシーク再生に必要）
app.get("/images/:path{.+}", async (c) => {
  const path = c.req.param("path");

  // パストラバーサルを防止
  if (path.includes("..") || path.startsWith("/")) {
    return c.text("Bad Request", 400);
  }

  const key = `images/${path}`;
  const contentType = getContentType(path);
  const rangeHeader = c.req.header("Range");

  if (rangeHeader) {
    return serveRange(c, key, contentType, rangeHeader);
  }

  const object = await c.env.BUCKET.get(key);
  if (!object) return c.html(<NotFound env={c.env} />, 404);

  return c.body(object.body as ReadableStream, 200, {
    "Content-Type": contentType,
    "Content-Length": String(object.size),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000",
  });
});

async function serveRange(
  c: Context<{ Bindings: Env }>,
  key: string,
  contentType: string,
  rangeHeader: string,
): Promise<Response> {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return c.body(null, 416);
  }

  const head = await c.env.BUCKET.head(key);
  if (!head) return c.html(<NotFound env={c.env} />, 404);

  const totalSize = head.size;
  const startStr = match[1];
  const endStr = match[2];

  let start: number;
  let end: number;

  if (startStr === "" && endStr !== "") {
    // suffix range: bytes=-N → 末尾Nバイト
    const suffixLen = Number.parseInt(endStr, 10);
    if (suffixLen <= 0) {
      return c.body(null, 416, { "Content-Range": `bytes */${totalSize}` });
    }
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  } else if (startStr !== "") {
    start = Number.parseInt(startStr, 10);
    end = endStr !== "" ? Number.parseInt(endStr, 10) : totalSize - 1;
  } else {
    return c.body(null, 416, { "Content-Range": `bytes */${totalSize}` });
  }

  // start が範囲外、または start > end は 416
  if (start >= totalSize || start > end) {
    return c.body(null, 416, { "Content-Range": `bytes */${totalSize}` });
  }
  // end がファイルサイズを超えた場合は仕様上 totalSize-1 に丸める（RFC 7233）
  if (end >= totalSize) {
    end = totalSize - 1;
  }

  const length = end - start + 1;
  const object = await c.env.BUCKET.get(key, {
    range: { offset: start, length },
  });
  if (!object) return c.html(<NotFound env={c.env} />, 404);

  return c.body(object.body as ReadableStream, 206, {
    "Content-Type": contentType,
    "Content-Range": `bytes ${start}-${end}/${totalSize}`,
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000",
  });
}

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
  // Honoのc.req.param()は既にデコード済みの値を返すため、再デコードすると
  // %を含むカテゴリ名（例: 100%25off）でURIErrorになる。再デコードは行わない。
  const category = c.req.param("category");
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

// 想定外のエラー（レスポンスにエラー詳細は含めない）
app.onError((err, c) => {
  console.error(err);
  return c.html(<ServerError env={c.env} />, 500);
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
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
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
