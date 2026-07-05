import { describe, expect, it, vi } from "vitest";
import type { Env } from "./types";

// GitHub API fetchをモック
vi.stubGlobal(
  "fetch",
  vi.fn(() =>
    Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
  ),
);

// テスト用Markdownを生成
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

// R2/KVモック生成
function createMockBindings(files: Record<string, string> = {}): Env {
  const kvStore = new Map<string, string>();

  const bucket = {
    list: vi.fn(({ prefix }: { prefix?: string }) => {
      const objects = Object.keys(files)
        .filter((k) => (prefix ? k.startsWith(prefix) : true))
        .map((key) => ({ key }));
      return Promise.resolve({ objects, truncated: false });
    }),
    head: vi.fn((key: string) => {
      const content = files[key];
      if (!content) return Promise.resolve(null);
      return Promise.resolve({
        size: new TextEncoder().encode(content).length,
      });
    }),
    get: vi.fn(
      (
        key: string,
        options?: {
          range?: {
            offset?: number;
            length?: number;
            suffix?: number;
          };
        },
      ) => {
        const content = files[key];
        if (!content) return Promise.resolve(null);
        const bytes = new TextEncoder().encode(content);
        const fullSize = bytes.length;

        // range指定なし → 全体
        if (!options?.range) {
          return Promise.resolve({
            size: fullSize,
            text: () => Promise.resolve(content),
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(bytes);
                controller.close();
              },
            }),
          });
        }

        // range指定あり
        const { offset = 0, length, suffix } = options.range;
        let start: number;
        let end: number;
        if (suffix !== undefined) {
          start = Math.max(0, fullSize - suffix);
          end = fullSize;
        } else {
          start = offset;
          end =
            length !== undefined
              ? Math.min(start + length, fullSize)
              : fullSize;
        }
        if (start >= fullSize) return Promise.resolve(null);
        const sliced = bytes.slice(start, end);
        return Promise.resolve({
          size: fullSize,
          text: () => Promise.resolve(new TextDecoder().decode(sliced)),
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(sliced);
              controller.close();
            },
          }),
        });
      },
    ),
  } as unknown as R2Bucket;

  const cache = {
    get: vi.fn((key: string) => {
      const val = kvStore.get(key);
      return Promise.resolve(val ? JSON.parse(val) : null);
    }),
    put: vi.fn((key: string, value: string) => {
      kvStore.set(key, value);
      return Promise.resolve();
    }),
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
    SITE_DESCRIPTION: "テスト用のブログです",
    ADMIN_KEY: "test-admin-key",
  };
}

// appはモジュールスコープで読み込み
import app from "./index";

// Honoのテストヘルパー: app.request()でリクエストを送れる
async function request(
  path: string,
  env: Env,
  init?: RequestInit,
): Promise<Response> {
  const url = `http://localhost${path}`;
  return await app.request(url, init, env);
}

describe("Honoアプリ統合テスト", () => {
  const files = {
    "posts/2025-06-15-test-post.md": createRawPost({
      title: "テスト記事",
      slug: "test-post",
      date: "2025-06-15",
    }),
    "posts/2025-01-10-old-post.md": createRawPost({
      title: "古い記事",
      slug: "old-post",
      date: "2025-01-10",
    }),
    "pages/about.md": createRawPost({
      title: "About",
      slug: "about",
      date: "2025-01-01",
      fixedPage: "true",
    }),
    "pages/privacypolicy.md": createRawPost({
      title: "プライバシーポリシー",
      slug: "privacypolicy",
      date: "2025-01-01",
      fixedPage: "true",
    }),
    // Range test用: 200バイトのASCII文字列（"0123456789"を20回）
    "images/sample.png": "0123456789".repeat(20),
  };

  describe("トップページ", () => {
    it("GET / が200を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/", env);
      expect(res.status).toBe(200);
    });

    it("GET / のHTMLに記事タイトルが含まれる", async () => {
      const env = createMockBindings(files);
      const res = await request("/", env);
      const html = await res.text();
      expect(html).toContain("テスト記事");
      expect(html).toContain("古い記事");
    });
  });

  describe("記事詳細", () => {
    it("正しい日付パスで200を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/2025/06/15/test-post/", env);
      expect(res.status).toBe(200);
    });

    it("記事詳細ページに記事タイトルが含まれる", async () => {
      const env = createMockBindings(files);
      const res = await request("/2025/06/15/test-post/", env);
      const html = await res.text();
      expect(html).toContain("テスト記事");
    });

    it("日付が一致しない場合は正しいURLにリダイレクトする", async () => {
      const env = createMockBindings(files);
      const res = await request("/2024/01/01/test-post/", env);
      expect(res.status).toBe(301);
      expect(res.headers.get("Location")).toBe("/2025/06/15/test-post/");
    });

    it("存在しない記事は404を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/2025/01/01/nonexistent/", env);
      expect(res.status).toBe(404);
    });

    it("不正な年月日形式は404を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/abcd/ef/gh/test-post/", env);
      expect(res.status).toBe(404);
    });

    it("末尾スラッシュなしはリダイレクトされる", async () => {
      const env = createMockBindings(files);
      const res = await request("/2025/06/15/test-post", env);
      expect(res.status).toBe(301);
      expect(res.headers.get("Location")).toBe("/2025/06/15/test-post/");
    });
  });

  describe("固定ページ", () => {
    it("GET /about/ が200を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/about/", env);
      expect(res.status).toBe(200);
    });

    it("GET /privacypolicy/ が200を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/privacypolicy/", env);
      expect(res.status).toBe(200);
    });
  });

  describe("RSS", () => {
    it("GET /feed/ がRSS XMLを返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/feed/", env);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/rss+xml");
      const body = await res.text();
      expect(body).toContain("<rss");
      expect(body).toContain("テスト記事");
    });
  });

  describe("キャッシュ無効化API", () => {
    it("正しいAdmin Keyで200を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/api/invalidate", env, {
        method: "POST",
        headers: { "X-Admin-Key": "test-admin-key" },
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; slug: string };
      expect(json.ok).toBe(true);
      expect(json.slug).toBe("all");
    });

    it("slug指定でも200を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/api/invalidate?slug=test-post", env, {
        method: "POST",
        headers: { "X-Admin-Key": "test-admin-key" },
      });
      const json = (await res.json()) as { ok: boolean; slug: string };
      expect(json.slug).toBe("test-post");
    });

    it("Admin Keyなしで401を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/api/invalidate", env, {
        method: "POST",
      });
      expect(res.status).toBe(401);
    });

    it("不正なAdmin Keyで401を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/api/invalidate", env, {
        method: "POST",
        headers: { "X-Admin-Key": "wrong-key" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("R2一覧API", () => {
    it("正しいAdmin Keyでオブジェクト一覧を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/api/r2-list", env, {
        headers: { "X-Admin-Key": "test-admin-key" },
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { objects: string[] };
      expect(json.objects).toBeInstanceOf(Array);
    });

    it("Admin Keyなしで401を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/api/r2-list", env);
      expect(res.status).toBe(401);
    });
  });

  describe("画像配信", () => {
    it("パストラバーサルの..はURLパーサーで正規化されルート不一致で404", async () => {
      const env = createMockBindings(files);
      // URL parserが../を正規化するため /images/ ルートにマッチしない
      const res = await request("/images/../etc/passwd", env);
      expect(res.status).toBe(404);
    });

    it("存在しない画像は404を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/nonexistent.png", env);
      expect(res.status).toBe(404);
    });

    it("通常GETは200とAccept-Ranges/Content-Lengthを返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/sample.png", env);
      expect(res.status).toBe(200);
      expect(res.headers.get("Accept-Ranges")).toBe("bytes");
      expect(res.headers.get("Content-Length")).toBe("200");
    });
  });

  describe("画像配信 - Range request対応", () => {
    it("Range: bytes=0-99 で先頭100バイトを206で返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/sample.png", env, {
        headers: { Range: "bytes=0-99" },
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 0-99/200");
      expect(res.headers.get("Content-Length")).toBe("100");
      expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    });

    it("Range: bytes=0- で全体を206で返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/sample.png", env, {
        headers: { Range: "bytes=0-" },
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 0-199/200");
      expect(res.headers.get("Content-Length")).toBe("200");
    });

    it("Range: bytes=100-149 で中間50バイトを206で返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/sample.png", env, {
        headers: { Range: "bytes=100-149" },
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 100-149/200");
      expect(res.headers.get("Content-Length")).toBe("50");
    });

    it("suffix range: bytes=-50 で末尾50バイトを206で返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/sample.png", env, {
        headers: { Range: "bytes=-50" },
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 150-199/200");
      expect(res.headers.get("Content-Length")).toBe("50");
    });

    it("終端がファイルサイズを超えるRangeは末尾までclampして206を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/sample.png", env, {
        headers: { Range: "bytes=0-999" },
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 0-199/200");
      expect(res.headers.get("Content-Length")).toBe("200");
    });

    it("startがファイルサイズ以上のRangeは416を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/sample.png", env, {
        headers: { Range: "bytes=500-600" },
      });
      expect(res.status).toBe(416);
      expect(res.headers.get("Content-Range")).toBe("bytes */200");
    });

    it("不正なRangeフォーマットは416を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/sample.png", env, {
        headers: { Range: "bytes=abc" },
      });
      expect(res.status).toBe(416);
    });

    it("start>endのRangeは416を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/sample.png", env, {
        headers: { Range: "bytes=100-50" },
      });
      expect(res.status).toBe(416);
    });

    it("Rangeリクエストでも存在しないファイルは404を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/images/nonexistent.png", env, {
        headers: { Range: "bytes=0-99" },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("404ハンドリング", () => {
    it("未定義のパスは404を返す", async () => {
      const env = createMockBindings(files);
      const res = await request("/unknown-path", env);
      expect(res.status).toBe(404);
    });
  });

  describe("カテゴリページ", () => {
    it("%を含むカテゴリ名でも二重デコードでエラーにならず200を返す", async () => {
      const env = createMockBindings(files);
      // Honoは既にデコード済みの値をparamに渡すため、%25offは%offになる
      const res = await request("/category/100%25off/", env);
      expect(res.status).toBe(200);
    });
  });

  describe("エラーハンドリング", () => {
    it("処理中に例外が発生した場合はエラー詳細を含まないHTMLの500を返す", async () => {
      const env = createMockBindings(files);
      const boom = new Error("something went wrong: secret-detail");
      (env.CACHE.get as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw boom;
      });

      const res = await request("/", env);

      expect(res.status).toBe(500);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      const html = await res.text();
      expect(html).not.toContain("secret-detail");
      expect(html).not.toContain(boom.stack ?? "");
      expect(html).toContain("エラーが発生しました");
    });
  });
});

describe("セキュリティヘッダ", () => {
  const files = {
    "posts/2025-06-15-test-post.md": createRawPost({
      title: "テスト記事",
      slug: "test-post",
      date: "2025-06-15",
    }),
    "images/sample.png": "0123456789".repeat(20),
  };

  it("HTMLレスポンスに必須ヘッダが付与される", async () => {
    const env = createMockBindings(files);
    const res = await request("/", env);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBeNull();
  });

  it("画像レスポンスに必須ヘッダが付与され、既存のCache-Controlも維持される", async () => {
    const env = createMockBindings(files);
    const res = await request("/images/sample.png", env);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000");
  });
});
