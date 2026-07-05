export interface PostMeta {
  title: string;
  slug: string;
  date: string;
  categories: string[];
  tags: string[];
  excerpt?: string;
  image?: string;
  fixedPage?: boolean;
  noAds?: boolean;
}

export interface Post extends PostMeta {
  content: string;
  rawContent: string;
  /**
   * GitHub埋め込みカード生成時にGitHub APIの呼び出しが1件以上失敗した場合のみ true。
   * 失敗時は説明・スター数なしの簡略カードになるため、キャッシュを短命にする判断に使う一時的なフラグ。
   */
  hadEmbedFailure?: boolean;
}

export type Env = {
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  SITE_URL: string;
  SITE_TITLE: string;
  SITE_DESCRIPTION: string;
  ADMIN_KEY?: string;
};
