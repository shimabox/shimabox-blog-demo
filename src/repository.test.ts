import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAdjacentPosts,
  getPost,
  getPostsByCategory,
  invalidateCache,
  listPosts,
} from "./repository";
import type { Env } from "./types";

// GitHub API fetchをモック
vi.stubGlobal(
  "fetch",
  vi.fn(() =>
    Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
  ),
);

// テスト用Markdown
function createRawPost(overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    title: "テスト記事",
    slug: "test-post",
    date: "2025-06-15",
    categories: "[tech]",
    tags: "[test]",
  };
  const data = { ...defaults, ...overrides };
  const frontmatter = Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${frontmatter}\n---\n\n本文です。`;
}

// R2/KVモック
function createMockEnv(
  files: Record<string, string> = {},
): Env & { _kvStore: Map<string, string> } {
  const kvStore = new Map<string, string>();

  const bucket = {
    list: vi.fn(({ prefix }: { prefix?: string }) => {
      const objects = Object.keys(files)
        .filter((k) => (prefix ? k.startsWith(prefix) : true))
        .map((key) => ({ key }));
      return Promise.resolve({ objects });
    }),
    get: vi.fn((key: string) => {
      const content = files[key];
      if (!content) return Promise.resolve(null);
      return Promise.resolve({ text: () => Promise.resolve(content) });
    }),
  } as unknown as R2Bucket;

  const cache = {
    get: vi.fn((key: string) => {
      const val = kvStore.get(key);
      return Promise.resolve(val ? JSON.parse(val) : null);
    }),
    put: vi.fn(
      (key: string, value: string, _options?: { expirationTtl?: number }) => {
        // 第3引数（expirationTtl 等）はテストでは値のみ保持し挙動には影響させない
        kvStore.set(key, value);
        return Promise.resolve();
      },
    ),
    delete: vi.fn((key: string) => {
      kvStore.delete(key);
      return Promise.resolve();
    }),
    list: vi.fn(({ prefix }: { prefix?: string }) => {
      const keys = [...kvStore.keys()]
        .filter((k) => (prefix ? k.startsWith(prefix) : true))
        .map((name) => ({ name }));
      return Promise.resolve({ keys });
    }),
  } as unknown as KVNamespace;

  return {
    BUCKET: bucket,
    CACHE: cache,
    SITE_URL: "https://blog.example.com",
    SITE_TITLE: "テストブログ",
    SITE_DESCRIPTION: "テスト用",
    _kvStore: kvStore,
  };
}

describe("listPosts", () => {
  it("R2から記事一覧を取得して日付降順で返す", async () => {
    const env = createMockEnv({
      "posts/2025-01-01-old.md": createRawPost({
        slug: "old-post",
        date: "2025-01-01",
      }),
      "posts/2025-06-15-new.md": createRawPost({
        slug: "new-post",
        date: "2025-06-15",
      }),
      "posts/2025-03-10-mid.md": createRawPost({
        slug: "mid-post",
        date: "2025-03-10",
      }),
    });

    const posts = await listPosts(env);
    expect(posts).toHaveLength(3);
    expect(posts[0].slug).toBe("new-post");
    expect(posts[1].slug).toBe("mid-post");
    expect(posts[2].slug).toBe("old-post");
  });

  it("KVキャッシュがあればR2を呼ばない", async () => {
    const env = createMockEnv({
      "posts/2025-01-01-post.md": createRawPost({ slug: "cached" }),
    });

    // 最初の呼び出しでキャッシュされる
    await listPosts(env);
    const bucket = env.BUCKET as unknown as { list: ReturnType<typeof vi.fn> };
    const callCount = bucket.list.mock.calls.length;

    // 2回目はキャッシュから返る
    const posts = await listPosts(env);
    expect(posts).toHaveLength(1);
    expect(bucket.list.mock.calls.length).toBe(callCount); // 増えていない
  });

  it("slugが空の記事はスキップされる", async () => {
    const env = createMockEnv({
      "posts/valid.md": createRawPost({ slug: "valid" }),
      "posts/empty-slug.md": createRawPost({ slug: "" }),
    });

    const posts = await listPosts(env);
    expect(posts).toHaveLength(1);
    expect(posts[0].slug).toBe("valid");
  });
});

describe("getPost", () => {
  it("slugで記事を取得できる", async () => {
    const env = createMockEnv({
      "posts/2025-06-15-my-post.md": createRawPost({
        title: "見つかる記事",
        slug: "my-post",
      }),
    });

    const post = await getPost(env, "my-post");
    expect(post).not.toBeNull();
    expect(post?.title).toBe("見つかる記事");
    expect(post?.slug).toBe("my-post");
    expect(post?.content).toContain("本文です。");
  });

  it("存在しないslugはnullを返す", async () => {
    const env = createMockEnv({
      "posts/2025-01-01-other.md": createRawPost({ slug: "other" }),
    });

    const post = await getPost(env, "nonexistent");
    expect(post).toBeNull();
  });

  it("pagesディレクトリからも取得できる", async () => {
    const env = createMockEnv({
      "pages/about.md": createRawPost({
        title: "About",
        slug: "about",
        fixedPage: "true",
      }),
    });

    const post = await getPost(env, "about");
    expect(post).not.toBeNull();
    expect(post?.title).toBe("About");
  });

  it("取得した記事がKVにキャッシュされる", async () => {
    const env = createMockEnv({
      "posts/2025-01-01-cached.md": createRawPost({ slug: "cached" }),
    });

    await getPost(env, "cached");
    expect(env._kvStore.has("posts:cached")).toBe(true);
  });

  it("存在しないslugは2回目以降R2をスキャンしない（ネガティブキャッシュ）", async () => {
    const env = createMockEnv({
      "posts/2025-01-01-other.md": createRawPost({ slug: "other" }),
    });
    const bucket = env.BUCKET as unknown as { list: ReturnType<typeof vi.fn> };

    const first = await getPost(env, "ghost");
    expect(first).toBeNull();
    // 初回は索引構築のためスキャンが走る
    const callCount = bucket.list.mock.calls.length;
    expect(callCount).toBeGreaterThan(0);
    // ネガティブキャッシュが書かれている（TTL 300秒）
    expect(env._kvStore.has("posts:404:ghost")).toBe(true);

    const second = await getPost(env, "ghost");
    expect(second).toBeNull();
    // 2回目はネガティブキャッシュヒットでR2スキャンなし
    expect(bucket.list.mock.calls.length).toBe(callCount);
  });

  it("索引構築後は既知slugの取得で対象ファイル1件のみをgetする", async () => {
    const env = createMockEnv({
      "posts/2025-06-15-a.md": createRawPost({ slug: "a" }),
      "posts/2025-06-16-b.md": createRawPost({ slug: "b" }),
      "posts/2025-06-17-target.md": createRawPost({ slug: "target" }),
    });
    const bucket = env.BUCKET as unknown as { get: ReturnType<typeof vi.fn> };

    // 別slugの取得で索引を先に構築・キャッシュさせる
    await getPost(env, "a");
    bucket.get.mockClear();

    const post = await getPost(env, "target");
    expect(post?.slug).toBe("target");
    // 全件getせず、該当ファイル1件のみ
    expect(bucket.get).toHaveBeenCalledTimes(1);
    expect(bucket.get).toHaveBeenCalledWith("posts/2025-06-17-target.md");
  });

  it("pagesディレクトリのslugも索引経由で取得できる", async () => {
    const env = createMockEnv({
      "posts/2025-06-15-a.md": createRawPost({ slug: "a" }),
      "pages/about.md": createRawPost({
        title: "About",
        slug: "about",
        fixedPage: "true",
      }),
    });

    const post = await getPost(env, "about");
    expect(post).not.toBeNull();
    expect(post?.title).toBe("About");
  });

  it("索引にあるがR2に実体が無い場合はnullを返し索引を破棄する", async () => {
    const env = createMockEnv(); // 実体ファイルなし
    // 実体のないキーを指す索引を手動でセット
    env._kvStore.set(
      "posts:slugIndex",
      JSON.stringify({ ghost: "posts/2025-06-15-ghost.md" }),
    );

    const post = await getPost(env, "ghost");
    expect(post).toBeNull();
    // 索引が破棄され、次回アクセスで再構築される
    expect(env._kvStore.has("posts:slugIndex")).toBe(false);
  });
});

describe("getPostsByCategory", () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv({
      "posts/a.md": createRawPost({
        slug: "tech1",
        categories: "[tech, blog]",
      }),
      "posts/b.md": createRawPost({
        slug: "life1",
        categories: "[life]",
      }),
      "posts/c.md": createRawPost({
        slug: "tech2",
        categories: "[tech]",
      }),
    });
  });

  it("指定カテゴリの記事のみ返す", async () => {
    const posts = await getPostsByCategory(env, "tech");
    expect(posts).toHaveLength(2);
    expect(posts.every((p) => p.categories.includes("tech"))).toBe(true);
  });

  it("該当カテゴリがなければ空配列を返す", async () => {
    const posts = await getPostsByCategory(env, "nonexistent");
    expect(posts).toEqual([]);
  });
});

describe("getAdjacentPosts", () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv({
      "posts/a.md": createRawPost({ slug: "oldest", date: "2025-01-01" }),
      "posts/b.md": createRawPost({ slug: "middle", date: "2025-06-15" }),
      "posts/c.md": createRawPost({ slug: "newest", date: "2025-12-01" }),
    });
  });

  it("前後の記事を取得できる（日付降順でnext=新しい, prev=古い）", async () => {
    const { prev, next } = await getAdjacentPosts(env, "middle");
    expect(next?.slug).toBe("newest");
    expect(prev?.slug).toBe("oldest");
  });

  it("最新記事にはnextがない", async () => {
    const { prev, next } = await getAdjacentPosts(env, "newest");
    expect(next).toBeNull();
    expect(prev?.slug).toBe("middle");
  });

  it("最古記事にはprevがない", async () => {
    const { prev, next } = await getAdjacentPosts(env, "oldest");
    expect(prev).toBeNull();
    expect(next?.slug).toBe("middle");
  });

  it("存在しないslugはprev/nextともnull", async () => {
    const { prev, next } = await getAdjacentPosts(env, "nonexistent");
    expect(prev).toBeNull();
    expect(next).toBeNull();
  });
});

describe("invalidateCache", () => {
  it("slug指定で特定記事キャッシュとインデックスを削除する", async () => {
    const env = createMockEnv();
    env._kvStore.set("posts:my-post", '{"title":"cached"}');
    env._kvStore.set("posts:index", '[{"slug":"my-post"}]');

    await invalidateCache(env, "my-post");

    expect(env._kvStore.has("posts:my-post")).toBe(false);
    expect(env._kvStore.has("posts:index")).toBe(false);
  });

  it("slug指定でslugIndexとネガティブキャッシュも削除する", async () => {
    const env = createMockEnv();
    env._kvStore.set("posts:my-post", '{"title":"cached"}');
    env._kvStore.set("posts:index", "[...]");
    env._kvStore.set("posts:slugIndex", '{"my-post":"posts/x.md"}');
    env._kvStore.set("posts:404:my-post", "true");

    await invalidateCache(env, "my-post");

    expect(env._kvStore.has("posts:slugIndex")).toBe(false);
    expect(env._kvStore.has("posts:404:my-post")).toBe(false);
  });

  it("slug未指定で全キャッシュを削除する", async () => {
    const env = createMockEnv();
    env._kvStore.set("posts:index", "[...]");
    env._kvStore.set("posts:post1", "{...}");
    env._kvStore.set("posts:post2", "{...}");

    await invalidateCache(env);

    expect(env._kvStore.size).toBe(0);
  });
});

describe("getPost - GitHub埋め込み失敗時のキャッシュTTL", () => {
  it("GitHub API取得に失敗した記事はexpirationTtl: 3600でキャッシュされる", async () => {
    const raw = `---
title: GitHub埋め込み失敗テスト
slug: gh-fail
date: 2025-01-01
categories: []
tags: []
---

[https://github.com/owner/repo](https://github.com/owner/repo)`;
    const env = createMockEnv({
      "posts/2025-01-01-gh-fail.md": raw,
    });

    await getPost(env, "gh-fail");

    const cache = env.CACHE as unknown as { put: ReturnType<typeof vi.fn> };
    const call = cache.put.mock.calls.find(([key]) => key === "posts:gh-fail");
    expect(call?.[2]).toEqual({ expirationTtl: 3600 });
  });

  it("GitHub URLが無い記事はTTLなしでキャッシュされる", async () => {
    const env = createMockEnv({
      "posts/2025-01-01-normal.md": createRawPost({ slug: "normal" }),
    });

    await getPost(env, "normal");

    const cache = env.CACHE as unknown as { put: ReturnType<typeof vi.fn> };
    const call = cache.put.mock.calls.find(([key]) => key === "posts:normal");
    expect(call?.[2]).toBeUndefined();
  });

  it("GitHub API取得に成功した記事はTTLなしでキャッシュされる", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            description: "desc",
            stargazers_count: 1,
            language: "TypeScript",
          }),
      }),
    );

    const raw = `---
title: GitHub埋め込み成功テスト
slug: gh-success
date: 2025-01-01
categories: []
tags: []
---

[https://github.com/owner/repo](https://github.com/owner/repo)`;
    const env = createMockEnv({
      "posts/2025-01-01-gh-success.md": raw,
    });

    await getPost(env, "gh-success");

    const cache = env.CACHE as unknown as { put: ReturnType<typeof vi.fn> };
    const call = cache.put.mock.calls.find(
      ([key]) => key === "posts:gh-success",
    );
    expect(call?.[2]).toBeUndefined();
  });
});
