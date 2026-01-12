/**
 * 開発用サーバー
 * content フォルダを直接読むので sync 不要
 * livereload でファイル変更時にブラウザ自動リロード
 *
 * npm run dev
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createServer as createLivereloadServer } from "livereload";

// markdown.ts の関数を流用
import { parseFrontmatter, parseMarkdown } from "./src/markdown";

const CONTENT_DIR = "./content";
const PORT = 8787;
const LIVERELOAD_PORT = 35729;

// livereload サーバー起動
const lrServer = createLivereloadServer({
  port: LIVERELOAD_PORT,
  exts: ["md", "png", "jpg", "jpeg", "gif", "css", "ts", "tsx"],
  delay: 500,
});
lrServer.watch([CONTENT_DIR, "./src", "./public", "./dev-server.tsx"]);

// livereload スクリプト（接続切断時のリロード対応）
const LIVERELOAD_SCRIPT = `
<script src="http://localhost:${LIVERELOAD_PORT}/livereload.js?snipver=1"></script>
<script>
(function() {
  var reconnectInterval = setInterval(function() {
    fetch('http://localhost:${PORT}/', { method: 'HEAD', mode: 'no-cors' })
      .catch(function() {});
  }, 1000);

  var ws = new WebSocket('ws://localhost:${LIVERELOAD_PORT}/livereload');
  ws.onclose = function() {
    console.log('[LiveReload] Connection lost, waiting for server...');
    var checkServer = setInterval(function() {
      fetch('http://localhost:${PORT}/', { method: 'HEAD' })
        .then(function() {
          clearInterval(checkServer);
          console.log('[LiveReload] Server is back, reloading...');
          location.reload();
        })
        .catch(function() {});
    }, 500);
  };
})();
</script>`;

const app = new Hono();

// HTML に livereload スクリプトを注入するミドルウェア
app.use("*", async (c, next) => {
  await next();
  const contentType = c.res.headers.get("content-type");
  if (contentType?.includes("text/html")) {
    const html = await c.res.text();
    const injected = html.replace("</body>", `${LIVERELOAD_SCRIPT}</body>`);
    c.res = new Response(injected, {
      status: c.res.status,
      headers: c.res.headers,
    });
  }
});

// 型定義
interface PostMeta {
  title: string;
  slug: string;
  date: string;
  categories: string[];
  tags: string[];
  excerpt: string;
  image?: string;
}

interface Post extends PostMeta {
  content: string;
}

// ファイルシステムから記事一覧を取得
function listPosts(): PostMeta[] {
  const postsDir = join(CONTENT_DIR, "posts");
  if (!existsSync(postsDir)) return [];

  const posts: PostMeta[] = [];

  for (const file of readdirSync(postsDir).filter((f) => f.endsWith(".md"))) {
    const content = readFileSync(join(postsDir, file), "utf-8");
    const meta = parseFrontmatter(content);
    if (meta.slug) {
      posts.push(meta);
    }
  }

  // 日付降順
  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return posts;
}

// ファイルシステムから記事を取得
async function getPost(slug: string): Promise<Post | null> {
  // posts から検索
  const postsDir = join(CONTENT_DIR, "posts");
  if (existsSync(postsDir)) {
    for (const file of readdirSync(postsDir).filter((f) => f.endsWith(".md"))) {
      const filePath = join(postsDir, file);
      const content = readFileSync(filePath, "utf-8");
      const meta = parseFrontmatter(content);
      if (meta.slug === slug) {
        return parseMarkdown(content);
      }
    }
  }

  // pages から検索
  const pagesDir = join(CONTENT_DIR, "pages");
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir).filter((f) => f.endsWith(".md"))) {
      const filePath = join(pagesDir, file);
      const content = readFileSync(filePath, "utf-8");
      const meta = parseFrontmatter(content);
      if (meta.slug === slug) {
        return parseMarkdown(content);
      }
    }
  }

  return null;
}

// カテゴリ別記事
function getPostsByCategory(category: string): PostMeta[] {
  return listPosts().filter((p) => p.categories?.includes(category));
}

// 環境変数（ダミー）
// TODO: wrangler.toml と同じ値に変更してください
const env = {
  SITE_URL: "http://localhost:8787",
  SITE_TITLE: "Your Blog Title",
  SITE_DESCRIPTION: "Your blog description",
  NODE_ENV: "development",
};

const PER_PAGE = 10;

import { generateRssFeed } from "./src/rss";
import { NotFound } from "./src/views/NotFound";
// ========================================
// JSX レンダリング用にviewsをインポート
// ========================================
import { PostList } from "./src/views/PostList";
import { PostView } from "./src/views/PostView";

// ========================================
// 静的ファイル
// ========================================

// public ディレクトリ (CSS等)
app.get("/styles.css", serveStatic({ root: "./public" }));

// 画像配信
app.get("/images/*", serveStatic({ root: "./content" }));

// OGP画像
app.get("/ogp/:slug", async (c) => {
  const slug = c.req.param("slug").replace(/\.png$/, "");

  if (slug === "default") {
    const path = join(CONTENT_DIR, "images/ogp/default.png");
    if (existsSync(path)) {
      const data = readFileSync(path);
      return c.body(data, 200, { "Content-Type": "image/png" });
    }
    return c.text("Not Found", 404);
  }

  const post = await getPost(slug);
  if (!post) {
    return c.text("Not Found", 404);
  }

  const filename = `${post.date}-${slug}.png`;
  const path = join(CONTENT_DIR, "images/ogp", filename);

  if (existsSync(path)) {
    const data = readFileSync(path);
    return c.body(data, 200, { "Content-Type": "image/png" });
  }

  // fallback to default
  const defaultPath = join(CONTENT_DIR, "images/ogp/default.png");
  if (existsSync(defaultPath)) {
    const data = readFileSync(defaultPath);
    return c.body(data, 200, { "Content-Type": "image/png" });
  }

  return c.text("Not Found", 404);
});

// RSS
app.get("/feed/", (c) => {
  const posts = listPosts().slice(0, 20);
  const rss = generateRssFeed(posts, env as any);
  return c.body(rss, 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
  });
});

// favicon
app.get("/favicon.ico", (c) => {
  const path = join(CONTENT_DIR, "images/favicon.ico");
  if (existsSync(path)) {
    const data = readFileSync(path);
    return c.body(data, 200, { "Content-Type": "image/x-icon" });
  }
  return c.text("Not Found", 404);
});

// ========================================
// ページ
// ========================================

// トップページ
app.get("/", (c) => {
  const posts = listPosts();
  const paged = posts.slice(0, PER_PAGE);
  const totalPages = Math.ceil(posts.length / PER_PAGE);
  return c.html(
    <PostList
      posts={paged}
      env={env as any}
      currentPage={1}
      totalPages={totalPages}
    />,
  );
});

// ページネーション
app.get("/page/:page/", (c) => {
  const page = parseInt(c.req.param("page"), 10);
  if (Number.isNaN(page) || page < 1) {
    return c.html(<NotFound env={env as any} />, 404);
  }

  const posts = listPosts();
  const start = (page - 1) * PER_PAGE;
  const paged = posts.slice(start, start + PER_PAGE);
  const totalPages = Math.ceil(posts.length / PER_PAGE);

  if (paged.length === 0) {
    return c.html(<NotFound env={env as any} />, 404);
  }

  return c.html(
    <PostList
      posts={paged}
      env={env as any}
      currentPage={page}
      totalPages={totalPages}
    />,
  );
});

// カテゴリページ
app.get("/category/:category/", (c) => {
  const category = decodeURIComponent(c.req.param("category"));
  const posts = getPostsByCategory(category);
  return c.html(
    <PostList posts={posts} env={env as any} category={category} />,
  );
});

// 固定ページ
app.get("/about/", async (c) => {
  const page = await getPost("about");
  if (!page) return c.html(<NotFound env={env as any} />, 404);
  return c.html(<PostView post={page} env={env as any} />);
});

app.get("/privacypolicy/", async (c) => {
  const page = await getPost("privacypolicy");
  if (!page) return c.html(<NotFound env={env as any} />, 404);
  return c.html(<PostView post={page} env={env as any} />);
});

// 記事詳細
app.get("/:year/:month/:day/:slug/", async (c) => {
  const { year, month, day, slug } = c.req.param();

  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return c.html(<NotFound env={env as any} />, 404);
  }

  const post = await getPost(slug);
  if (!post) return c.html(<NotFound env={env as any} />, 404);

  return c.html(<PostView post={post} env={env as any} />);
});

// 末尾スラッシュなし → ありにリダイレクト
app.get("/:year/:month/:day/:slug", (c) => {
  const { year, month, day, slug } = c.req.param();

  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return c.html(<NotFound env={env as any} />, 404);
  }

  return c.redirect(`/${year}/${month}/${day}/${slug}/`, 301);
});

// 404
app.notFound((c) => {
  return c.html(<NotFound env={env as any} />, 404);
});

// ========================================
// サーバー起動
// ========================================
console.log(`🚀 Dev server running at http://localhost:${PORT}`);
console.log(`🔄 LiveReload server on port ${LIVERELOAD_PORT}`);
console.log(`📁 Watching ${CONTENT_DIR}, src/ for changes\n`);

serve({
  fetch: app.fetch,
  port: PORT,
});
