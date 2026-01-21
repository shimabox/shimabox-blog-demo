# セットアップガイド

このガイドでは、ブログを自分の環境にデプロイするための手順を説明します。

## 1. リポジトリをフォーク（またはクローン）

GitHub Actionsでの自動デプロイを使うには、自分のGitHubリポジトリが必要なのでフォークしてください。

```bash
# フォークしたリポジトリをクローン
git clone https://github.com/your-account/your-blog.git
cd your-blog
npm install
```

> [!NOTE]
> ローカルで動かすだけならクローンでもOKですが、自動デプロイまでやるならフォークが必要です。

## 2. Cloudflare リソースの作成

Cloudflareアカウントが必要です。まだお持ちでない場合は [Cloudflare](https://dash.cloudflare.com/sign-up) で無料アカウントを作成してください。

初回は `wrangler login` でCloudflareにログインしてください。

```bash
npx wrangler login
```

その後、以下のコマンドでリソースを作成します。
後続の「wrangler.toml の設定」で使用するので、表示されるIDは控えておいてください。

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

## 3. wrangler.toml の設定

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
SITE_URL = "https://your-blog-name.pages.dev" # あなたのブログURLに変更（https://{name}.pages.dev となるように）
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

## 4. フォントの準備

OGP画像生成用のフォントをダウンロードして配置します。
すでに配置済みですが、必要に応じて更新してください。

```bash
mkdir -p fonts
# Google Fonts から Noto Sans JP をダウンロード
# https://fonts.google.com/noto/specimen/Noto+Sans+JP
# NotoSansJP-Bold.ttf を fonts/ に配置
```

## 5. アバター画像の配置

OGP画像に表示するアバター画像を配置します。
無くても動作しますが、あると見栄えが良くなります。

```bash
# content/images/avatar.png にアバター画像を配置
```

## 6. favicon の配置

ブラウザのタブに表示されるアイコンを設定します。

```bash
# content/images/favicon.ico にアイコンファイルを配置
```

## 7. 設定ファイルの更新

以下のファイルで `TODO` コメントを検索し、自分の設定に変更してください。

- `wrangler.toml` - サイト情報
- `dev-server.tsx` - 開発用サイト情報
  - `SITE_TITLE`, `SITE_DESCRIPTION`
- `scripts/sync.ts` - R2バケット名
  - `const BUCKET = "your-blog-content";` を自分のバケット名に変更
- `scripts/generate-ogp.ts` - サイト情報、アバターパス
- `src/markdown.ts` - GitHub API用User-Agent
  - `"User-Agent": "your-site-name"` を自分のサイト名に変更

## 8. ローカル開発

```bash
npm run dev
# http://localhost:8787 でアクセス
```

> [!NOTE]
> `npm run dev`（dev-server.tsx）では `.dev.vars` は読み込まれません。
> dev-server.tsx は LiveReload 対応のため独自実装しており、環境変数は dev-server.tsx 内にハードコードされています。
> `.dev.vars` を使用するには `npx wrangler pages dev` で起動する必要があります。

## 9. 初回デプロイ

> [!WARNING]
> デプロイ前に、Cloudflare側に環境変数 `ADMIN_KEY` を設定してください。
> `ADMIN_KEY` が未設定の場合、キャッシュ無効化API（`/api/invalidate`）は常に 401 エラーを返します。

[ADMIN_KEY の設定](#admin_key-の設定) を参照してください。

### デプロイコマンド

```bash
# OGP画像生成
npm run generate-ogp

# R2にコンテンツを同期
npm run sync

# Cloudflare Pages にデプロイ
npm run deploy
```

---

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動（LiveReload対応） |
| `npm run deploy` | Cloudflare Pagesにデプロイ |
| `npm run sync` | コンテンツをR2に同期 |
| `npm run sync -- slug` | 特定記事のみR2に同期 |
| `npm run sync:delete` | `/content` 以下を正としてR2を同期 |
| `npm run generate-ogp` | OGP画像を生成 |
| `npm run generate-ogp -- slug --force` | 特定記事のOGPを上書き生成 |
| `npm run generate-ogp:force` | 全OGPを上書き生成 |
| `npm run check` | Biome + 型チェック |
| `npm run check:fix` | Biomeでチェック＆自動修正 |
| `npm run typecheck` | 型チェックのみ |

---

## 記事の追加

### 1. 記事ファイルを作成

`content/posts/YYYY-MM-DD-slug.md` という形式でファイルを作成します。

```yaml
---
title: "記事タイトル"
slug: "article-slug"
date: "2026-01-15"
categories: ["カテゴリ1", "カテゴリ2"]
image: "/images/2026/01/thumbnail.png"  # オプション（OGP背景にも使用）
ogp_bg: false  # オプション（OGP背景画像を無効化する場合）
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

### 記事追加の流れ（まとめ）

```bash
# 1. content/posts/YYYY-MM-DD-slug.md を作成

# 2. OGP画像生成
npm run generate-ogp -- slug-name --force

# 3. ローカル確認
npm run dev

# 4. mainにpush → 自動デプロイ
```

---

## 本番デプロイ（手動）

```bash
# 1. OGP画像生成（必要に応じて）
npm run generate-ogp

# 2. Pagesデプロイ
npm run deploy

# 3. コンテンツ同期
npm run sync

# 4. キャッシュ無効化（必要に応じて）
curl -X POST https://your-blog-name.pages.dev/api/invalidate \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

---

## GitHub Actions

mainブランチへのpushで自動デプロイが実行されます。手動実行（workflow_dispatch）も可能。

> [!IMPORTANT]
> deploy.yml は直前のコミットとの差分を検知して同期するため、PRをマージする際は **Squash and merge** を使用してください。通常のマージだと差分検知が正しく動作しない場合があります。

### deploy_type オプション

| deploy_type | 説明 |
|-------------|------|
| `diff` | 変更されたファイルのみ同期（デフォルト）。削除されたファイルも自動検出してR2から削除 |
| `full` | 全ファイルを同期 + R2のorphaned filesを削除 |
| `full-posts` | 記事・ページのみ全件同期（画像除く）+ R2のorphaned filesを削除 |
| `slug` | 指定したslugのみ同期（slug入力必要） |
| `deploy` | 同期なしでデプロイのみ |

> [!NOTE]
> mainブランチへのpush時、`git diff`で削除されたファイルを検出し、R2から自動削除します。
> 削除された記事のキャッシュも自動的にクリアされます。

### PRの変更検出

PRを作成すると、CIが自動的にコンテンツファイルの変更を検出し、PRコメントに以下の情報を表示します:

- ➕ **Added**: 追加されたファイル
- 📝 **Modified**: 変更されたファイル
- 🗑️ **Deleted**: 削除されたファイル

### 必要なSecrets

GitHub リポジトリの Settings > Secrets and variables > Actions で以下を設定します。

| Secret | 説明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウントID |
| `SITE_URL` | デプロイ先URL（キャッシュウォーム用） |
| `ADMIN_KEY` | 管理API用の認証キー（キャッシュ無効化、R2オブジェクト一覧取得） |

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

---

## 環境変数

### wrangler.toml（コミットOK）

```toml
[vars]
SITE_URL = "https://your-blog-name.pages.dev"
SITE_TITLE = "Your Blog Title"
SITE_DESCRIPTION = "Your blog description"
```

### .dev.vars（Wrangler用、コミットNG）

Wrangler 経由でローカル実行する際の環境変数を設定するファイルです。

```
# 例
SITE_TITLE=ローカルテスト用タイトル
```

### Cloudflare Dashboard（本番用）

Settings → Variables and Secrets で設定:
- `ADMIN_KEY`: 管理API用の秘密鍵（Encrypt にチェック）

> [!IMPORTANT]
> `ADMIN_KEY` は Cloudflare と GitHub Secrets の両方に**同じ値**を設定してください。
> - 未設定の場合: `/api/invalidate` と `/api/r2-list` は常に 401 エラーを返します
> - 値が不一致の場合: GitHub Actions のキャッシュ無効化やfull syncが失敗します

---

## OGP画像

### ファイル命名規則

- 通常記事: `YYYY-MM-DD-slug.png`（例: `2026-01-05-looking-back-at-2025.png`）
- デフォルト: `default.png`
- 保存先: `content/images/ogp/`

### 日本語slugの扱い

- ファイル名は日本語のまま保存
- R2キーも日本語のまま

### デザイン

- 背景: グラデーション（#1a1a2e → #16213e → #0f3460）
- タイトル: 白、52px
- 日付: 白（透明度70%）、24px
- サイト名: ティールグリーン（#1abc9c）、右下
- アバター画像: 右下に表示

### 背景画像

frontmatterに`image`を指定すると、OGP画像の背景として使用されます。

- デフォルトで有効（`ogp_bg: true`）
- 無効にする場合は `ogp_bg: false` を指定
- 背景画像使用時は暗いオーバーレイ（透明度60%）が重なり、テキストが見やすくなる

---

## トラブルシューティング

### 記事が表示されない

```bash
npm run sync -- slug-name
```

### OGP画像が404

```bash
npm run generate-ogp -- slug-name --force
npm run sync -- slug-name
```

### 削除した記事・画像がR2に残っている

```bash
export SITE_URL=https://your-blog-name.pages.dev
export ADMIN_KEY=your-admin-key
npm run sync:delete
```

> [!NOTE]
> `SITE_URL`と`ADMIN_KEY`環境変数が必要です（本番APIを使用してR2オブジェクト一覧を取得するため）。
> mainブランチへのpush時は、CIで自動的に削除されたファイルがR2から削除されます。

### 本番で更新が反映されない

キャッシュを無効化:

```bash
curl -X POST https://your-blog-name.pages.dev/api/invalidate \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```
