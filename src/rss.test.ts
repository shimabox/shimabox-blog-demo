import { describe, expect, it } from "vitest";
import { generateRssFeed } from "./rss";
import type { Env, PostMeta } from "./types";

const mockEnv: Env = {
  BUCKET: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  SITE_URL: "https://blog.example.com",
  SITE_TITLE: "テストブログ",
  SITE_DESCRIPTION: "テスト用のブログです",
};

function createPost(overrides: Partial<PostMeta> = {}): PostMeta {
  return {
    title: "テスト記事",
    slug: "test-post",
    date: "2025-06-15",
    categories: ["tech"],
    tags: ["test"],
    excerpt: "テストの抜粋",
    ...overrides,
  };
}

describe("generateRssFeed", () => {
  it("有効なRSS XMLを生成する", () => {
    const posts = [createPost()];
    const rss = generateRssFeed(posts, mockEnv);

    expect(rss).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain("<channel>");
    expect(rss).toContain("</channel>");
    expect(rss).toContain("</rss>");
  });

  it("サイト情報が含まれる", () => {
    const posts = [createPost()];
    const rss = generateRssFeed(posts, mockEnv);

    expect(rss).toContain("<title>テストブログ</title>");
    expect(rss).toContain("<link>https://blog.example.com</link>");
    expect(rss).toContain("<description>テスト用のブログです</description>");
    expect(rss).toContain("<language>ja</language>");
  });

  it("Atom self linkが含まれる", () => {
    const posts = [createPost()];
    const rss = generateRssFeed(posts, mockEnv);

    expect(rss).toContain(
      'href="https://blog.example.com/feed/" rel="self" type="application/rss+xml"',
    );
  });

  it("記事がitem要素として出力される", () => {
    const posts = [
      createPost({
        title: "記事タイトル",
        slug: "my-post",
        date: "2025-06-15",
        excerpt: "記事の説明文",
      }),
    ];
    const rss = generateRssFeed(posts, mockEnv);

    expect(rss).toContain("<item>");
    expect(rss).toContain("<![CDATA[記事タイトル]]>");
    expect(rss).toContain(
      "<link>https://blog.example.com/2025/06/15/my-post/</link>",
    );
    expect(rss).toContain(
      "<guid>https://blog.example.com/2025/06/15/my-post/</guid>",
    );
    expect(rss).toContain("<pubDate>");
    expect(rss).toContain("<![CDATA[記事の説明文]]>");
  });

  it("URLが日付ベースで正しく生成される", () => {
    const posts = [createPost({ date: "2025-01-05", slug: "new-year" })];
    const rss = generateRssFeed(posts, mockEnv);

    expect(rss).toContain("https://blog.example.com/2025/01/05/new-year/");
  });

  it("カテゴリがcategory要素として出力される", () => {
    const posts = [createPost({ categories: ["tech", "blog", "life"] })];
    const rss = generateRssFeed(posts, mockEnv);

    expect(rss).toContain("<category><![CDATA[tech]]></category>");
    expect(rss).toContain("<category><![CDATA[blog]]></category>");
    expect(rss).toContain("<category><![CDATA[life]]></category>");
  });

  it("複数記事が正しく出力される", () => {
    const posts = [
      createPost({ title: "記事1", slug: "post-1", date: "2025-06-15" }),
      createPost({ title: "記事2", slug: "post-2", date: "2025-06-14" }),
    ];
    const rss = generateRssFeed(posts, mockEnv);

    const itemCount = (rss.match(/<item>/g) || []).length;
    expect(itemCount).toBe(2);
    expect(rss).toContain("<![CDATA[記事1]]>");
    expect(rss).toContain("<![CDATA[記事2]]>");
  });

  it("空の記事リストでも有効なRSSになる", () => {
    const rss = generateRssFeed([], mockEnv);

    expect(rss).toContain("<channel>");
    expect(rss).toContain("</channel>");
    expect(rss).not.toContain("<item>");
  });

  it("excerptが空の場合もdescriptionは出力される", () => {
    const posts = [createPost({ excerpt: "" })];
    const rss = generateRssFeed(posts, mockEnv);

    expect(rss).toContain("<description><![CDATA[]]></description>");
  });

  it("タイトルに]]>が含まれてもCDATAが壊れない", () => {
    const posts = [
      createPost({
        title: "タイトルに]]>が含まれる",
        slug: "cdata-test",
        date: "2025-06-15",
      }),
    ];
    const rss = generateRssFeed(posts, mockEnv);

    // CDATA が正しくエスケープされているか確認
    expect(rss).toContain("<![CDATA[タイトルに]]]]><![CDATA[>が含まれる]]>");
    // 生の ]]> による早期終了が無いか確認
    expect(rss).not.toMatch(/<![CDATA[[^\]]*]]>\s*<\/title>/);
  });

  it("excerptに]]>が含まれてもCDATAが壊れない", () => {
    const posts = [
      createPost({
        excerpt: "抜粋に]]>が含まれる場合",
        slug: "excerpt-cdata-test",
        date: "2025-06-15",
      }),
    ];
    const rss = generateRssFeed(posts, mockEnv);

    // CDATA が正しくエスケープされているか確認
    expect(rss).toContain("<![CDATA[抜粋に]]]]><![CDATA[>が含まれる場合]]>");
  });

  it("カテゴリに]]>が含まれてもCDATAが壊れない", () => {
    const posts = [
      createPost({
        categories: ["tech]]>danger", "normal"],
        slug: "category-cdata-test",
        date: "2025-06-15",
      }),
    ];
    const rss = generateRssFeed(posts, mockEnv);

    // CDATA が正しくエスケープされているか確認
    expect(rss).toContain(
      "<category><![CDATA[tech]]]]><![CDATA[>danger]]></category>",
    );
    expect(rss).toContain("<category><![CDATA[normal]]></category>");
  });

  it("複数の]]>が含まれる場合も正しくエスケープされる", () => {
    const posts = [
      createPost({
        title: "]]>と]]>が両方ある",
        slug: "multi-cdata-test",
        date: "2025-06-15",
      }),
    ];
    const rss = generateRssFeed(posts, mockEnv);

    // 両方の ]]> がエスケープされているか確認
    expect(rss).toContain(
      "<![CDATA[]]]]><![CDATA[>と]]]]><![CDATA[>が両方ある]]>",
    );
  });
});
