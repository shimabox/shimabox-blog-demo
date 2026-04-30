import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./generate-ogp";

// ============================================================
// parseFrontmatter
// ============================================================
describe("parseFrontmatter (OGP生成用)", () => {
  it("基本的なfrontmatterを解析できる", () => {
    const raw = `---
title: "テスト記事"
slug: "test-post"
date: "2025-01-15"
categories: ["tech", "blog"]
---

本文です。`;

    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("テスト記事");
    expect(meta.slug).toBe("test-post");
    expect(meta.date).toBe("2025-01-15");
    expect(meta.categories).toEqual(["tech", "blog"]);
  });

  it("frontmatterがない場合はデフォルト値を返す", () => {
    const raw = "これはただのテキストです。";
    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("Untitled");
    expect(meta.slug).toBe("");
    expect(meta.date).toBe("");
    expect(meta.categories).toEqual([]);
  });

  it("閉じ---がない不正なfrontmatterはデフォルト値を返す", () => {
    const raw = `---
title: "不完全"
slug: "incomplete"
本文が始まっている`;

    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("Untitled");
  });

  it("ダブルクォートで囲まれた値を正しく解析できる", () => {
    const raw = `---
title: "クォート付き"
slug: "quoted"
date: "2025-01-01"
categories: []
---

本文`;

    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("クォート付き");
    expect(meta.slug).toBe("quoted");
  });

  it("シングルクォートで囲まれた値を正しく解析できる", () => {
    const raw = `---
title: 'シングル'
slug: 'single-quoted'
date: '2025-01-01'
categories: []
---

本文`;

    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("シングル");
    expect(meta.slug).toBe("single-quoted");
  });

  it("クォートなしの値も解析できる", () => {
    const raw = `---
title: クォートなし
slug: no-quote
date: 2025-01-01
categories: []
---

本文`;

    const meta = parseFrontmatter(raw);
    expect(meta.title).toBe("クォートなし");
    expect(meta.slug).toBe("no-quote");
  });

  // #118: 値にアポストロフィが含まれる title/categories が Untitled に落ちていたバグの回帰テスト
  describe("アポストロフィを含む値", () => {
    it("タイトルに含まれるアポストロフィが保持される", () => {
      const raw = `---
title: "Let's Encryptの自動更新が気付いたら止まっていた話"
slug: "lets-encrypt-auto-renewal-failure"
date: "2026-04-24"
categories: []
---

本文`;

      const meta = parseFrontmatter(raw);
      expect(meta.title).toBe(
        "Let's Encryptの自動更新が気付いたら止まっていた話",
      );
    });

    it("カテゴリ名に含まれるアポストロフィが保持される", () => {
      const raw = `---
title: "test"
slug: "test"
date: "2026-04-24"
categories: ["Let's Encrypt", "Cloudflare"]
---

本文`;

      const meta = parseFrontmatter(raw);
      expect(meta.categories).toEqual(["Let's Encrypt", "Cloudflare"]);
    });
  });

  describe("image フィールド", () => {
    it("image が指定されていれば取得できる", () => {
      const raw = `---
title: "test"
slug: "test"
date: "2026-04-24"
categories: []
image: "/images/2026/04/sample.png"
---

本文`;

      const meta = parseFrontmatter(raw);
      expect(meta.image).toBe("/images/2026/04/sample.png");
    });

    it("image が指定されていなければ undefined", () => {
      const raw = `---
title: "test"
slug: "test"
date: "2026-04-24"
categories: []
---

本文`;

      const meta = parseFrontmatter(raw);
      expect(meta.image).toBeUndefined();
    });
  });

  describe("ogpBg フィールド", () => {
    it("ogp_bg: false で false になる", () => {
      const raw = `---
title: "test"
slug: "test"
date: "2026-04-24"
categories: []
ogp_bg: false
---

本文`;

      const meta = parseFrontmatter(raw);
      expect(meta.ogpBg).toBe(false);
    });

    it("ogp_bg がなければ true (default)", () => {
      const raw = `---
title: "test"
slug: "test"
date: "2026-04-24"
categories: []
---

本文`;

      const meta = parseFrontmatter(raw);
      expect(meta.ogpBg).toBe(true);
    });

    it("ogp_bg: true の場合も true", () => {
      const raw = `---
title: "test"
slug: "test"
date: "2026-04-24"
categories: []
ogp_bg: true
---

本文`;

      const meta = parseFrontmatter(raw);
      expect(meta.ogpBg).toBe(true);
    });
  });

  it("空のcategoriesを正しく解析できる", () => {
    const raw = `---
title: "test"
slug: "test"
date: "2026-04-24"
categories: []
---

本文`;

    const meta = parseFrontmatter(raw);
    expect(meta.categories).toEqual([]);
  });
});
