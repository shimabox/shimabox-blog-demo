# CLAUDE.md

このファイルは Claude Code（または他の AI エージェント）がこのリポジトリで作業する際のガイドです。

## 重要なルール

- **git commit は自由に行ってよいが、必ずfeatureブランチを作成してから行うこと**
- **mainブランチへの直接コミットは禁止**
- **git push は必ずユーザーの確認を取ってから実行すること**
- **コミットとpushは別のアクションとして扱い、pushする前に確認を求める**
- **勝手にPRを投げたりしない、必ず確認をすること**
- https://github.com/shimabox/shimabox-blog のPRを取り込むことをお願いするが、https://github.com/shimabox/shimabox-blog からの取り込みとは書かないこと

## プロジェクト概要

Hono + Cloudflare Pages + R2 で構築したブログのテンプレート。記事・画像は R2、キャッシュは KV に置く。

詳細は [docs/architecture.md](docs/architecture.md) を参照。

## よく使うコマンド

```bash
# 開発
npm run dev                    # 開発サーバー起動（http://localhost:8787、LiveReload対応）

# 同期
npm run sync                   # 全コンテンツをR2に同期
npm run sync -- slug-name      # 特定記事のみ同期
npm run sync:delete            # ローカルを正としてR2を同期（ローカルにないファイルは削除）

# OGP画像
npm run generate-ogp                  # 未生成のOGP生成
npm run generate-ogp -- slug --force  # 特定記事のOGP上書き生成
npm run generate-ogp:force            # 全OGP上書き生成

# サムネ画像（記事一覧用 WebP）
npm run optimize-images                  # 全件（差分処理）
npm run optimize-images -- slug          # 特定slugの記事のサムネのみ
npm run optimize-images -- slug --force  # 特定slugを強制再生成
npm run optimize-images:force            # 全件強制再生成

# デプロイ
npm run deploy                 # Pages デプロイ

# Lint/Format/TypeCheck/Test
npm run check                  # Biome チェック + 型チェック
npm run check:fix              # Biome チェック＆自動修正
npm run typecheck              # 型チェックのみ
npm test                       # vitest（一回のみ）
npm run test:watch             # vitest（watchモード）
```

## 記事追加の流れ

```bash
# 1. content/posts/YYYY-MM-DD-slug.md を作成（Claude Code なら /new-post でも可）

# 2. OGP画像生成
npm run generate-ogp -- slug-name --force

# 3. サムネ画像（frontmatter `image:` 指定時のみ）の WebP を生成
npm run optimize-images -- slug-name

# 4. ローカル確認
npm run dev

# 5. 反映
#    - GitHub Actions のデプロイを有効化している場合: main にマージ → deploy.yml が同期・デプロイ
#    - 手動の場合: npm run sync -- slug-name && npm run deploy
```

> **画像差し替え時の注意**: 既存の画像ファイルを上書きした場合も `npm run optimize-images` を1回叩く。元画像の mtime が thumb より新しければ自動再生成される（`--force` 不要）。

## 重要な注意点

### 日本語 slug
- ファイル名・R2キーは日本語のまま保存（URLエンコードしない）
- Honoがリクエスト時にデコード、R2も日本語キーをそのまま扱う

### OGP 画像
- `scripts/generate-ogp.ts` で生成し、`content/images/ogp/` に出力
- ファイル名: `YYYY-MM-DD-slug.png`
- フォント必須: `fonts/NotoSansJP-Bold.ttf`
- アバター画像: `content/images/avatar.png`（任意。無ければアバターなしで生成）

### サムネ画像（WebP）
- 記事一覧（`PostList`）のサムネは `<picture>` で WebP 配信、フォールバックに元の PNG/JPG
- `scripts/optimize-images.ts` が frontmatter `image:` で参照されるサムネ画像のみ `*-thumb.webp` を生成
  - 320x320 max（retina で 80px 表示の 4倍）, quality 78
  - mtime 比較で差分処理（冪等）
- 本文中画像や OGP 画像は対象外
- **新記事追加 / 画像差し替え時は `npm run optimize-images` を1回叩く**（CIでは自動生成されない）

### ダークモード
- システム設定に連動 + 手動切り替え（選択は `localStorage` に保存）
- テーマ初期化スクリプトは `<head>` 内で実行（ちらつき防止）
- CSS変数で色を管理し、`[data-theme="dark"]` で切り替える

### 静的ファイル
- `public/_routes.json` で静的ファイルをFunctionsから除外
- CSSはFunctions経由せず直接配信

### 開発サーバーの環境変数
- `npm run dev`（dev-server.tsx）では `.dev.vars` は読み込まれない（環境変数は dev-server.tsx 内にハードコード）
- `.dev.vars` は `npx wrangler pages dev` で起動する場合のみ有効

### デプロイ（GitHub Actions）
- `ci.yml`: PR / main への push で Lint・型チェック・テストを実行
- `deploy.yml`: リポジトリ変数 `ENABLE_DEPLOY` が `true` のときだけ、main への push で R2 同期・Pages デプロイ・キャッシュ無効化を行う
- 差分検知のため、PR は **Squash and merge** でマージする
- 詳細は [docs/setup.md](docs/setup.md) の「GitHub Actions」を参照

## ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [docs/architecture.md](docs/architecture.md) | システム構成、技術スタック、ディレクトリ構成、URL構成 |
| [docs/setup.md](docs/setup.md) | セットアップ、コマンド、デプロイ、GitHub Actions、環境変数 |
| [docs/markdown-syntax.md](docs/markdown-syntax.md) | frontmatter、埋め込み、絵文字、GitHub Alerts |
| [docs/cache-strategy.md](docs/cache-strategy.md) | キャッシュ戦略の詳細 |
| [docs/livereload-setup.md](docs/livereload-setup.md) | LiveReloadセットアップ |

## トラブルシューティング

### 記事が表示されない
```bash
npm run sync
npm run dev
```

### OGP画像が404
```bash
npm run generate-ogp -- slug-name --force
npm run sync -- slug-name
```

### ローカルで削除した記事や画像がR2に残っている
```bash
export SITE_URL=https://your-blog.example.com
export ADMIN_KEY=your-admin-key
npm run sync:delete
```
※ `SITE_URL` と `ADMIN_KEY` の環境変数が必要です（本番APIでR2オブジェクト一覧を取得するため）
※ `ENABLE_DEPLOY` を有効にしている場合、main への push 時に deploy.yml が削除されたファイルを検出してR2から削除します。

### 本番で更新が反映されない
キャッシュを無効化:
```bash
curl -X POST https://your-blog.example.com/api/invalidate \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```
