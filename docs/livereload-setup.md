# 開発時のリアルタイム更新

ファイルを保存すると、ブラウザが自動リロードされる。

## セットアップ

```bash
npm install -D livereload @types/livereload
```

## 使い方

```bash
npm run dev
```

ブラウザで http://localhost:8787 を開いて、ファイルを編集・保存すると自動でリロードされる。

## 仕組み

### content/ の変更

```
md ファイル保存
    ↓
livereload が検知
    ↓
ブラウザ自動リロード
```

### src/ の変更

```
ts/tsx ファイル保存
    ↓
tsx --watch がサーバー再起動
    ↓
WebSocket 接続切断を検知
    ↓
サーバー復帰を待機
    ↓
ブラウザ自動リロード
```

## 技術詳細

- livereload サーバー: ポート 35729
- 監視対象: `content/`, `src/`, `public/`, `dev-server.tsx`
- 対象ファイル: `.md`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.css`, `.ts`, `.tsx`
- サーバー再起動: `tsx --watch` による自動再起動
- 接続切断時: カスタムスクリプトでサーバー復帰を待機してリロード
