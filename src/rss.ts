import type { Env, PostMeta } from "./types";

/**
 * CDATAセクション用のエスケープ。`]]>` を `]]]]><![CDATA[>` に置換し、
 * テキスト中の `]]>` によるCDATAの早期終了（XML注入）を防ぐ。
 */
function escapeCdata(text: string): string {
  return text.replace(/]]>/g, "]]]]><![CDATA[>");
}

export function generateRssFeed(posts: PostMeta[], env: Env): string {
  const items = posts
    .map((post) => {
      const date = new Date(post.date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const url = `${env.SITE_URL}/${year}/${month}/${day}/${post.slug}/`;

      return `
    <item>
      <title><![CDATA[${escapeCdata(post.title)}]]></title>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${date.toUTCString()}</pubDate>
      <description><![CDATA[${escapeCdata(post.excerpt || "")}]]></description>
      ${post.categories.map((cat) => `<category><![CDATA[${escapeCdata(cat)}]]></category>`).join("\n      ")}
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${env.SITE_TITLE}</title>
    <link>${env.SITE_URL}</link>
    <description>${env.SITE_DESCRIPTION}</description>
    <language>ja</language>
    <atom:link href="${env.SITE_URL}/feed/" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
}
