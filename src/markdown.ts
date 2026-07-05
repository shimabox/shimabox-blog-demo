import { marked } from "marked";
import * as emoji from "node-emoji";
import type { Post, PostMeta } from "./types";

interface GitHubRepoInfo {
  description: string | null;
  stargazers_count: number;
  language: string | null;
}

/**
 * GitHub APIからリポジトリ情報を取得
 */
async function fetchGitHubRepoInfo(
  owner: string,
  repo: string,
): Promise<GitHubRepoInfo | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          // TODO: User-Agentはあなたのサイト名に変更してください
          "User-Agent": "shimabox-blog-demo",
        },
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as GitHubRepoInfo;
  } catch {
    return null;
  }
}

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
 * 本文内の<img>に表示安定化と遅延読み込み用の属性を補完する。
 * alt抜けは装飾画像扱いの空altにする。
 */
function ensureImgAttributes(html: string): string {
  return html.replace(/<img\b([^>]*?)\/?>/gi, (_match, attrs) => {
    let nextAttrs = attrs;
    if (!/\salt\s*=/.test(nextAttrs)) {
      nextAttrs += ' alt=""';
    }
    if (!/\sloading\s*=/.test(nextAttrs)) {
      nextAttrs += ' loading="lazy"';
    }
    if (!/\sdecoding\s*=/.test(nextAttrs)) {
      nextAttrs += ' decoding="async"';
    }
    return `<img${nextAttrs}>`;
  });
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

// Safari は preload="metadata" で初期フレームを描画しないため、
// メディアフラグメント #t=0.001 を付与して最初のフレームを表示させる
const withMediaFragment = (url: string) =>
  url.includes("#") ? url : `${url}#t=0.001`;

const extractAsin = (url: string): string | null => {
  const match = url.match(/\/(dp|gp\/product)\/([A-Z0-9]{10})/);
  return match ? match[2] : null;
};

const amazonCardHtml = (url: string, linkText: string) => {
  const asin = extractAsin(url);
  if (asin) {
    const imageUrl = `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL160_.jpg`;
    return `<div class="embed-card embed-amazon">
        <a href="${url}" target="_blank" rel="noopener noreferrer">
          <div class="amazon-card-image">
            <img src="${imageUrl}" alt="${linkText}" loading="lazy" referrerpolicy="no-referrer">
          </div>
          <div class="amazon-card-body">
            <div class="amazon-card-service">
              <img src="https://icons.duckduckgo.com/ip3/www.amazon.co.jp.ico" alt="" class="amazon-icon" referrerpolicy="no-referrer">
              <span class="amazon-card-service-name">Amazon</span>
            </div>
            <span class="amazon-card-title">${linkText}</span>
          </div>
        </a>
      </div>`;
  }
  return `<div class="embed-card embed-amazon">
        <a href="${url}" target="_blank" rel="noopener noreferrer">
          <img src="https://icons.duckduckgo.com/ip3/www.amazon.co.jp.ico" alt="" class="amazon-icon" referrerpolicy="no-referrer">
          <span class="amazon-card-title">${linkText}</span>
        </a>
      </div>`;
};

/**
 * 埋め込みハンドラ定義。
 *
 * 埋め込み種別ごとに 1 エントリ。各エントリは
 *  - buildCard: マッチした正規表現グループ（groups[i]）と prefix からカードHTMLを生成
 *  - pLink  : `<p><a href="URL">text</a></p>` 形態にマッチする正規表現
 *  - pPlain : `<p>URL</p>`（リンク化されていない生URL）形態
 *  - liLink : `<li><a href="URL">text</a>` 形態
 * を持つ。存在しない形態は省略する。
 *
 * 新しい埋め込みを 1 種類追加したいときは、このリストに 1 エントリ足すだけでよい。
 *
 * NOTE: buildCard が参照するグループ番号は、その種別が持つ全形態で一致するよう
 *       各正規表現を組んである（例: X は username=groups[3] / tweetId=groups[4] が
 *       pLink/pPlain/liLink 共通）。ラッパ部分の微妙な差異（動画/Amazon は href の後に
 *       属性を許す `"[^>]*>`、X/YouTube/Gist は `[^"]*">[^<]*` 等）は挙動維持を優先し、
 *       共通化せず種別ごとの正規表現データとして保持している。
 */
interface EmbedHandler {
  buildCard: (groups: string[], prefix: string) => string;
  pLink?: RegExp;
  pPlain?: RegExp;
  liLink?: RegExp;
}

const embedHandlers: EmbedHandler[] = [
  // X (Twitter) — x.com/twitter.com のどちらでも twitter.com に正規化して埋め込む
  {
    buildCard: (g, prefix) => {
      const twitterUrl = `https://twitter.com/${g[3]}/status/${g[4]}`;
      return `${prefix}<div class="embed-card embed-twitter">
        <blockquote class="twitter-tweet" data-dnt="true">
          <div class="twitter-loading">
            <div class="twitter-loading-spinner"></div>
            <span>Xのコンテンツを読み込み中...</span>
          </div>
          <a href="${twitterUrl}"></a>
        </blockquote>
      </div>`;
    },
    pLink:
      /<p><a href="(https?:\/\/(x\.com|twitter\.com)\/([^/]+)\/status\/(\d+))[^"]*">[^<]*<\/a><\/p>/g,
    pPlain:
      /<p>(https?:\/\/(x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)[^\s<]*)<\/p>/g,
    liLink:
      /<li><a href="(https?:\/\/(x\.com|twitter\.com)\/([^/]+)\/status\/(\d+))[^"]*">[^<]*<\/a>/g,
  },
  // YouTube（youtube.com/watch?v=）— videoId は groups[3]
  {
    buildCard: (g, prefix) =>
      `${prefix}<div class="embed-card embed-youtube">
        <iframe src="https://www.youtube.com/embed/${g[3]}" frameborder="0" allowfullscreen loading="lazy"></iframe>
      </div>`,
    pLink:
      /<p><a href="(https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+))[^"]*">[^<]*<\/a><\/p>/g,
    pPlain:
      /<p>(https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)[^\s<]*)<\/p>/g,
    liLink:
      /<li><a href="(https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+))[^"]*">[^<]*<\/a>/g,
  },
  // YouTube（youtu.be 短縮）— videoId は groups[2]
  {
    buildCard: (g, prefix) =>
      `${prefix}<div class="embed-card embed-youtube">
        <iframe src="https://www.youtube.com/embed/${g[2]}" frameborder="0" allowfullscreen loading="lazy"></iframe>
      </div>`,
    pLink:
      /<p><a href="(https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+))[^"]*">[^<]*<\/a><\/p>/g,
    pPlain: /<p>(https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)[^\s<]*)<\/p>/g,
    liLink:
      /<li><a href="(https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+))[^"]*">[^<]*<\/a>/g,
  },
  // 動画ファイル（mp4/webm/mov/m4v）— url は groups[1]
  // pPlain のみ `/` 始まりの相対URLも許容する専用パターン
  {
    buildCard: (g, prefix) =>
      `${prefix}<div class="embed-card embed-video">
        <video src="${withMediaFragment(g[1])}" controls preload="metadata" playsinline></video>
      </div>`,
    pLink:
      /<p><a href="([^"]+\.(mp4|webm|mov|m4v)(?:[?#][^"]*)?)"[^>]*>[^<]*<\/a><\/p>/gi,
    pPlain:
      /<p>((?:https?:\/\/|\/)[^\s<]+\.(mp4|webm|mov|m4v)(?:[?#][^\s<]*)?)<\/p>/gi,
    liLink:
      /<li><a href="([^"]+\.(mp4|webm|mov|m4v)(?:[?#][^"]*)?)"[^>]*>[^<]*<\/a>/gi,
  },
  // Gist — url は groups[1]。pPlain は末尾 `[^\s<]*` を持たない（単独行の完全一致）
  {
    buildCard: (g, prefix) =>
      `${prefix}<div class="embed-card embed-gist">
        <script src="${g[1]}.js"></script>
      </div>`,
    pLink:
      /<p><a href="(https?:\/\/gist\.github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9]+))[^"]*">[^<]*<\/a><\/p>/g,
    pPlain:
      /<p>(https?:\/\/gist\.github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9]+))<\/p>/g,
  },
  // Amazon（通常URL: /dp/ASIN, /gp/product/ASIN）— url=groups[1], linkText=groups[5]
  {
    buildCard: (g, prefix) => `${prefix}${amazonCardHtml(g[1], g[5])}`,
    pLink:
      /<p><a href="(https?:\/\/(www\.)?amazon\.(co\.jp|com)[^"]*\/(dp|gp\/product)\/[A-Z0-9]{10}[^"]*)"[^>]*>([^<]+)<\/a><\/p>/g,
    liLink:
      /<li><a href="(https?:\/\/(www\.)?amazon\.(co\.jp|com)[^"]*\/(dp|gp\/product)\/[A-Z0-9]{10}[^"]*)"[^>]*>([^<]+)<\/a>/g,
  },
  // Amazon（短縮URL: amzn.asia, amzn.to）— url=groups[1], linkText=groups[3]
  {
    buildCard: (g, prefix) => `${prefix}${amazonCardHtml(g[1], g[3])}`,
    pLink:
      /<p><a href="(https?:\/\/amzn\.(asia|to)\/[^"]+)"[^>]*>([^<]+)<\/a><\/p>/g,
    liLink:
      /<li><a href="(https?:\/\/amzn\.(asia|to)\/[^"]+)"[^>]*>([^<]+)<\/a>/g,
  },
];

// 出現形態と、その形態で置換結果に前置する prefix（リスト内は `<li>` を残す）
const EMBED_FORMS: Array<{
  key: "pLink" | "pPlain" | "liLink";
  prefix: string;
}> = [
  { key: "pLink", prefix: "" },
  { key: "pPlain", prefix: "" },
  { key: "liLink", prefix: "<li>" },
];

/**
 * URLを埋め込みカードに変換
 *
 * ハンドラ定義（embedHandlers）×出現形態（EMBED_FORMS）を走査し、
 * 各正規表現を buildCard で置換する。
 */
function convertEmbeds(html: string): string {
  for (const handler of embedHandlers) {
    for (const { key, prefix } of EMBED_FORMS) {
      const regex = handler[key];
      if (!regex) continue;
      html = html.replace(regex, (...groups: string[]) =>
        handler.buildCard(groups, prefix),
      );
    }
  }
  return html;
}

/**
 * GitHubカードのHTMLを生成
 */
function generateGitHubCard(
  url: string,
  username: string,
  repo: string,
  info: GitHubRepoInfo | null,
  prefix = "",
): string {
  const description = info?.description
    ? `<p class="github-card-description">${escapeHtml(info.description)}</p>`
    : "";
  const meta =
    info?.stargazers_count || info?.language
      ? `<div class="github-card-meta">
          ${info.language ? `<span class="github-card-language">${info.language}</span>` : ""}
          ${info.stargazers_count ? `<span class="github-card-stars">★ ${info.stargazers_count.toLocaleString()}</span>` : ""}
        </div>`
      : "";

  return `${prefix}<div class="embed-card embed-github">
    <a href="${url}" target="_blank" rel="noopener noreferrer">
      <div class="github-card-header">
        <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <span class="github-card-repo">${username}/${repo}</span>
      </div>
      ${description}
      ${meta}
    </a>
  </div>`;
}

/**
 * GitHub埋め込みを非同期で処理
 *
 * 戻り値の hadFailure は、GitHub API呼び出しが1件以上失敗した（レート制限等でnullが
 * 返った）場合のみ true。呼び出し元でキャッシュTTLの判断に使う。
 */
async function convertGitHubEmbeds(
  html: string,
): Promise<{ html: string; hadFailure: boolean }> {
  // GitHub URLを抽出
  const patterns = [
    // <p><a href="...">...</a></p>
    {
      regex:
        /<p><a href="(https?:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+))\/?[^"]*">[^<]*<\/a><\/p>/g,
      prefix: "",
    },
    // <p>URL</p>
    {
      regex:
        /<p>(https?:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+))\/?<\/p>/g,
      prefix: "",
    },
    // <li><a href="...">...</a>
    {
      regex:
        /<li><a href="(https?:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+))\/?[^"]*">[^<]*<\/a>/g,
      prefix: "<li>",
    },
  ];

  // 全てのマッチを収集
  const matches: Array<{
    full: string;
    url: string;
    owner: string;
    repo: string;
    prefix: string;
  }> = [];

  for (const { regex, prefix } of patterns) {
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: 正規表現のマッチを収集
    while ((match = regex.exec(html)) !== null) {
      matches.push({
        full: match[0],
        url: match[1],
        owner: match[2],
        repo: match[3],
        prefix,
      });
    }
  }

  if (matches.length === 0) return { html, hadFailure: false };

  // 重複を除去してAPI呼び出し
  const uniqueRepos = [...new Set(matches.map((m) => `${m.owner}/${m.repo}`))];
  const repoInfoMap = new Map<string, GitHubRepoInfo | null>();
  let hadFailure = false;

  await Promise.all(
    uniqueRepos.map(async (key) => {
      const [owner, repo] = key.split("/");
      const info = await fetchGitHubRepoInfo(owner, repo);
      if (info === null) hadFailure = true;
      repoInfoMap.set(key, info);
    }),
  );

  // 置換
  for (const { full, url, owner, repo, prefix } of matches) {
    const info = repoInfoMap.get(`${owner}/${repo}`) ?? null;
    const card = generateGitHubCard(url, owner, repo, info, prefix);
    html = html.replace(full, card);
  }

  return { html, hadFailure };
}

export async function parseMarkdown(raw: string): Promise<Post> {
  const { data, content } = parseFrontmatterRaw(raw);

  // 見出しを収集
  const tocItems: TocItem[] = [];
  const headingIds = new Map<string, boolean>();

  const renderer = new marked.Renderer();

  renderer.heading = ({ text, depth }) => {
    // h2, h3 のみ目次に含める
    if (depth === 2 || depth === 3) {
      let id = generateId(text);

      // 重複IDの処理: 既に使われているIDなら連番サフィックスを付ける
      const baseId = id;
      if (headingIds.has(id)) {
        let suffix = 1;
        while (headingIds.has(`${baseId}-${suffix}`)) {
          suffix++;
        }
        id = `${baseId}-${suffix}`;
      }
      headingIds.set(id, true);

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

  // GitHub埋め込みを変換（API呼び出しあり）
  const githubEmbedResult = await convertGitHubEmbeds(bodyHtml);
  bodyHtml = githubEmbedResult.html;
  const hadEmbedFailure = githubEmbedResult.hadFailure;

  // 本文内画像のalt補完と遅延読み込み属性を付与
  bodyHtml = ensureImgAttributes(bodyHtml);

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
    // </script>をプレースホルダーに置換してscriptタグが閉じないようにする
    rawContent: content.replace(/<\/script/gi, "__SCRIPT_CLOSE__"),
    ...(hadEmbedFailure ? { hadEmbedFailure: true } : {}),
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
