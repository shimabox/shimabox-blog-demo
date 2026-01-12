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
}

export type Env = {
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  SITE_URL: string;
  SITE_TITLE: string;
  SITE_DESCRIPTION: string;
  ADMIN_KEY?: string;
};
