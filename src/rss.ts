import type { Env, PostMeta } from "./types";

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
      <title><![CDATA[${post.title}]]></title>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${date.toUTCString()}</pubDate>
      <description><![CDATA[${post.excerpt || ""}]]></description>
      ${post.categories.map((cat) => `<category><![CDATA[${cat}]]></category>`).join("\n      ")}
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
