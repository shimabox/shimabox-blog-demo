import type { FC } from "hono/jsx";
import type { Env, Post, PostMeta } from "../types";
import { Layout } from "./Layout";

type PostViewProps = {
  post: Post;
  env: Env;
  prevPost?: PostMeta | null;
};

function postMetaUrl(meta: PostMeta): string {
  const d = new Date(meta.date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `/${y}/${m}/${day}/${meta.slug}/`;
}

export const PostView: FC<PostViewProps> = ({ post, env, prevPost }) => {
  const date = new Date(post.date);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  const postUrl = `${env.SITE_URL}/${year}/${month}/${day}/${post.slug}/`;
  // X用: 日本語slugをエンコードしてリンクとして認識されるようにする
  const postUrlForX = `${env.SITE_URL}/${year}/${month}/${day}/${encodeURIComponent(post.slug)}/`;
  const hatenaBookmarkUrl = `//b.hatena.ne.jp/entry/image/${encodeURI(postUrl)}`;

  return (
    <Layout title={post.title} post={post} env={env}>
      <article>
        <div class="post-header-detail">
          {post.image && (
            <div class="post-thumbnail-detail">
              <img
                src={post.image}
                alt={post.title}
                width="120"
                height="120"
                fetchpriority="high"
                decoding="async"
              />
            </div>
          )}
          <div class="post-title-meta-detail">
            <h1>
              {post.title}
              <img
                src={hatenaBookmarkUrl}
                style="vertical-align:middle;margin:3px 0 0 5px;border:none;border-radius:0;"
                alt="はてなブックマーク"
                width="35"
                height="13"
                decoding="async"
              />
            </h1>
            <div class="post-date">
              <time datetime={post.date}>
                {year}/{month}/{day}
              </time>
            </div>
          </div>
        </div>
        <div class="post-tags">
          {post.categories.map((cat) => (
            <a
              href={`/category/${encodeURIComponent(cat)}/`}
              class="category-tag"
            >
              {cat}
            </a>
          ))}
          {post.tags.map((tag) => (
            <span class="tag">{tag}</span>
          ))}
        </div>
        <div
          class="post-body"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
        {!post.fixedPage && (
          <div class="share-buttons">
            <span class="share-text">📢 よろしければシェアお願いします</span>
            <div class="share-buttons-list">
              <a
                href={`https://x.com/intent/tweet?url=${encodeURIComponent(postUrlForX)}&text=${encodeURIComponent(post.title)}`}
                class="share-button share-x"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Xでシェア"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  role="img"
                  aria-label="X"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href={`https://b.hatena.ne.jp/entry/${postUrl}`}
                class="share-button share-hatena"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="はてなブックマークに追加"
              >
                <span class="hatena-icon">B!</span>
              </a>
              <a
                href={`https://curaq.app/share?url=${encodeURIComponent(postUrl)}`}
                class="share-button share-curaq"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="CuraQに保存"
              >
                <span class="curaq-icon">CuraQ</span>
              </a>
              <button
                type="button"
                class="share-button copy-markdown-button"
                aria-label="記事のマークダウンをコピー"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  role="img"
                  aria-label="Copy"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>記事のマークダウンをコピー</span>
              </button>
            </div>
            <script
              type="text/plain"
              id="raw-markdown"
              dangerouslySetInnerHTML={{ __html: post.rawContent }}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  (function() {
                    var btn = document.querySelector('.copy-markdown-button');
                    if (!btn) return;
                    btn.addEventListener('click', async function() {
                      try {
                        var el = document.getElementById('raw-markdown');
                        if (!el) throw new Error('Not found');
                        var text = el.textContent.replace(/__SCRIPT_CLOSE__/g, '</script');
                        await navigator.clipboard.writeText(text);
                        this.classList.add('copied');
                        setTimeout(function() { btn.classList.remove('copied'); }, 2000);
                      } catch (e) {
                        alert('コピーに失敗しました');
                      }
                    });
                  })();
                `,
              }}
            />
          </div>
        )}
      </article>
      {!post.fixedPage && prevPost && (
        <nav class="post-nav">
          <a href={postMetaUrl(prevPost)} class="post-nav-next">
            <div class="post-nav-content">
              <span class="post-nav-label">次の記事</span>
              <span class="post-nav-title">{prevPost.title}</span>
            </div>
            <svg
              class="post-nav-arrow"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              role="img"
              aria-label="次へ"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </nav>
      )}
      <div class="back-link">
        {post.fixedPage ? (
          <a href="/">← TOPに戻る</a>
        ) : (
          <a
            href="/"
            onclick="document.referrer.includes(location.host) ? history.back() : location.href = '/'; return false;"
          >
            ← 記事一覧に戻る
          </a>
        )}
      </div>
    </Layout>
  );
};
