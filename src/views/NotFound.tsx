import type { FC } from "hono/jsx";
import type { Env } from "../types";
import { Layout } from "./Layout";

type NotFoundProps = {
  env: Env;
};

export const NotFound: FC<NotFoundProps> = ({ env }) => {
  return (
    <Layout title="ページが見つかりません" env={env}>
      <div class="not-found">
        <h1>404</h1>
        <p>お探しのページは見つかりませんでした。</p>
        <a href="/">トップページに戻る</a>
      </div>
    </Layout>
  );
};
