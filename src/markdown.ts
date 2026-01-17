import { marked } from "marked";
import * as emoji from "node-emoji";
import type { Post, PostMeta } from "./types";

/**
 * シンプルなfrontmatterパーサー
 */
function parseFrontmatterRaw(raw: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const lines = raw.split("\n");

  if (lines[0]?.trim() !== "---") {
    return { data: {}, content: raw };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { data: {}, content: raw };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const data: Record<string, unknown> = {};

  for (const line of frontmatterLines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, rawValue] = match;
      let value: unknown = rawValue;

      // 配列
      if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        const inner = rawValue.slice(1, -1).trim();
        if (inner === "") {
          value = [];
        } else {
          value = inner
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""));
        }
      }
      // シングルクォート文字列
      else if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
        value = rawValue.slice(1, -1).replace(/''/g, "'");
      }
      // ダブルクォート文字列
      else if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        value = rawValue.slice(1, -1).replace(/\\"/g, '"');
      }
      // 数値
      else if (/^\d+$/.test(rawValue)) {
        value = Number.parseInt(rawValue, 10);
      }
      // boolean
      else if (rawValue === "true") {
        value = true;
      } else if (rawValue === "false") {
        value = false;
      }

      data[key] = value;
    }
  }

  const content = lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();

  return { data, content };
}

/**
 * 本文からexcerptを自動生成
 */
function generateExcerpt(content: string, maxLength = 100): string {
  const plainText = content
    .replace(/!\[.*?\]\(.*?\)/g, "") // 画像除去
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1") // リンクをテキストに
    .replace(/#{1,6}\s+/g, "") // 見出し記号除去
    .replace(/[*_`~]/g, "") // 装飾記号除去
    .replace(/```[\s\S]*?```/g, "") // コードブロック除去
    .replace(/`[^`]+`/g, "") // インラインコード除去
    .replace(/<[^>]+>/g, "") // HTMLタグ除去
    .replace(/\n+/g, " ") // 改行をスペースに
    .replace(/\s+/g, " ") // 連続スペースを1つに
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength)}…`;
}

/**
 * 見出しからIDを生成
 */
function generateId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface TocItem {
  level: number;
  text: string;
  id: string;
}

/**
 * 目次HTMLを生成
 */
function generateTocHtml(items: TocItem[]): string {
  if (items.length === 0) return "";

  let html = '<nav class="toc"><details><summary>目次</summary><ul>';
  let prevLevel = 2;

  for (const item of items) {
    if (item.level > prevLevel) {
      html += "<ul>".repeat(item.level - prevLevel);
    } else if (item.level < prevLevel) {
      html += "</ul>".repeat(prevLevel - item.level);
    }
    html += `<li><a href="#${item.id}">${escapeHtml(item.text)}</a></li>`;
    prevLevel = item.level;
  }

  html += "</ul>".repeat(prevLevel - 1);
  html += "</details></nav>";

  return html;
}

/**
 * シンプルなシンタックスハイライト（highlight.js ベース）
 */
function highlightCode(code: string, lang: string): string {
  const escaped = escapeHtml(code);
  return `<pre><code class="language-${lang}">${escaped}</code></pre>`;
}

/**
 * 絵文字ショートコードを絵文字に変換（コードブロック内は除外）
 * :smile: → 😄
 */
function convertEmoji(html: string): string {
  // <code>と<pre>タグの中身は変換しない
  // タグを一時的にプレースホルダーに置換して、絵文字変換後に戻す
  const codeBlocks: string[] = [];

  // <pre>...</pre> と <code>...</code> を保護
  let protected_html = html.replace(
    /<(pre|code)[^>]*>[\s\S]*?<\/\1>/gi,
    (match) => {
      codeBlocks.push(match);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    },
  );

  // 絵文字変換
  protected_html = emoji.emojify(protected_html);

  // プレースホルダーを元に戻す
  protected_html = protected_html.replace(
    /__CODE_BLOCK_(\d+)__/g,
    (_, index) => codeBlocks[Number.parseInt(index, 10)],
  );

  return protected_html;
}

/**
 * GitHub Alertsを変換
 * > [!NOTE] → styled alert box
 */
function convertAlerts(html: string): string {
  const alertTypes: Record<
    string,
    { icon: string; label: string; className: string }
  > = {
    NOTE: { icon: "ℹ️", label: "Note", className: "alert-note" },
    TIP: { icon: "💡", label: "Tip", className: "alert-tip" },
    IMPORTANT: { icon: "📝", label: "Important", className: "alert-important" },
    WARNING: { icon: "⚠️", label: "Warning", className: "alert-warning" },
    CAUTION: { icon: "❗", label: "Caution", className: "alert-caution" },
  };

  // blockquote内の [!TYPE] パターンを検出して変換
  // markedは > [!NOTE]\n> content を <blockquote><p>[!NOTE]\ncontent</p></blockquote> に変換する
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
    (_, type, content) => {
      const upperType = type.toUpperCase();
      const alert = alertTypes[upperType];
      if (!alert) return _;

      // 内容を整形（改行をbrに変換するか、pタグで囲む）
      const cleanContent = content.trim();

      return `<div class="github-alert ${alert.className}">
        <div class="alert-title">${alert.icon} ${alert.label}</div>
        <div class="alert-content"><p>${cleanContent}</p></div>
      </div>`;
    },
  );
}

/**
 * URLを埋め込みカードに変換
 */
function convertEmbeds(html: string): string {
  // X (Twitter) の埋め込み
  // x.com を twitter.com に変換
  html = html.replace(
    /<p><a href="(https?:\/\/(x\.com|twitter\.com)\/([^/]+)\/status\/(\d+))[^"]*">[^<]*<\/a><\/p>/g,
    (_, _url, _domain, username, tweetId) => {
      const twitterUrl = `https://twitter.com/${username}/status/${tweetId}`;
      return `<div class="embed-card embed-twitter">
        <blockquote class="twitter-tweet" data-dnt="true">
          <a href="${twitterUrl}"></a>
        </blockquote>
      </div>`;
    },
  );

  // 単独行のX/Twitter URL（リンク化されていない場合）
  html = html.replace(
    /<p>(https?:\/\/(x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)[^\s<]*)<\/p>/g,
    (_, _url, _domain, username, tweetId) => {
      const twitterUrl = `https://twitter.com/${username}/status/${tweetId}`;
      return `<div class="embed-card embed-twitter">
        <blockquote class="twitter-tweet" data-dnt="true">
          <a href="${twitterUrl}"></a>
        </blockquote>
      </div>`;
    },
  );

  // YouTube の埋め込み
  // https://www.youtube.com/watch?v=VIDEO_ID または https://youtu.be/VIDEO_ID
  html = html.replace(
    /<p><a href="(https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+))[^"]*">[^<]*<\/a><\/p>/g,
    (_, __, ___, videoId) => {
      return `<div class="embed-card embed-youtube">
        <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe>
      </div>`;
    },
  );

  html = html.replace(
    /<p><a href="(https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+))[^"]*">[^<]*<\/a><\/p>/g,
    (_, __, videoId) => {
      return `<div class="embed-card embed-youtube">
        <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe>
      </div>`;
    },
  );

  // 単独行のYouTube URL
  html = html.replace(
    /<p>(https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)[^\s<]*)<\/p>/g,
    (_, __, ___, videoId) => {
      return `<div class="embed-card embed-youtube">
        <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe>
      </div>`;
    },
  );

  html = html.replace(
    /<p>(https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)[^\s<]*)<\/p>/g,
    (_, __, videoId) => {
      return `<div class="embed-card embed-youtube">
        <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe>
      </div>`;
    },
  );

  // Gist の埋め込み
  // https://gist.github.com/username/gist_id
  html = html.replace(
    /<p><a href="(https?:\/\/gist\.github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9]+))[^"]*">[^<]*<\/a><\/p>/g,
    (_, url) => {
      return `<div class="embed-card embed-gist">
        <script src="${url}.js"></script>
      </div>`;
    },
  );

  // 単独行のGist URL
  html = html.replace(
    /<p>(https?:\/\/gist\.github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9]+))<\/p>/g,
    (_, url) => {
      return `<div class="embed-card embed-gist">
        <script src="${url}.js"></script>
      </div>`;
    },
  );

  // リスト内のX/Twitter埋め込み（リンクのみを置換）
  html = html.replace(
    /<li><a href="(https?:\/\/(x\.com|twitter\.com)\/([^/]+)\/status\/(\d+))[^"]*">[^<]*<\/a>/g,
    (_, _url, _domain, username, tweetId) => {
      const twitterUrl = `https://twitter.com/${username}/status/${tweetId}`;
      return `<li><div class="embed-card embed-twitter">
        <blockquote class="twitter-tweet" data-dnt="true">
          <a href="${twitterUrl}"></a>
        </blockquote>
      </div>`;
    },
  );

  // リスト内のYouTube埋め込み（youtube.com/watch?v=）
  html = html.replace(
    /<li><a href="(https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+))[^"]*">[^<]*<\/a>/g,
    (_, __, ___, videoId) => {
      return `<li><div class="embed-card embed-youtube">
        <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe>
      </div>`;
    },
  );

  // リスト内のYouTube埋め込み（youtu.be/）
  html = html.replace(
    /<li><a href="(https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+))[^"]*">[^<]*<\/a>/g,
    (_, __, videoId) => {
      return `<li><div class="embed-card embed-youtube">
        <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe>
      </div>`;
    },
  );

  return html;
}

export async function parseMarkdown(raw: string): Promise<Post> {
  const { data, content } = parseFrontmatterRaw(raw);

  // 見出しを収集
  const tocItems: TocItem[] = [];
  const headingIds = new Map<string, number>();

  const renderer = new marked.Renderer();

  renderer.heading = ({ text, depth }) => {
    // h2, h3 のみ目次に含める
    if (depth === 2 || depth === 3) {
      let id = generateId(text);

      // 重複IDの処理
      const count = headingIds.get(id) || 0;
      if (count > 0) {
        id = `${id}-${count}`;
      }
      headingIds.set(id, count + 1);

      tocItems.push({ level: depth, text, id });
      return `<h${depth} id="${id}">${text}</h${depth}>`;
    }
    return `<h${depth}>${text}</h${depth}>`;
  };

  renderer.code = ({ text, lang }) => {
    const language = lang || "text";
    return highlightCode(text, language);
  };

  let bodyHtml = await marked(content, { renderer, async: true });

  // GitHub Alertsを変換
  bodyHtml = convertAlerts(bodyHtml);

  // 埋め込みカードに変換
  bodyHtml = convertEmbeds(bodyHtml);

  // 目次を生成（見出しが3つ以上ある場合のみ、fixedPage: true で無効化）
  const isFixedPage = data.fixedPage === true;
  const tocHtml =
    !isFixedPage && tocItems.length >= 3 ? generateTocHtml(tocItems) : "";

  // 目次を本文の最初に挿入
  let html = tocHtml + bodyHtml;

  // 絵文字ショートコードを変換（コードブロック内は除外、目次にも適用）
  html = convertEmoji(html);

  // excerpt: frontmatterにあればそれを使う、なければ自動生成
  let excerpt = String(data.excerpt || "");
  if (!excerpt) {
    excerpt = generateExcerpt(content, 100);
  }

  return {
    title: String(data.title || "Untitled"),
    slug: String(data.slug || ""),
    date: String(data.date || ""),
    categories: Array.isArray(data.categories)
      ? data.categories.map(String)
      : [],
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    excerpt,
    image: String(data.image || ""),
    fixedPage: isFixedPage,
    noAds: data.noAds === true,
    content: html,
  };
}

export function parseFrontmatter(raw: string): PostMeta {
  const { data, content } = parseFrontmatterRaw(raw);

  // excerpt: frontmatterにあればそれを使う、なければ自動生成
  let excerpt = String(data.excerpt || "");
  if (!excerpt) {
    excerpt = generateExcerpt(content, 100);
  }

  return {
    title: String(data.title || "Untitled"),
    slug: String(data.slug || ""),
    date: String(data.date || ""),
    categories: Array.isArray(data.categories)
      ? data.categories.map(String)
      : [],
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    excerpt,
    image: String(data.image || ""),
    fixedPage: data.fixedPage === true,
    noAds: data.noAds === true,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
