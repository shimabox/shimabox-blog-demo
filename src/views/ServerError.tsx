import type { FC } from "hono/jsx";
import type { Env } from "../types";
import { Layout } from "./Layout";

type ServerErrorProps = {
  env: Env;
};

export const ServerError: FC<ServerErrorProps> = ({ env }) => {
  return (
    <Layout title="エラーが発生しました" env={env}>
      <div class="not-found">
        <h1>500</h1>
        <p>エラーが発生しました。時間をおいて再度お試しください。</p>
        <a href="/">トップページに戻る</a>
      </div>
    </Layout>
  );
};
