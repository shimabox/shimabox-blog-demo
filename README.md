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

## :rocket: クイックスタート（ローカルで試す）

リポジトリをCloneして、ローカルで動作確認できます。

```bash
git clone https://github.com/shimabox/shimabox-blog-demo.git
cd shimabox-blog-demo
npm install
npm run dev
```

http://localhost:8787 でアクセスできます。

ファイルを編集・保存すると自動でリロードされます（LiveReload対応）。

https://github.com/user-attachments/assets/388c889e-ed50-4e47-8e79-65fe77b90dca

## ドキュメント

詳細なドキュメントは `docs/` にあります。

| ドキュメント | 内容 |
|-------------|------|
| [セットアップガイド](docs/setup.md) | フォークから本番デプロイまでの手順 |
| [システムアーキテクチャ](docs/architecture.md) | 構成図、技術スタック、ディレクトリ構成 |
| [キャッシュ戦略](docs/cache-strategy.md) | KVキャッシュの設計と無効化の仕組み |
| [マークダウン記法](docs/markdown-syntax.md) | 埋め込み、絵文字、GitHub Alertsなど |
| [LiveReload設定](docs/livereload-setup.md) | 開発時のリアルタイム更新 |

## ライセンス

[MIT](https://github.com/shimabox/shimabox-blog-demo/blob/main/LICENSE)
