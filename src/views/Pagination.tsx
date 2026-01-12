import type { FC } from "hono/jsx";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
};

export const Pagination: FC<PaginationProps> = ({
  currentPage,
  totalPages,
}) => {
  return (
    <nav class="pagination">
      {currentPage > 1 ? (
        <a href={currentPage === 2 ? "/" : `/page/${currentPage - 1}/`}>
          ← 前へ
        </a>
      ) : (
        <span class="disabled">← 前へ</span>
      )}

      <span class="page-info">
        {currentPage} / {totalPages}
      </span>

      {currentPage < totalPages ? (
        <a href={`/page/${currentPage + 1}/`}>次へ →</a>
      ) : (
        <span class="disabled">次へ →</span>
      )}
    </nav>
  );
};
