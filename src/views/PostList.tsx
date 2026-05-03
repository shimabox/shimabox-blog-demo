import type { FC } from "hono/jsx";
import type { Env, PostMeta } from "../types";
import { Layout } from "./Layout";
import { Pagination } from "./Pagination";

type PostListProps = {
  posts: PostMeta[];
  env: Env;
  currentPage?: number;
  totalPages?: number;
  category?: string;
};

function formatDateUrl(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function formatDateDisplay(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function getHatenaBookmarkUrl(
  siteUrl: string,
  dateUrl: string,
  slug: string,
): string {
  const postUrl = `${siteUrl}/${dateUrl}/${slug}/`;
  return `//b.hatena.ne.jp/entry/image/${encodeURI(postUrl)}`;
}

/**
 * /images/foo.png → /images/foo-thumb.webp
 * scripts/optimize-images.ts が生成する縮小版 WebP のパスを返す
 */
function thumbWebpUrl(originalUrl: string): string {
  return originalUrl.replace(/\.(jpe?g|png)$/i, "-thumb.webp");
}

export const PostList: FC<PostListProps> = ({
  posts,
  env,
  currentPage = 1,
  totalPages = 1,
  category,
}) => {
  const title = category ? `カテゴリー: ${category}` : undefined;

  return (
    <Layout title={title} env={env}>
      {category && (
        <div class="category-header">
          <h1>カテゴリー: {category}</h1>
        </div>
      )}

      <ul class="post-list">
        {posts.map((post) => {
          const dateUrl = formatDateUrl(post.date);
          const url = `/${dateUrl}/${post.slug}/`;
          const hatenaBookmarkUrl = getHatenaBookmarkUrl(
            env.SITE_URL,
            dateUrl,
            post.slug,
          );

          return (
            <li class="post-item">
              <div class="post-header">
                {post.image && (
                  <a href={url} class="post-thumbnail">
                    <picture>
                      <source
                        srcset={thumbWebpUrl(post.image)}
                        type="image/webp"
                      />
                      <img
                        src={post.image}
                        alt={post.title}
                        loading="lazy"
                        decoding="async"
                        width="80"
                        height="80"
                      />
                    </picture>
                  </a>
                )}
                <div class="post-title-meta">
                  <h2>
                    <a href={url}>{post.title}</a>
                    <img
                      src={hatenaBookmarkUrl}
                      style="vertical-align:middle;margin:3px 0 3px 5px;border:none;border-radius:0;"
                      alt="はてなブックマーク"
                      width="35"
                      height="13"
                      decoding="async"
                    />
                  </h2>
                  <div class="post-date">
                    <time>{formatDateDisplay(post.date)}</time>
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
              {post.excerpt && (
                <p class="post-excerpt">
                  {post.excerpt}
                  <a href={url} class="read-more">
                    <span class="sr-only">「{post.title}」の</span>続きを読む
                  </a>
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {totalPages > 1 && (
        <Pagination currentPage={currentPage} totalPages={totalPages} />
      )}
    </Layout>
  );
};
