# システムアーキテクチャ

## 概要

Hono + Cloudflare Pages + R2 で構築した個人ブログシステム。

## アーキテクチャ図

### 本番環境

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Browser    │───▶│    Pages     │───▶│     KV       │       │
│  │              │◀───│  Functions   │◀───│   (Cache)    │       │
│  └──────────────┘    └──────┬───────┘    └──────────────┘       │
│                             │                  ▲                │
│                             │ Cache Miss       │ Cache Put      │
│                             ▼                  │                │
│                      ┌──────────────┐          │                │
│                      │      R2      │──────────┘                │
│                      │  (Storage)   │                           │
│                      └──────────────┘                           │
│                             │                                   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                    GitHub Repository                            │
├─────────────────────────────┼───────────────────────────────────┤
│                             │                                   │
│  ┌──────────────┐    ┌──────┴───────┐    ┌──────────────┐       │
│  │   content/   │───▶│   GitHub     │───▶│  Cloudflare  │       │
│  │  posts/*.md  │    │   Actions    │    │   R2 Sync    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                             │                                   │
│                             ▼                                   │
│                      Cache Invalidate                           │
│                           + Warm                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### ローカル開発環境

```
┌─────────────────────────────────────────────────────────────────┐
│                     Local Development                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Browser    │───▶│ dev-server   │───▶│   content/   │       │
│  │              │◀───│   (Hono)     │◀───│  posts/*.md  │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                                   │
│         │ WebSocket         │ ファイル監視                        │
│         │                   ▼                                   │
│         │            ┌──────────────┐                           │
│         └───────────▶│  LiveReload  │                           │
│                      └──────────────┘                           │
│                                                                 │
│  npm run dev → http://localhost:8787                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- R2/KVを使わず、ローカルの `content/` から直接読み込み
- ファイル変更時に自動リロード（LiveReload）
- 環境変数は dev-server.tsx 内にハードコード（`.dev.vars` は使用されない）

## データフロー

### 記事の追加・更新

1. `content/posts/YYYY-MM-DD-slug.md` を作成・編集
2. GitHub にプッシュ
3. GitHub Actions が R2 に同期 → キャッシュ無効化 → プリウォーム

### 記事の表示

1. ユーザーがページにアクセス
2. KV キャッシュをチェック（ヒットすれば即座に返却）
3. キャッシュミス時は R2 から取得 → Markdown パース → KV に保存

### キャッシュ戦略

- TTL なし（無期限）で保持
- 記事更新時に明示的に無効化
- デプロイ直後にプリウォームで再生成

詳細は [cache-strategy.md](cache-strategy.md) を参照。

## 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | [Hono](https://hono.dev/)（JSX対応） |
| ホスティング | Cloudflare Pages Functions |
| ストレージ | Cloudflare R2（記事・画像） |
| キャッシュ | Cloudflare KV（無期限、明示的無効化） |
| OGP画像生成 | Satori + @resvg/resvg-js（ビルド時） |
| シンタックスハイライト | highlight.js（CDN） |
| Lint/Format | Biome |

## 料金

個人ブログ規模であればCloudflareの無料枠内で運用可能。

### R2（ストレージ）

| 項目 | 無料枠 |
|------|--------|
| Storage | 10 GB/月 |
| Class A Operations（書き込み等） | 1M/月 |
| Class B Operations（読み取り等） | 10M/月 |

### KV（キャッシュ）

| 項目 | 無料枠 |
|------|--------|
| Read | 100k/日 |
| Write | 1k/日 |
| Storage | 1 GB |

### Pages Functions

| 項目 | 無料枠 |
|------|--------|
| Requests | 100k/日 |

個人ブログ規模であれば無料枠を超えることはほぼない。後述の「マークダウンコピー」機能では、生のマークダウンをページに埋め込む方式を採用している。ページ容量は多少増加するが、無料枠内で収まると思われる。

**参考**
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [KV Pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [Pages Functions Pricing](https://developers.cloudflare.com/pages/functions/pricing/)

※ 料金体系は変更される可能性があるため、最新情報は公式ドキュメントを参照してください。

## ディレクトリ構成

```
your-blog/
├── .github/workflows/     # GitHub Actions（自動デプロイ）
├── content/
│   ├── posts/             # 記事（YYYY-MM-DD-slug.md）
│   ├── pages/             # 固定ページ（about.md, privacypolicy.md）
│   └── images/            # 画像、OGP画像（ogp/）
├── docs/                  # ドキュメント
├── fonts/                 # OGP生成用フォント（.gitignore）
├── functions/             # Pages Functions
│   └── [[path]].ts        # エントリポイント
├── public/                # 静的ファイル
│   ├── styles.css         # メインCSS
│   └── _routes.json       # 静的ファイルルーティング
├── scripts/               # ユーティリティスクリプト
│   ├── sync.ts            # R2同期
│   └── generate-ogp.ts    # OGP画像生成
├── src/
│   ├── index.tsx          # ルーティング
│   ├── markdown.ts        # Markdownパーサー（目次・埋め込み対応）
│   ├── repository.ts      # データ取得（R2/KV）
│   ├── rss.ts             # RSSフィード生成
│   ├── types.ts           # 型定義
│   └── views/             # JSXコンポーネント
│       ├── Layout.tsx     # 共通レイアウト
│       ├── PostList.tsx   # 記事一覧
│       ├── PostView.tsx   # 記事詳細
│       ├── Pagination.tsx # ページネーション
│       └── NotFound.tsx   # 404ページ
├── dev-server.tsx         # 開発サーバー（LiveReload対応）
├── biome.json
├── tsconfig.json
├── wrangler.toml
└── package.json
```

## URL構造

| パス | 説明 |
|------|------|
| `/` | トップページ |
| `/page/:page/` | ページネーション |
| `/category/:name/` | カテゴリ別一覧 |
| `/:year/:month/:day/:slug/` | 記事詳細（WordPress互換） |
| `/about/` | Aboutページ |
| `/privacypolicy/` | プライバシーポリシー |
| `/feed/` | RSSフィード |
| `/ogp/:slug.png` | OGP画像 |
| `/images/*` | 画像配信 |

## 機能

### マークダウンコピー

記事ページにある「記事のマークダウンをコピー」ボタンで、記事の生マークダウンをクリップボードにコピーできる。

**実装方式**
- `Post`型に`rawContent`（frontmatter除去済みの本文）を保持
- ページ生成時に`<script type="text/plain">`として埋め込み
- ボタンクリックで`navigator.clipboard.writeText()`を使用してコピー

**この方式のメリット**
- APIエンドポイント不要
- fetchなしで即座にコピー可能
- 記事更新はデプロイで自動反映

**レスポンシブ対応**
- 640px未満：アイコンのみ表示
- 640px以上：アイコン + テキスト表示
