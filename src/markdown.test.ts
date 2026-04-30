import { describe, expect, it, vi } from "vitest";
import { parseFrontmatter, parseMarkdown } from "./markdown";

// GitHub API呼び出しをモック（テスト中にnetwork呼び出ししない）
vi.stubGlobal(
  "fetch",
  vi.fn(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve(null),
    }),
  ),
);

// ============================================================
// parseFrontmatter
// ============================================================
describe("parseFrontmatter", () => {
  it("基本的なfrontmatterを解析できる", () => {
    const raw = `---
title: テスト記事
slug: test-post
date: 2025-01-15
categories: [tech, blog]
tags: [hono, cloudflare]
---

本文です。`;

    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("テスト記事");
    expect(meta.slug).toBe("test-post");
    expect(meta.date).toBe("2025-01-15");
    expect(meta.categories).toEqual(["tech", "blog"]);
    expect(meta.tags).toEqual(["hono", "cloudflare"]);
  });

  it("frontmatterがない場合はデフォルト値を返す", () => {
    const raw = "これはただのテキストです。";
    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("Untitled");
    expect(meta.slug).toBe("");
    expect(meta.categories).toEqual([]);
    expect(meta.tags).toEqual([]);
  });

  it("閉じ---がない不正なfrontmatterはデフォルト値を返す", () => {
    const raw = `---
title: 不完全
slug: incomplete
本文が始まっている`;

    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("Untitled");
  });

  it("boolean値を正しく解析できる", () => {
    const raw = `---
title: テスト
slug: test
date: 2025-01-01
categories: []
tags: []
fixedPage: true
noAds: false
---

本文`;

    const meta = parseFrontmatter(raw);
    expect(meta.fixedPage).toBe(true);
    expect(meta.noAds).toBe(false);
  });

  it("クォート付き文字列を正しく解析できる", () => {
    const raw = `---
title: 'シングルクォート''付き'
slug: "ダブルクォート\\"付き"
date: 2025-01-01
categories: []
tags: []
---

本文`;

    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("シングルクォート'付き");
    expect(meta.slug).toBe('ダブルクォート"付き');
  });

  it("空配列を正しく解析できる", () => {
    const raw = `---
title: テスト
slug: test
date: 2025-01-01
categories: []
tags: []
---

本文`;

    const meta = parseFrontmatter(raw);
    expect(meta.categories).toEqual([]);
    expect(meta.tags).toEqual([]);
  });

  it("excerptがfrontmatterにあればそれを使う", () => {
    const raw = `---
title: テスト
slug: test
date: 2025-01-01
categories: []
tags: []
excerpt: カスタム抜粋テキスト
---

本文がここにある`;

    const meta = parseFrontmatter(raw);
    expect(meta.excerpt).toBe("カスタム抜粋テキスト");
  });

  it("excerptがなければ本文から自動生成する", () => {
    const raw = `---
title: テスト
slug: test
date: 2025-01-01
categories: []
tags: []
---

これは自動生成される抜粋のテストです。`;

    const meta = parseFrontmatter(raw);
    expect(meta.excerpt).toBe("これは自動生成される抜粋のテストです。");
  });

  it("excerpt自動生成で100文字を超える場合は省略される", () => {
    const longText = "あ".repeat(150);
    const raw = `---
title: テスト
slug: test
date: 2025-01-01
categories: []
tags: []
---

${longText}`;

    const meta = parseFrontmatter(raw);
    expect(meta.excerpt).toBe(`${"あ".repeat(100)}…`);
  });

  it("excerpt自動生成でMarkdown記法が除去される", () => {
    const raw = `---
title: テスト
slug: test
date: 2025-01-01
categories: []
tags: []
---

## 見出し

**太字**と*斜体*と[リンク](https://example.com)と\`コード\`がある文。`;

    const meta = parseFrontmatter(raw);
    expect(meta.excerpt).not.toContain("##");
    expect(meta.excerpt).not.toContain("**");
    expect(meta.excerpt).not.toContain("*");
    expect(meta.excerpt).not.toContain("[");
    expect(meta.excerpt).not.toContain("`");
    expect(meta.excerpt).toContain("見出し");
    expect(meta.excerpt).toContain("太字");
    expect(meta.excerpt).toContain("リンク");
  });
});

// ============================================================
// parseMarkdown
// ============================================================
describe("parseMarkdown", () => {
  it("基本的なMarkdownをHTMLに変換する", async () => {
    const raw = `---
title: テスト記事
slug: test-post
date: 2025-01-15
categories: [tech]
tags: [test]
---

これは**太字**と*斜体*のテストです。`;

    const post = await parseMarkdown(raw);
    expect(post.title).toBe("テスト記事");
    expect(post.slug).toBe("test-post");
    expect(post.content).toContain("<strong>太字</strong>");
    expect(post.content).toContain("<em>斜体</em>");
  });

  it("見出しにIDが付与される（h2, h3）", async () => {
    const raw = `---
title: 見出しテスト
slug: heading-test
date: 2025-01-01
categories: []
tags: []
---

## はじめに

テキスト

## まとめ

テキスト

## おわりに

テキスト`;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain('id="はじめに"');
    expect(post.content).toContain('id="まとめ"');
    expect(post.content).toContain('id="おわりに"');
  });

  it("重複する見出しIDに連番サフィックスが付く", async () => {
    const raw = `---
title: 重複テスト
slug: dup-test
date: 2025-01-01
categories: []
tags: []
---

## セクション

テキスト

## セクション

テキスト

## セクション

テキスト`;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain('id="セクション"');
    expect(post.content).toContain('id="セクション-1"');
    expect(post.content).toContain('id="セクション-2"');
  });

  it("サフィックス付きIDと同名の見出しがあっても衝突しない", async () => {
    const raw = `---
title: 衝突テスト
slug: collision-test
date: 2025-01-01
categories: []
tags: []
---

## セクション

テキスト

## セクション-1

テキスト

## セクション

テキスト`;

    const post = await parseMarkdown(raw);
    // "セクション", "セクション-1"(自然な見出し), "セクション-2"(衝突を避けてスキップ)
    expect(post.content).toContain('id="セクション"');
    expect(post.content).toContain('id="セクション-1"');
    expect(post.content).toContain('id="セクション-2"');
  });

  it("見出しが3つ以上で目次が生成される", async () => {
    const raw = `---
title: 目次テスト
slug: toc-test
date: 2025-01-01
categories: []
tags: []
---

## 第1章

テキスト

## 第2章

テキスト

## 第3章

テキスト`;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain('<nav class="toc">');
    expect(post.content).toContain("目次");
    expect(post.content).toContain("第1章");
    expect(post.content).toContain("第2章");
    expect(post.content).toContain("第3章");
  });

  it("見出しが2つ以下では目次が生成されない", async () => {
    const raw = `---
title: 目次なしテスト
slug: no-toc-test
date: 2025-01-01
categories: []
tags: []
---

## セクション1

テキスト

## セクション2

テキスト`;

    const post = await parseMarkdown(raw);
    expect(post.content).not.toContain('<nav class="toc">');
  });

  it("fixedPage: trueの場合は目次が生成されない", async () => {
    const raw = `---
title: 固定ページ
slug: fixed
date: 2025-01-01
categories: []
tags: []
fixedPage: true
---

## 第1章

テキスト

## 第2章

テキスト

## 第3章

テキスト`;

    const post = await parseMarkdown(raw);
    expect(post.content).not.toContain('<nav class="toc">');
  });

  it("コードブロックがハイライト用classつきで出力される", async () => {
    const raw = `---
title: コードテスト
slug: code-test
date: 2025-01-01
categories: []
tags: []
---

\`\`\`typescript
const x = 1;
\`\`\``;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain('class="language-typescript"');
    expect(post.content).toContain("const x = 1;");
  });

  it("コードブロック内のHTMLがエスケープされる", async () => {
    const raw = `---
title: エスケープテスト
slug: escape-test
date: 2025-01-01
categories: []
tags: []
---

\`\`\`html
<div class="test">Hello</div>
\`\`\``;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain("&lt;div");
    expect(post.content).toContain("&gt;");
  });

  it("絵文字ショートコードが変換される", async () => {
    const raw = `---
title: 絵文字テスト
slug: emoji-test
date: 2025-01-01
categories: []
tags: []
---

これは :smile: テストです :+1:`;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain("😄");
    expect(post.content).toContain("👍");
    expect(post.content).not.toContain(":smile:");
    expect(post.content).not.toContain(":+1:");
  });

  it("コードブロック内の絵文字ショートコードは変換されない", async () => {
    const raw = `---
title: コード内絵文字テスト
slug: code-emoji-test
date: 2025-01-01
categories: []
tags: []
---

\`\`\`
:smile:
\`\`\``;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain(":smile:");
  });

  it("GitHub Alertsが変換される", async () => {
    const raw = `---
title: Alertテスト
slug: alert-test
date: 2025-01-01
categories: []
tags: []
---

> [!NOTE]
> これはノートです。`;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain("github-alert");
    expect(post.content).toContain("alert-note");
    expect(post.content).toContain("これはノートです。");
  });

  it("WARNING Alertも変換される", async () => {
    const raw = `---
title: Warningテスト
slug: warning-test
date: 2025-01-01
categories: []
tags: []
---

> [!WARNING]
> 注意してください。`;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain("alert-warning");
    expect(post.content).toContain("注意してください。");
  });

  // 埋め込みカード変換テスト
  describe("埋め込みカード変換", () => {
    it("YouTube URLがiframeに変換される", async () => {
      const raw = `---
title: YouTubeテスト
slug: youtube-test
date: 2025-01-01
categories: []
tags: []
---

[動画](https://www.youtube.com/watch?v=dQw4w9WgXcQ)`;

      const post = await parseMarkdown(raw);
      expect(post.content).toContain("embed-youtube");
      expect(post.content).toContain(
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      );
    });

    it("youtu.be短縮URLも変換される", async () => {
      const raw = `---
title: YouTubeショートテスト
slug: youtube-short-test
date: 2025-01-01
categories: []
tags: []
---

[動画](https://youtu.be/dQw4w9WgXcQ)`;

      const post = await parseMarkdown(raw);
      expect(post.content).toContain("embed-youtube");
      expect(post.content).toContain(
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      );
    });

    it("X/Twitter URLが埋め込みに変換される", async () => {
      const raw = `---
title: Xテスト
slug: x-test
date: 2025-01-01
categories: []
tags: []
---

[ツイート](https://x.com/shimabox/status/1234567890)`;

      const post = await parseMarkdown(raw);
      expect(post.content).toContain("embed-twitter");
      expect(post.content).toContain("twitter-tweet");
      expect(post.content).toContain(
        "https://twitter.com/shimabox/status/1234567890",
      );
    });

    it("Amazon URLがカードに変換される", async () => {
      const raw = `---
title: Amazonテスト
slug: amazon-test
date: 2025-01-01
categories: []
tags: []
---

[商品名](https://www.amazon.co.jp/dp/B08N5WRWNW)`;

      const post = await parseMarkdown(raw);
      expect(post.content).toContain("embed-amazon");
      expect(post.content).toContain("amazon-card-title");
      expect(post.content).toContain("商品名");
      expect(post.content).toContain("B08N5WRWNW");
    });

    it("Amazon短縮URLもカードに変換される", async () => {
      const raw = `---
title: Amazon短縮テスト
slug: amazon-short-test
date: 2025-01-01
categories: []
tags: []
---

[商品名](https://amzn.to/3xYzAbc)`;

      const post = await parseMarkdown(raw);
      expect(post.content).toContain("embed-amazon");
      expect(post.content).toContain("商品名");
    });

    it("Gist URLが埋め込みに変換される", async () => {
      const raw = `---
title: Gistテスト
slug: gist-test
date: 2025-01-01
categories: []
tags: []
---

[Gist](https://gist.github.com/user/abc123def456)`;

      const post = await parseMarkdown(raw);
      expect(post.content).toContain("embed-gist");
      expect(post.content).toContain(
        "https://gist.github.com/user/abc123def456.js",
      );
    });
  });

  it("rawContentに本文が含まれ、</scriptがプレースホルダーに置換される", async () => {
    const raw = `---
title: Scriptテスト
slug: script-test
date: 2025-01-01
categories: []
tags: []
---

テスト</script>テスト`;

    const post = await parseMarkdown(raw);
    expect(post.rawContent).toContain("__SCRIPT_CLOSE__");
    expect(post.rawContent).not.toContain("</script");
  });

  it("リンクが正しく変換される", async () => {
    const raw = `---
title: リンクテスト
slug: link-test
date: 2025-01-01
categories: []
tags: []
---

[Google](https://www.google.com)はサーチエンジン。`;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain('href="https://www.google.com"');
    expect(post.content).toContain("Google");
  });

  it("画像が正しく変換される", async () => {
    const raw = `---
title: 画像テスト
slug: image-test
date: 2025-01-01
categories: []
tags: []
---

![alt text](/images/test.png)`;

    const post = await parseMarkdown(raw);
    expect(post.content).toContain("<img");
    expect(post.content).toContain('src="/images/test.png"');
    expect(post.content).toContain('alt="alt text"');
  });
});
