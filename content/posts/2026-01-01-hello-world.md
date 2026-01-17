---
title: "Hello World - ブログを始めました"
slug: "hello-world"
date: "2026-01-01"
categories: ["日記", "技術"]
image: "/images/2026/01/hello-world.png"
---

## はじめに

このブログは **Hono + Cloudflare Pages + R2** で構築されています。

### このブログのソースコード

GitHubで公開しています: [shimabox/shimabox-blog-demo](https://github.com/shimabox/shimabox-blog-demo)

セットアップからデプロイまでの詳細な手順は [README](https://github.com/shimabox/shimabox-blog-demo/blob/main/README.md) を参照してください。

## 技術スタック

| 技術 | 用途 |
|------|------|
| Hono | Webフレームワーク |
| Cloudflare Pages | ホスティング |
| Cloudflare R2 | コンテンツ保存 |
| Cloudflare KV | キャッシュ |

## このブログの特徴

### Markdownで記事を書ける

技術ブログにはMarkdownが最適です。コードブロックも簡単に書けます。

<pre>
```javascript
const greeting = "Hello, World!";
console.log(greeting);
```
</pre>

### シンタックスハイライト対応

様々な言語に対応しています。

**go**
```go
package main

import "fmt"

func main() {
    fmt.Println("Hello from Go!")
}
```

**php**
```php
<?php

function hello(): void
{
    echo "Hello from PHP!\n";
}

hello();
```

**python**
```python
def hello():
    print("Hello from Python!")

if __name__ == "__main__":
    hello()
```

**bash**
```bash
echo "シェルスクリプトも対応"
```

### ダークモード対応

右上のボタンでライト/ダークモードを切り替えられます。システム設定にも連動します。

## ローカル開発

開発サーバーを起動してローカルで確認できます。

```bash
npm run dev
```

http://localhost:8787 でアクセスできます。

LiveReloadに対応しているので、ファイルを保存すると自動的にブラウザがリロードされます。

## Markdown記法

### GitHub Alerts

<pre>
> [!NOTE]
> これは補足情報です。追加の説明が必要な場合に使います。
</pre>

> [!NOTE]
> これは補足情報です。追加の説明が必要な場合に使います。

> [!TIP]
> これはヒントです。便利な使い方を紹介するときに使います。

> [!IMPORTANT]
> これは重要な情報です。特に注意してほしい場合に使います。

> [!WARNING]
> これは警告です。注意が必要な場合に使います。

> [!CAUTION]
> これは注意勧告です。特に注意が必要な場合に使います。

### 絵文字ショートコード

- `:rocket:` → :rocket:
- `:smile:` → :smile:
- `:heart:` → :heart:

などなど、多数の絵文字ショートコードに対応しています。

### 埋め込み対応

記事内のURLを自動的に埋め込みカードに変換します。

- **X (Twitter)**: `https://x.com/user/status/123`
  - https://x.com/shimabox/status/2010330057252991223
- **YouTube**: `https://www.youtube.com/watch?v=xxx`
  - https://youtu.be/8AkTa5QjssU?si=QR-JXyqBKHNMOI4k
- **Amazon**: `https://www.amazon.co.jp/dp/ASIN` または `amzn.asia/xxx`, `amzn.to/xxx`
  - [Clean Architecture 達人に学ぶソフトウェアの構造と設計 | Robert C.Martin, 角 征典, 高木 正弘 |本 | 通販 | Amazon](https://www.amazon.co.jp/dp/4048930656 "Clean Architecture 達人に学ぶソフトウェアの構造と設計 | Robert C.Martin, 角 征典, 高木 正弘 |本 | 通販 | Amazon")
- **GitHub**: `https://github.com/shimabox/shimabox-blog-demo`
  - https://github.com/shimabox/shimabox-blog-demo
- **Gist**: `https://gist.github.com/user/gist_id`

https://gist.github.com/shimabox/c781054a4d4c2ae14fd3413da47a46db

## OGP画像

OGP画像はコマンドで生成可能です。SNSでシェアしたときに見栄えが良くなります。

### 記事（slug）を指定してOGP画像を生成

生成コマンド
```bash
npm run generate-ogp -- slug
```

生成コマンド（強制上書き）
```bash
npm run generate-ogp -- slug --force
```

### 全記事のOGP画像を生成

生成コマンド
```bash
npm run generate-ogp
```

全記事を強制生成
```bash
npm run generate-ogp:force
```

> [!TIP]
> [この記事のOGP画像はこちら](/ogp/hello-world.png)

## おわりに

このブログでは、技術的なことから日常のことまで幅広く書いていく予定です。

よろしくお願いします！ :wave:
