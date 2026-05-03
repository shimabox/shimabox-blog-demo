import { raw } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
import type { Env, PostMeta } from "../types";

type LayoutProps = PropsWithChildren<{
  title?: string;
  post?: PostMeta;
  env: Env;
}>;

export const Layout: FC<LayoutProps> = ({ title, post, env, children }) => {
  const pageTitle = title ? `${title} | ${env.SITE_TITLE}` : env.SITE_TITLE;
  const description = post?.excerpt || env.SITE_DESCRIPTION;
  const ogImage = post
    ? `${env.SITE_URL}/ogp/${post.slug}.png`
    : `${env.SITE_URL}/ogp/default.png`;

  const url = post
    ? (() => {
        const date = new Date(post.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${env.SITE_URL}/${year}/${month}/${day}/${post.slug}/`;
      })()
    : env.SITE_URL;

  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="ja">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>{pageTitle}</title>
          <meta name="description" content={description} />
          <link rel="canonical" href={url} />

          {/* OGP */}
          <meta property="og:title" content={pageTitle} />
          <meta property="og:type" content={post ? "article" : "website"} />
          <meta property="og:url" content={url} />
          <meta property="og:image" content={ogImage} />
          <meta property="og:site_name" content={env.SITE_TITLE} />
          <meta property="og:description" content={description} />

          {/* Twitter Card */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={pageTitle} />
          <meta name="twitter:image" content={ogImage} />
          <meta name="twitter:description" content={description} />

          {/* RSS */}
          <link
            rel="alternate"
            type="application/rss+xml"
            title={env.SITE_TITLE}
            href={`${env.SITE_URL}/feed/`}
          />

          {/* CSS */}
          <link rel="stylesheet" href="/styles.css" />

          {/* 記事ページのみ: highlight.js / Twitter widget の preconnect / dns-prefetch */}
          {post && (
            <>
              <link
                rel="preconnect"
                href="https://cdnjs.cloudflare.com"
                crossorigin=""
              />
              <link rel="dns-prefetch" href="https://platform.twitter.com" />
              <link
                rel="stylesheet"
                href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
              />
            </>
          )}
          <link rel="icon" href="/favicon.ico" />

          {/* Theme initialization (must be in head to prevent flash) */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
            (function() {
              var savedTheme = localStorage.getItem('theme');
              var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
                document.documentElement.setAttribute('data-theme', 'dark');
              }
            })();
            `,
            }}
          />
        </head>
        <body>
          <header>
            <div class="container">
              <div class="header-top">
                <div>
                  <h1>
                    <a href="/">{env.SITE_TITLE}</a>
                  </h1>
                  <p>{env.SITE_DESCRIPTION}</p>
                </div>
                <button
                  type="button"
                  class="theme-toggle"
                  id="theme-toggle"
                  aria-label="テーマ切り替え"
                >
                  ☀️
                </button>
              </div>
              <nav aria-label="メインナビゲーション">
                <a href="/">Home</a>
                <a href="/about/">About</a>
              </nav>
            </div>
          </header>
          <main class={`container${post ? " post-detail" : ""}`}>
            {children}
          </main>
          <footer>
            <div class="container">
              <a href="/about/">About</a>
              <a href="/privacypolicy/">プライバシーポリシー</a>
              <a href="/feed/">RSS</a>
              <p style="margin-top: 1rem;">
                © {new Date().getFullYear()} {env.SITE_TITLE}
              </p>
            </div>
          </footer>
          {/* highlight.js / Twitter widget は記事ページのみロード */}
          {post && (
            <>
              <script
                defer
                src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"
                onload="hljs.highlightAll()"
              />
              <script
                async
                src="https://platform.twitter.com/widgets.js"
                charset="utf-8"
              ></script>
            </>
          )}
          <script
            dangerouslySetInnerHTML={{
              __html: `
          // Theme toggle button
          (function() {
            const toggle = document.getElementById('theme-toggle');
            const html = document.documentElement;

            // Set initial icon
            if (html.getAttribute('data-theme') === 'dark') {
              toggle.textContent = '🌙';
            }

            toggle.addEventListener('click', () => {
              const isDark = html.getAttribute('data-theme') === 'dark';
              if (isDark) {
                html.removeAttribute('data-theme');
                toggle.textContent = '☀️';
                localStorage.setItem('theme', 'light');
              } else {
                html.setAttribute('data-theme', 'dark');
                toggle.textContent = '🌙';
                localStorage.setItem('theme', 'dark');
              }
            });
          })();

          // Lightbox
          (function() {
            const overlay = document.createElement('div');
            overlay.className = 'lightbox-overlay';
            overlay.innerHTML = '<span class="lightbox-close">&times;</span><img src="" alt="">';
            document.body.appendChild(overlay);

            const lightboxImg = overlay.querySelector('img');

            document.querySelectorAll('.post-thumbnail-detail img').forEach(img => {
              img.addEventListener('click', () => {
                lightboxImg.src = img.src;
                lightboxImg.alt = img.alt;
                overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
              });
            });

            overlay.addEventListener('click', () => {
              overlay.classList.remove('active');
              document.body.style.overflow = '';
            });

            document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape' && overlay.classList.contains('active')) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
              }
            });
          })();

          // Copy button
          document.querySelectorAll('pre').forEach(pre => {
            const btn = document.createElement('button');
            btn.textContent = 'Copy';
            btn.className = 'copy-btn';
            btn.onclick = () => {
              navigator.clipboard.writeText(pre.textContent);
              btn.textContent = 'Copied!';
              setTimeout(() => btn.textContent = 'Copy', 2000);
            };
            pre.style.position = 'relative';
            pre.appendChild(btn);
          });
        `,
            }}
          />
        </body>
      </html>
    </>
  );
};
