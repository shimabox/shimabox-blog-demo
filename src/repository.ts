import { parseFrontmatter, parseMarkdown } from "./markdown";
import type { Env, Post, PostMeta } from "./types";

const CACHE_KEY = "posts:index";

export async function listPosts(env: Env): Promise<PostMeta[]> {
  // キャッシュ確認
  const cached = await env.CACHE.get<PostMeta[]>(CACHE_KEY, "json");
  if (cached) return cached;

  // R2から取得
  const list = await env.BUCKET.list({ prefix: "posts/" });
  const posts: PostMeta[] = [];

  for (const obj of list.objects) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const text = await file.text();
    const meta = parseFrontmatter(text);
    if (meta.slug) {
      posts.push(meta);
    }
  }

  // 日付降順ソート
  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // キャッシュに保存（TTLなし = 無期限）
  await env.CACHE.put(CACHE_KEY, JSON.stringify(posts));

  return posts;
}

export async function getPost(env: Env, slug: string): Promise<Post | null> {
  // 個別記事のキャッシュ
  const cacheKey = `posts:${slug}`;
  const cached = await env.CACHE.get<Post>(cacheKey, "json");
  if (cached) return cached;

  // postsディレクトリを検索
  let list = await env.BUCKET.list({ prefix: "posts/" });
  for (const obj of list.objects) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const text = await file.text();
    const meta = parseFrontmatter(text);
    if (meta.slug === slug) {
      const post = await parseMarkdown(text);
      // キャッシュに保存（TTLなし = 無期限）
      await env.CACHE.put(cacheKey, JSON.stringify(post));
      return post;
    }
  }

  // pagesディレクトリも検索（固定ページ用）
  list = await env.BUCKET.list({ prefix: "pages/" });
  for (const obj of list.objects) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const text = await file.text();
    const meta = parseFrontmatter(text);
    if (meta.slug === slug) {
      const post = await parseMarkdown(text);
      // キャッシュに保存（TTLなし = 無期限）
      await env.CACHE.put(cacheKey, JSON.stringify(post));
      return post;
    }
  }

  return null;
}

export async function getPostsByCategory(
  env: Env,
  category: string,
): Promise<PostMeta[]> {
  const posts = await listPosts(env);
  return posts.filter((p) => p.categories?.includes(category));
}

export async function getAdjacentPosts(
  env: Env,
  slug: string,
): Promise<{ prev: PostMeta | null; next: PostMeta | null }> {
  const posts = await listPosts(env);
  const index = posts.findIndex((p) => p.slug === slug);
  if (index === -1) return { prev: null, next: null };
  // posts は日付降順なので、index-1 が新しい記事（次）、index+1 が古い記事（前）
  const next = index > 0 ? posts[index - 1] : null;
  const prev = index < posts.length - 1 ? posts[index + 1] : null;
  return { prev, next };
}

/**
 * キャッシュを無効化
 * @param env - 環境変数
 * @param slug - 指定すると特定記事のみ、省略すると全キャッシュを削除
 */
export async function invalidateCache(env: Env, slug?: string): Promise<void> {
  if (slug) {
    // 特定記事のキャッシュのみ削除
    await env.CACHE.delete(`posts:${slug}`);
    // 一覧も更新が必要なので削除
    await env.CACHE.delete(CACHE_KEY);
  } else {
    // 全キャッシュを削除
    await env.CACHE.delete(CACHE_KEY);
    const list = await env.CACHE.list({ prefix: "posts:" });
    for (const key of list.keys) {
      await env.CACHE.delete(key.name);
    }
  }
}
