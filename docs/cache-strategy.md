# キャッシュ戦略ドキュメント

## 課題

キャッシュ切れ後のページ表示が遅い。

### 原因

1. **一覧ページ（posts:index）**: R2から全記事を取得し、各ファイルの frontmatter をパースしてメタデータを生成
2. **個別記事（posts:{slug}）**: R2からMarkdownを取得し、`parseMarkdown()` でHTML変換（シンタックスハイライト含む）

どちらもキャッシュミス時にリクエスト内で重い処理が走る。

## 解決策

### 方針: TTL廃止 + プリウォーム

1. **KVキャッシュのTTLを廃止**（無期限化）
2. **記事更新時に明示的にキャッシュを削除**
3. **削除直後にプリウォームでキャッシュを再生成**

これにより「キャッシュ切れ」が発生しなくなり、ユーザーは常にキャッシュヒットする。

### フロー

```
GitHub Actions（記事更新時）
  ↓
1. R2に記事をsync
  ↓
2. KVキャッシュを削除（該当記事 + 一覧）
  ↓
3. curl でトップページと更新記事にアクセス（プリウォーム）
  ↓
4. KVキャッシュが再生成される
  ↓
 ユーザーアクセス時は常にキャッシュヒット！
```

## 実装

### repository.ts

TTLを削除し、キャッシュを無期限化。

```typescript
import { parseFrontmatter, parseMarkdown } from "./markdown";
import type { Env, Post, PostMeta } from "./types";

const CACHE_KEY = "posts:index";

export async function listPosts(env: Env): Promise<PostMeta[]> {
  // キャッシュ確認
  const cached = await env.CACHE.get<PostMeta[]>(CACHE_KEY, "json");
  if (cached) return cached;

  // R2から取得
  const list = await env.BUCKET.list({ prefix: "posts/" });
  const posts: PostMeta[] = [];

  for (const obj of list.objects) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const text = await file.text();
    const meta = parseFrontmatter(text);
    if (meta.slug) {
      posts.push(meta);
    }
  }

  // 日付降順ソート
  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // キャッシュに保存（TTLなし = 無期限）
  await env.CACHE.put(CACHE_KEY, JSON.stringify(posts));

  return posts;
}

export async function getPost(env: Env, slug: string): Promise<Post | null> {
  // 個別記事のキャッシュ
  const cacheKey = `posts:${slug}`;
  const cached = await env.CACHE.get<Post>(cacheKey, "json");
  if (cached) return cached;

  // postsディレクトリを検索
  let list = await env.BUCKET.list({ prefix: "posts/" });
  for (const obj of list.objects) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const text = await file.text();
    const meta = parseFrontmatter(text);
    if (meta.slug === slug) {
      const post = await parseMarkdown(text);
      // キャッシュに保存（TTLなし = 無期限）
      await env.CACHE.put(cacheKey, JSON.stringify(post));
      return post;
    }
  }

  // pagesディレクトリも検索（固定ページ用）
  list = await env.BUCKET.list({ prefix: "pages/" });
  for (const obj of list.objects) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const text = await file.text();
    const meta = parseFrontmatter(text);
    if (meta.slug === slug) {
      const post = await parseMarkdown(text);
      // キャッシュに保存（TTLなし = 無期限）
      await env.CACHE.put(cacheKey, JSON.stringify(post));
      return post;
    }
  }

  return null;
}

export async function getPostsByCategory(
  env: Env,
  category: string,
): Promise<PostMeta[]> {
  const posts = await listPosts(env);
  return posts.filter((p) => p.categories?.includes(category));
}

/**
 * キャッシュを無効化
 * @param env - 環境変数
 * @param slug - 指定すると特定記事のみ、省略すると全キャッシュを削除
 */
export async function invalidateCache(env: Env, slug?: string): Promise<void> {
  if (slug) {
    // 特定記事のキャッシュのみ削除
    await env.CACHE.delete(`posts:${slug}`);
    // 一覧も更新が必要なので削除
    await env.CACHE.delete(CACHE_KEY);
  } else {
    // 全キャッシュを削除
    await env.CACHE.delete(CACHE_KEY);
    const list = await env.CACHE.list({ prefix: "posts:" });
    for (const key of list.keys) {
      await env.CACHE.delete(key.name);
    }
  }
}
```

### deploy.yml（GitHub Actions）

キャッシュ削除後にプリウォーム処理を実行。

```yaml
# キャッシュクリア（PR時はスキップ）
- name: Invalidate cache
  if: github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && github.event.inputs.deploy_type != 'deploy')
  run: |
    # 差分syncまたはslug指定syncの結果を取得
    SYNCED_SLUGS="${{ steps.sync.outputs.synced_slugs }}${{ steps.sync_slug.outputs.synced_slugs }}"

    # full sync の場合は全キャッシュ削除
    if [ "${{ github.event.inputs.deploy_type }}" == "full" ]; then
      echo "Invalidating all cache"
      curl -X POST "${{ secrets.SITE_URL }}/api/invalidate" \
        -H "X-Admin-Key: ${{ secrets.ADMIN_KEY }}" \
        --fail-with-body || echo "Cache invalidation failed"
    elif [ -n "$SYNCED_SLUGS" ]; then
      # 差分syncの場合は個別にキャッシュ削除
      for slug in $SYNCED_SLUGS; do
        echo "Invalidating cache for: $slug"
        # 日本語slugをURLエンコード
        ENCODED_SLUG=$(printf '%s' "$slug" | jq -sRr @uri)
        curl -X POST "${{ secrets.SITE_URL }}/api/invalidate?slug=$ENCODED_SLUG" \
          -H "X-Admin-Key: ${{ secrets.ADMIN_KEY }}" \
          --fail-with-body || echo "Cache invalidation failed for $slug"
      done
    else
      echo "No cache invalidation needed"
    fi

# キャッシュプリウォーム（PR時はスキップ）
- name: Warm cache
  if: github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && github.event.inputs.deploy_type != 'deploy')
  run: |
    BASE_URL="${{ secrets.SITE_URL }}"

    if [ -z "$BASE_URL" ]; then
      echo "SITE_URL secret is not set, skipping warm"
      exit 0
    fi

    echo "Warming cache for: $BASE_URL"

    # トップページ（posts:index を再生成）
    echo "Warming: $BASE_URL/"
    curl -s "$BASE_URL/" > /dev/null || echo "Failed to warm top page"

    # 更新された記事のキャッシュをウォーム
    WARM_URLS="${{ steps.detect.outputs.warm_urls }}"

    # slug指定の場合はファイルから日付を取得してURLを生成
    if [ "${{ github.event.inputs.deploy_type }}" == "slug" ] && [ -n "${{ github.event.inputs.slug }}" ]; then
      SLUG="${{ github.event.inputs.slug }}"
      MD_FILE=$(find content/posts -name "*-${SLUG}.md" 2>/dev/null | head -1)
      if [ -n "$MD_FILE" ]; then
        FILENAME=$(basename "$MD_FILE" .md)
        DATE_PART=$(echo "$FILENAME" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}')
        if [ -n "$DATE_PART" ]; then
          YEAR=$(echo "$DATE_PART" | cut -d'-' -f1)
          MONTH=$(echo "$DATE_PART" | cut -d'-' -f2)
          DAY=$(echo "$DATE_PART" | cut -d'-' -f3)
          WARM_URLS="/$YEAR/$MONTH/$DAY/$SLUG/"
        fi
      fi
    fi

    if [ -n "$WARM_URLS" ]; then
      for url in $WARM_URLS; do
        echo "Warming: ${BASE_URL}${url}"
        curl -s "${BASE_URL}${url}" > /dev/null || echo "Failed to warm $url"
      done
    fi

    echo "Cache warm completed"
```

### 変更検出と warm_urls の生成

Detect changed posts ステップで変更されたファイルを検出し、slugとwarm_urlsを生成:

```yaml
- name: Detect changed posts
  id: detect
  if: github.event_name == 'push' || github.event.inputs.deploy_type == 'diff'
  run: |
    # 変更されたmdファイルを検出（日本語ファイル名のエスケープを防ぐ）
    CHANGED_FILES=$(git -c core.quotepath=false diff --name-only HEAD~1 HEAD -- 'content/posts/*.md' 'content/pages/*.md' 'content/images/**' || true)

    if [ -z "$CHANGED_FILES" ]; then
      echo "No content changes detected"
      echo "has_changes=false" >> $GITHUB_OUTPUT
      exit 0
    fi

    echo "Changed files:"
    echo "$CHANGED_FILES"

    # mdファイルからslugを抽出（YYYY-MM-DD-slug.md → slug）
    SLUGS=""
    WARM_URLS=""

    # 関数: slugからwarm_urlを生成して追加
    add_slug() {
      local slug="$1"
      # 重複チェック
      if [[ " $SLUGS " == *" $slug "* ]]; then
        return
      fi
      # 対応するmdファイルを探して日付を取得
      local md_file=$(find content/posts -name "*-${slug}.md" 2>/dev/null | head -1)
      if [ -n "$md_file" ]; then
        local filename=$(basename "$md_file" .md)
        local date_part=$(echo "$filename" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}')
        if [ -n "$date_part" ]; then
          local year=$(echo "$date_part" | cut -d'-' -f1)
          local month=$(echo "$date_part" | cut -d'-' -f2)
          local day=$(echo "$date_part" | cut -d'-' -f3)
          SLUGS="$SLUGS $slug"
          WARM_URLS="$WARM_URLS /$year/$month/$day/$slug/"
        fi
      fi
    }

    for file in $CHANGED_FILES; do
      if [[ "$file" == content/posts/*.md ]]; then
        # ファイル名からslugを抽出
        filename=$(basename "$file" .md)
        slug=$(echo "$filename" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//')
        # 日付を抽出（YYYY-MM-DD）
        date_part=$(echo "$filename" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}')
        year=$(echo "$date_part" | cut -d'-' -f1)
        month=$(echo "$date_part" | cut -d'-' -f2)
        day=$(echo "$date_part" | cut -d'-' -f3)
        SLUGS="$SLUGS $slug"
        WARM_URLS="$WARM_URLS /$year/$month/$day/$slug/"
      elif [[ "$file" == content/images/* ]]; then
        # 画像が変更された場合、その画像を参照している記事を探す
        image_path="/${file#content/}"  # content/images/... → /images/...
        echo "Looking for posts referencing: $image_path"

        # grepで画像を参照している記事を検索
        for md in $(grep -l "$image_path" content/posts/*.md 2>/dev/null || true); do
          ref_filename=$(basename "$md" .md)
          ref_slug=$(echo "$ref_filename" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//')
          echo "Found referencing post: $ref_slug"
          add_slug "$ref_slug"
        done
      fi
    done

    echo "slugs=$SLUGS" >> $GITHUB_OUTPUT
    echo "warm_urls=$WARM_URLS" >> $GITHUB_OUTPUT
    echo "has_changes=true" >> $GITHUB_OUTPUT
```

## 必要なシークレット設定

GitHub → Settings → Secrets and variables → Actions で以下を設定:

| シークレット名 | 値 | 説明 |
|--------------|---|-----|
| `CLOUDFLARE_API_TOKEN` | Cloudflare APIトークン | R2/Pages操作用 |
| `CLOUDFLARE_ACCOUNT_ID` | CloudflareアカウントID | API認証用 |
| `ADMIN_KEY` | 任意の文字列 | キャッシュ無効化API用 |
| `SITE_URL` | `https://your-blog-name.pages.dev` | 本番サイトURL（プリウォーム用） |

## キャッシュの種類

| キー | 内容 | 用途 |
|-----|-----|-----|
| `posts:index` | 全記事のメタデータ（PostMeta[]） | 一覧ページ、ページネーション |
| `posts:{slug}` | パース済み記事（Post） | 個別記事ページ |

## メリット

1. **ユーザー体験向上**: キャッシュ切れがなくなり、常に高速表示
2. **シンプルな仕組み**: TTL管理不要、明示的な無効化のみ
3. **リソース効率**: 不要な再生成が発生しない
4. **デプロイと連動**: GitHub Actionsで自動的にキャッシュ更新

## キャッシュの対象と影響範囲

### リクエスト処理の流れ

```
リクエスト
  ↓
KVからキャッシュ取得（post.content）  ← ここだけキャッシュ
  ↓
PostView.tsx でレンダリング          ← 毎回実行
  ↓
HTMLレスポンス
```

### キャッシュされるもの

KVにキャッシュされるのは `parseMarkdown()` の結果のみ。

| 対象 | キャッシュされる内容 |
|------|---------------------|
| `posts:index` | 記事メタデータ（title, slug, date, categories, excerpt, image） |
| `posts:{slug}` | パース済み記事（上記 + content HTML） |

**content HTMLに含まれるもの:**
- Markdownから変換されたHTML（見出し、段落、リスト等）
- 目次（TOC）
- 埋め込みカード（Twitter, YouTube, GitHub等）
- シンタックスハイライト適用済みコードブロック
- GitHub Alertsの変換結果

### キャッシュされないもの（毎回実行）

Pages Functions（JSX）で動的に生成される部分はキャッシュされない。

| ファイル | 内容 |
|----------|------|
| `Layout.tsx` | ヘッダー、フッター、ナビゲーション、テーマ切り替え |
| `PostView.tsx` | シェアボタンURL、記事ヘッダー、タグリンク |
| `PostListView.tsx` | ページネーション、記事カードのリンク |

### 変更時の対応まとめ

| 変更内容 | キャッシュ無効化 | 理由 |
|----------|------------------|------|
| 記事内容（Markdown） | **必要** | `parseMarkdown()` の結果がキャッシュされているため |
| `markdown.ts`（埋め込み処理等） | **必要** | 既存キャッシュは古いパース結果のため |
| `PostView.tsx`（シェアボタン等） | 不要 | 毎回レンダリングされるため |
| `Layout.tsx`（ヘッダー等） | 不要 | 毎回レンダリングされるため |
| `styles.css` | 不要 | 静的ファイルとして配信されるため |

### 具体例

#### 例1: GitHub埋め込みのデザイン変更

**markdown.ts を変更した場合:**
- GitHub APIの呼び出しやカードHTMLの生成は `parseMarkdown()` 内で行われる
- 既存のキャッシュには古いHTMLが保存されている
- → **キャッシュ無効化が必要**

#### 例2: シェアボタンのURL変更

**PostView.tsx を変更した場合:**
- シェアボタンのURLは毎回 `PostView.tsx` で動的に生成される
- キャッシュには含まれていない
- → **デプロイのみでOK**（キャッシュ無効化は不要）

#### 例3: CSSのスタイル変更

**styles.css を変更した場合:**
- CSSは `public/` 配下の静的ファイル
- Cloudflare Pagesから直接配信される（Functionsを経由しない）
- → **デプロイのみでOK**

## GitHub埋め込みとAPI呼び出し

GitHub埋め込みカードは `parseMarkdown()` 内でGitHub APIを呼び出してリポジトリ情報を取得する。

### レートリミット

- 認証なしで60回/時間
- ローカル開発時はページリロードのたびにAPIが呼ばれるため注意

### フォールバック

API失敗時（レートリミット・プライベートリポジトリ等）はリポジトリ名のみのカードを表示。

### キャッシュとの関係

- API取得結果は `posts:{slug}` のキャッシュに含まれる
- キャッシュが効いている間はAPIは呼ばれない
- キャッシュ無効化後の初回アクセス時のみAPIが呼ばれる

## 注意点

### 日本語slugのURLエンコード

キャッシュ無効化APIに日本語slugを渡す場合、**URLエンコードが必要**。

#### 背景

URLに使える文字はRFC 3986で限定されており（英数字と一部記号のみ）、日本語などのマルチバイト文字はパーセントエンコーディングに変換する必要がある。

- ブラウザ: 自動的にエンコードしてリクエストを送信
- curl: エンコードせずそのまま送信 → サーバーが400エラーを返す

#### GitHub Actionsでの対応

`jq -sRr @uri` を使ってslugをエンコードしている。

```yaml
for slug in $SYNCED_SLUGS; do
  # 日本語slugをURLエンコード
  ENCODED_SLUG=$(printf '%s' "$slug" | jq -sRr @uri)
  curl -X POST "${{ secrets.SITE_URL }}/api/invalidate?slug=$ENCODED_SLUG" \
    -H "X-Admin-Key: ${{ secrets.ADMIN_KEY }}"
done
```

#### ローカルからキャッシュを削除する場合

日本語slugを含む記事のキャッシュを手動で削除する場合は、slugをURLエンコードする必要がある。

```bash
# NG: 日本語をそのまま渡すと400エラー
curl -X POST "https://your-blog-name.pages.dev/api/invalidate?slug=日本語スラグ" \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"

# OK: jq でエンコード
SLUG="日本語スラグ"
ENCODED=$(printf '%s' "$SLUG" | jq -sRr @uri)
curl -X POST "https://your-blog-name.pages.dev/api/invalidate?slug=$ENCODED" \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"

# OK: --data-urlencode を使う（GETパラメータではなくPOSTボディになる点に注意）
curl -X POST "https://your-blog-name.pages.dev/api/invalidate" \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  --data-urlencode "slug=日本語スラグ"
```

**英語のみのslugはエンコード不要:**

```bash
curl -X POST "https://your-blog-name.pages.dev/api/invalidate?slug=my-english-slug" \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```
