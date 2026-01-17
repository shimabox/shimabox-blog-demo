import type { FC } from "hono/jsx";
import type { Env, Post } from "../types";
import { Layout } from "./Layout";

type PostViewProps = {
  post: Post;
  env: Env;
};

export const PostView: FC<PostViewProps> = ({ post, env }) => {
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
              <img src={post.image} alt={post.title} />
            </div>
          )}
          <div class="post-title-meta-detail">
            <h1>
              {post.title}
              <img
                src={hatenaBookmarkUrl}
                style="vertical-align:middle;margin:3px 0 0 5px;border:none;border-radius:0;"
                alt="はてなブックマーク"
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
            </div>
          </div>
        )}
      </article>
      <div class="back-link">
        {post.fixedPage ? (
          <a href="/">← TOPに戻る</a>
        ) : (
          <a href="/" onclick="history.back(); return false;">
            ← 記事一覧に戻る
          </a>
        )}
      </div>
    </Layout>
  );
};
