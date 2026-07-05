import { parseFrontmatter, parseMarkdown } from "./markdown";
import type { Env, Post, PostMeta } from "./types";

const CACHE_KEY = "posts:index";
// slug → R2キー の索引。posts/ と pages/ の両方が対象。
const SLUG_INDEX_KEY = "posts:slugIndex";
// 存在しない slug のネガティブキャッシュTTL（秒）
const NOT_FOUND_TTL = 300;

/**
 * R2 のすべてのオブジェクトをページネーション対応で取得
 * BUCKET.list() は最大1,000件しか返さないため、truncated が true の間
 * cursor を使ってループする
 */
async function listAllObjects(
  env: Env,
  prefix: string,
): Promise<{ key: string }[]> {
  const objects: { key: string }[] = [];
  let cursor: string | undefined;

  do {
    const listed = await env.BUCKET.list({
      prefix,
      cursor,
    });

    objects.push(...listed.objects);

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return objects;
}

/**
 * slug → R2キー の索引を取得（無ければ構築してキャッシュ）
 *
 * posts/ と pages/ の全オブジェクトの frontmatter を読んで slug を解決する。
 * slug は frontmatter が正であり、ファイル名からは推測しない。
 * `posts:index`（listPosts）は posts/ のみが対象なのに対し、こちらは
 * pages/ も含める必要があるため索引は別建てで構築する。
 */
async function getSlugIndex(env: Env): Promise<Record<string, string>> {
  const cached = await env.CACHE.get<Record<string, string>>(
    SLUG_INDEX_KEY,
    "json",
  );
  if (cached) return cached;

  const index: Record<string, string> = {};
  for (const prefix of ["posts/", "pages/"]) {
    const objects = await listAllObjects(env, prefix);
    for (const obj of objects) {
      const file = await env.BUCKET.get(obj.key);
      if (!file) continue;
      const text = await file.text();
      const meta = parseFrontmatter(text);
      if (meta.slug) {
        index[meta.slug] = obj.key;
      }
    }
  }

  // キャッシュに保存（TTLなし = 無期限）
  await env.CACHE.put(SLUG_INDEX_KEY, JSON.stringify(index));

  return index;
}

/**
 * frontmatter の date が有効な日付文字列かどうかを判定する
 *
 * 欠落（空文字）や `date: いつか` のようなパース不能な値は
 * `new Date()` で Invalid Date になるため、記事一覧から除外する対象を判定する。
 */
function hasValidDate(meta: PostMeta): boolean {
  if (!meta.date) return false;
  return !Number.isNaN(new Date(meta.date).getTime());
}

export async function listPosts(env: Env): Promise<PostMeta[]> {
  // キャッシュ確認
  const cached = await env.CACHE.get<PostMeta[]>(CACHE_KEY, "json");
  if (cached) return cached;

  // R2から取得（ページネーション対応）
  const objects = await listAllObjects(env, "posts/");
  const posts: PostMeta[] = [];

  for (const obj of objects) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const text = await file.text();
    const meta = parseFrontmatter(text);
    if (!meta.slug) continue;
    if (!hasValidDate(meta)) {
      console.warn(
        `Invalid date in frontmatter, skipping: slug=${meta.slug} date="${meta.date}"`,
      );
      continue;
    }
    posts.push(meta);
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

  // ネガティブキャッシュ（存在しない slug への総当たりスキャンを防ぐ）
  const notFoundKey = `posts:404:${slug}`;
  const negativeHit = await env.CACHE.get(notFoundKey, "json");
  if (negativeHit !== null) return null;

  // slug → R2キー の索引を引く
  const index = await getSlugIndex(env);
  const key = index[slug];
  if (!key) {
    // 索引に無い = 存在しない。短命のネガティブキャッシュを書く
    await env.CACHE.put(notFoundKey, JSON.stringify(true), {
      expirationTtl: NOT_FOUND_TTL,
    });
    return null;
  }

  // 該当キーのみを取得（全件スキャンしない）
  const file = await env.BUCKET.get(key);
  if (!file) {
    // 索引はあるが実体が無い（削除済み等）。索引を破棄して次回再構築させる
    await env.CACHE.delete(SLUG_INDEX_KEY);
    return null;
  }

  const text = await file.text();
  const post = await parseMarkdown(text);
  // GitHub埋め込みカードの取得に1件でも失敗していたら、簡略カードのまま
  // 無期限キャッシュされてしまわないよう短命TTLにする（成功記事やGitHub埋め込みが
  // 無い記事は従来通り無期限）
  const cacheOptions = post.hadEmbedFailure
    ? { expirationTtl: 3600 }
    : undefined;
  await env.CACHE.put(cacheKey, JSON.stringify(post), cacheOptions);
  return post;
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
    // slug→R2キー索引（記事の追加・slug変更・削除で古くなる）
    await env.CACHE.delete(SLUG_INDEX_KEY);
    // 該当slugのネガティブキャッシュ（新規公開時に残っていると誤って404になる）
    await env.CACHE.delete(`posts:404:${slug}`);
  } else {
    // 全キャッシュを削除（posts: prefix で slugIndex・404:* もカバーされる）
    await env.CACHE.delete(CACHE_KEY);
    const list = await env.CACHE.list({ prefix: "posts:" });
    for (const key of list.keys) {
      await env.CACHE.delete(key.name);
    }
  }
}
