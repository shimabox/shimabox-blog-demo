# マークダウン記法

記事を書く際に使用できるマークダウン記法のガイドです。

## frontmatter

記事の先頭にYAML形式でメタデータを記述します。

### 通常記事

```yaml
---
title: "記事タイトル"
slug: "my-new-post"
date: "2026-01-07"
categories: ["カテゴリ名"]
image: "/images/2026/01/thumbnail.jpg"  # オプション（OGP背景画像にも使用）
ogp_bg: false  # オプション（OGP背景画像を無効化）
---
```

### frontmatterフィールド

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `title` | ○ | 記事タイトル |
| `slug` | ○ | URLスラッグ |
| `date` | ○ | 公開日（YYYY-MM-DD形式） |
| `categories` | ○ | カテゴリ配列 |
| `image` | - | サムネイル画像パス。指定するとOGP画像の背景としても使用される |
| `ogp_bg` | - | OGP背景画像の有効/無効（デフォルト: `true`）。`image`がある場合は背景として使用される。`false`で無効化 |
| `fixedPage` | - | `true`で固定ページとして扱う |

### 固定ページ

```yaml
---
title: "About"
slug: "about"
date: "2010-04-19"
categories: []
fixedPage: true
---
```

`fixedPage: true` を設定すると:
- 目次が非表示
- シェアボタンが非表示
- 戻るリンクが「← TOPに戻る」になり直接 `/` へ遷移

## 埋め込み

記事内のURLを自動的に埋め込みカードに変換します。リスト内のURLも対応しています。

### X (Twitter)

```markdown
https://x.com/username/status/123456789
```

または

```markdown
https://twitter.com/username/status/123456789
```

### YouTube

```markdown
https://www.youtube.com/watch?v=VIDEO_ID
```

または

```markdown
https://youtu.be/VIDEO_ID
```

### Amazon

```markdown
https://www.amazon.co.jp/dp/ASIN
```

または短縮URL:

```markdown
https://amzn.asia/d/xxxxxxx
https://amzn.to/xxxxxxx
```

リンクテキスト（商品名）をカードに表示します。

### GitHub

```markdown
https://github.com/username/repository
```

API連携でスター数・説明を自動取得して表示します。

**注意:**
- 認証なしで60回/時間のレートリミット
- API失敗時はリポジトリ名のみのカードにフォールバック
- 取得した情報はKVキャッシュに含まれる

### Gist

```markdown
https://gist.github.com/username/gist_id
```

## 絵文字ショートコード

GitHub/Slack形式の絵文字ショートコードを自動変換します。

```markdown
:smile: → 😄
:rocket: → 🚀
:+1: → 👍
:heart: → ❤️
```

コードブロック内は変換されません。

## GitHub Alerts

> [!NOTE]、[!TIP] などのGitHub形式のアラートを表示できます。

### NOTE

```markdown
> [!NOTE]
> 補足情報をここに記述します。
```

### TIP

```markdown
> [!TIP]
> ヒントをここに記述します。
```

### IMPORTANT

```markdown
> [!IMPORTANT]
> 重要な情報をここに記述します。
```

### WARNING

```markdown
> [!WARNING]
> 警告をここに記述します。
```

### CAUTION

```markdown
> [!CAUTION]
> 注意事項をここに記述します。
```

## 目次

見出し（h2, h3）が3つ以上ある場合、自動的に目次が生成されます。

- 折りたたみ式で表示
- `fixedPage: true` の場合は非表示

## コードブロック

言語を指定するとシンタックスハイライトが適用されます。

````markdown
```javascript
const hello = "world";
console.log(hello);
```
````

コードブロックにはコピーボタンが自動で付きます。

## シェアボタン

記事詳細ページ下部に自動表示（`fixedPage: true` 以外）:

- X (Twitter) でシェア
- はてなブックマークに追加
- CuraQ に保存
- 記事のマークダウンをコピー（クリップボードにコピー）
