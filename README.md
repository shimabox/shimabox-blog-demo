# shimabox-blog-demo

Hono と Cloudflare Pages を使ったブログテンプレートです。

> [!NOTE]
> https://blog.shimabox.net で実際に運用しているブログの元です

## 特徴

- **Hono**: 軽量で高速なWebフレームワーク
- **Cloudflare Pages**: エッジでの高速配信
- **Cloudflare R2**: 記事・画像の保存（S3互換、エグレス無料）
- **Cloudflare KV**: キャッシュ
- **OGP画像自動生成**: Satori + resvg-js
- **ダークモード対応**: システム設定連動 + 手動切り替え
- **シンタックスハイライト**: highlight.js (CDN)
- **RSSフィード**: 自動生成
- **Markdown**: 記事はMarkdownで記述

## おためし

リポジトリをForkまたはCloneして、ローカルで動作確認できます。

```bash
git clone https://github.com/shimabox/shimabox-blog-demo.git
cd shimabox-blog-demo
npm install
npm run dev
```

http://localhost:8787 でアクセスできます。

## セットアップ

### 1. リポジトリをフォーク（またはクローン）

GitHub Actionsでの自動デプロイを使うには、自分のGitHubリポジトリが必要なのでフォークしてください。

```bash
# フォークしたリポジトリをクローン
git clone https://github.com/your-account/your-blog.git
cd your-blog
npm install
```

> [!NOTE]
> ローカルで動かすだけならクローンでもOKですが、自動デプロイまでやるならフォークが必要です。

### 2. Cloudflare リソースの作成

Cloudflareアカウントが必要です。まだお持ちでない場合は [Cloudflare](https://dash.cloudflare.com/sign-up) で無料アカウントを作成してください。

初回は `wrangler login` でCloudflareにログインしてください。

```bash
npx wrangler login
```

その後、以下のコマンドでリソースを作成します。  
後続の、`wrangler.toml の設定` で使用するので、表示されるIDは控えておいてください。

```bash
# R2 バケット作成
npx wrangler r2 bucket create your-blog-content

# KV namespace 作成
npx wrangler kv namespace create CACHE
npx wrangler kv namespace create CACHE --preview
```

- R2 バケット名
  - your-blog-content
  - お好みでどうぞ
- KV namespace id
  - `npx wrangler kv namespace create CACHE` で作成時に表示されたid
  - `CACHE` は変更可能です
- KV namespace id(preview用)
  - `npx wrangler kv namespace create CACHE --preview` で作成時に表示されたid
  - `CACHE` は変更可能です

### 3. wrangler.toml の設定

`name` はCloudflare Pages全体でユニークである必要があります。この値がブログのURLになります。

```
https://{name}.pages.dev
```

例: `name = "my-tech-blog"` → `https://my-tech-blog.pages.dev`

```toml
name = "your-blog-name"  # ユニークな名前に変更（これがURLになります）
compatibility_date = "2026-01-01"
pages_build_output_dir = "./public"

[vars]
SITE_URL = "https://your-blog-name.pages.dev" # あなたのブログURLに変更（https.//{name}.pages.dev となるように）
SITE_TITLE = "Your Blog Title" # あなたのブログタイトルに変更
SITE_DESCRIPTION = "Your blog description" # あなたのブログ説明に変更

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "your-blog-content"  # 作成したバケット名に変更

[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"          # KV作成時に表示されたIDに変更
preview_id = "your-kv-preview-id"    # preview用のIDに変更
```

### 4. フォントの準備

OGP画像生成用のフォントをダウンロードして配置します。  
すでに配置済みですが、必要に応じて更新してください。

```bash
mkdir -p fonts
# Google Fonts から Noto Sans JP をダウンロード
# https://fonts.google.com/noto/specimen/Noto+Sans+JP
# NotoSansJP-Bold.ttf を fonts/ に配置
```

### 5. アバター画像の配置

OGP画像に表示するアバター画像を配置します。
無くても動作しますが、あると見栄えが良くなります。

```bash
# content/images/avatar.png にアバター画像を配置
```

### 6. favicon の配置

ブラウザのタブに表示されるアイコンを設定します。

```bash
# content/images/favicon.ico にアイコンファイルを配置
```

### 7. 設定ファイルの更新

以下のファイルで `TODO` コメントを検索し、自分の設定に変更してください。

- `wrangler.toml` - サイト情報
- `dev-server.tsx` - 開発用サイト情報
  - `SITE_TITLE`, `SITE_DESCRIPTION`
- `scripts/sync.ts` - R2バケット名
  - `const BUCKET = "your-blog-content";` を自分のバケット名に変更
- `scripts/generate-ogp.ts` - サイト情報、アバターパス

### 8. ローカル開発

```bash
npm run dev
# http://localhost:8787 でアクセス
```

### 9. 初回デプロイ

> [!WARNING]
> デプロイ前に、Cloudflare側に環境変数 `ADMIN_KEY` を設定してください。
> `ADMIN_KEY` が未設定の場合、キャッシュ無効化API（`/api/invalidate`）は常に 401 エラーを返します。

[ADMIN_KEY の設定](https://github.com/shimabox/shimabox-blog-demo?tab=readme-ov-file#admin_key-%E3%81%AE%E8%A8%AD%E5%AE%9A "ADMIN_KEY の設定") を参考にしてください。

#### デプロイコマンド

```bash
# OGP画像生成
npm run generate-ogp

# R2にコンテンツを同期
npm run sync

# Cloudflare Pages にデプロイ
npm run deploy
```

## コマンド一覧

```bash
# 開発
npm run dev  # 開発サーバー起動（LiveReload対応）

# コンテンツ同期
npm run sync               # 全コンテンツをR2に同期
npm run sync -- slug-name  # 特定記事のみ同期

# OGP画像
npm run generate-ogp                  # 未生成のOGP生成
npm run generate-ogp:force            # 全OGP上書き生成
npm run generate-ogp -- slug          # 特定記事のOGP生成
npm run generate-ogp -- slug --force  # 特定記事のOGP上書き生成

# デプロイ
npm run deploy  # Pages デプロイ

# Lint/Format
npm run check      # Biome チェック
npm run check:fix  # チェック＆自動修正
```

## 記事の追加

### 1. 記事ファイルを作成

`content/posts/YYYY-MM-DD-slug.md` という形式でファイルを作成します。

```yaml
---
title: "記事タイトル"
slug: "article-slug"
date: "2026-01-15"
categories: ["カテゴリ1", "カテゴリ2"]
image: "/images/2026/01/thumbnail.png"  # オプション
---

記事の本文をMarkdownで記述
```

#### スラッシュコマンド（Claude Code）

`/new-post` コマンドで簡単に記事を作成できます。

```
/new-post 記事のタイトル
```

実行すると

1. 日本語タイトルを英語slugに自動変換
2. 記事ファイル（`content/posts/YYYY-MM-DD-slug.md`）を作成
3. 画像ディレクトリを作成
4. サムネイル画像生成用のプロンプトを出力

をしてくれます。

### 2. OGP画像生成

```bash
npm run generate-ogp -- article-slug
```

### 3. R2に同期

```bash
npm run sync -- article-slug
```

### 4. デプロイ

```bash
npm run deploy
```

## GitHub Actions

mainブランチへのpushで自動デプロイが実行されます。

> [!IMPORTANT]
> deploy.yml は直前のコミットとの差分を検知して同期するため、PRをマージする際は **Squash and merge** を使用してください。通常のマージだと差分検知が正しく動作しない場合があります。

### 必要なSecrets

GitHub リポジトリの Settings > Secrets and variables > Actions で以下を設定します。

| Secret | 説明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウントID |
| `SITE_URL` | デプロイ先URL（キャッシュウォーム用） |
| `ADMIN_KEY` | キャッシュ無効化API用キー |

### API Token の作成

Cloudflare Dashboard > My Profile > API Tokens で「Create Token」から作成します。

必要なPermissions:

| Permission | Access |
|------------|--------|
| Account / Cloudflare Pages | Edit |
| Account / Workers R2 Storage | Edit |
| Account / Workers KV Storage | Edit |
| Account / Workers Scripts | Edit |

Account Resourcesで対象のアカウントを選択してください。

### Account ID の確認

Cloudflare Dashboard > Workers & Pages を開くと、右サイドバーに「Account ID」が表示されています。

または、ダッシュボードのURLから確認できます:
```
https://dash.cloudflare.com/xxxxxxxxxxxxxxxxxxxxxxx/workers-and-pages
                            ^^^^^^^^^^^^^^^^^^^^^^^^
                            この部分がAccount ID
```

### ADMIN_KEY の設定

`ADMIN_KEY` はキャッシュ無効化APIを保護するための秘密鍵です。ランダムな文字列（英数字32文字以上を推奨）を生成して設定してください。

> [!WARNING]
> `ADMIN_KEY` が未設定の場合、キャッシュ無効化API（`/api/invalidate`）は常に 401 エラーを返します。  
> `ADMIN_KEY` は Cloudflare と GitHub Secrets の両方に**同じ値**を設定してください。値が一致しないとキャッシュ無効化が失敗します。

**Cloudflare Dashboard での設定方法**

1. Workers & Pages > 対象のプロジェクト を開く
2. Settings > Variables and Secrets を選択
3. 「Add」ボタンをクリック
4. Variable name に `ADMIN_KEY`、Value に生成した値を入力
5. Type を「Secret」に変更（値が隠されます）
6. 「Save」ボタンで保存

**設定イメージ**

① Addをクリック
![secrets-set-adminkey-1](https://github.com/shimabox/assets/raw/master/shimabox-blog-demo/secrets-set-adminkey-1.png)

② ランダムな値（英数字32文字以上を推奨）を入力
![secrets-set-adminkey-2](https://github.com/shimabox/assets/raw/master/shimabox-blog-demo/secrets-set-adminkey-2.png)

以下のコマンドで生成できます。

```bash
# macOS / Linux
openssl rand -base64 32
```

### SITE_URL の設定

`SITE_URL` にはブログの公開URLを設定してください。  
例: `https://your-blog-name.pages.dev`

### Environment の作成

GitHub リポジトリの Settings > Environments で `production` と `preview` を作成し、上記のSecretsを設定してください。

## ディレクトリ構成

```
├── content/            # コンテンツ
│   ├── posts/          # 記事（YYYY-MM-DD-slug.md）
│   ├── pages/          # 固定ページ
│   └── images/         # 画像、OGP画像（ogp/）
├── fonts/              # フォント（.gitignore）
├── functions/          # Pages Functions
│   └── [[path]].ts     # エントリポイント
├── public/             # 静的ファイル
│   ├── styles.css      # メインCSS
│   └── _routes.json    # 静的ファイルルーティング
├── scripts/            # ユーティリティスクリプト
│   ├── sync.ts         # R2同期
│   └── generate-ogp.ts # OGP画像生成
├── src/                # アプリケーションコード
│   ├── index.tsx       # ルーティング
│   ├── markdown.ts     # Markdownパーサー
│   ├── repository.ts   # R2/KV操作
│   ├── rss.ts          # RSSフィード
│   ├── types.ts        # 型定義
│   └── views/          # JSXコンポーネント
├── dev-server.tsx      # 開発サーバー
├── biome.json
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## URL構成

| パス | 内容 |
|------|------|
| `/` | 記事一覧 |
| `/page/:page/` | ページネーション |
| `/YYYY/MM/DD/slug/` | 記事詳細 |
| `/category/:name/` | カテゴリ一覧 |
| `/about/` | About ページ |
| `/privacypolicy/` | プライバシーポリシー |
| `/feed/` | RSS |
| `/ogp/slug.png` | OGP画像 |
| `/images/*` | 画像配信 |

## Markdown記法

### 埋め込み対応

記事内のURLを自動的に埋め込みカードに変換

- **X (Twitter)**: `https://x.com/user/status/123`
- **YouTube**: `https://www.youtube.com/watch?v=xxx`
- **Gist**: `https://gist.github.com/user/gist_id`

### GitHub Alerts

```markdown
> [!NOTE]
> 補足情報

> [!TIP]
> ヒント

> [!IMPORTANT]
> 重要な情報

> [!WARNING]
> 警告

> [!CAUTION]
> 注意
```

### 絵文字ショートコード

`:smile:` → 😄、`:rocket:` → 🚀 など自動変換。

## ライセンス

[MIT](https://github.com/shimabox/shimabox-blog-demo/blob/main/LICENSE)
