"use client";

interface TablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isPending?: boolean;
}

export function TablePagination({
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  isPending = false,
}: TablePaginationProps) {
  const start = Math.min((page - 1) * pageSize + 1, total);
  const end = Math.min(page * pageSize, total);

  const btnBase =
    "px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
  const btnActive =
    "hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer";

  return (
    <div className="flex items-center justify-between gap-4 px-1 py-3 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
      <span>
        {total === 0
          ? "No players found"
          : `Showing ${start}–${end} of ${total.toLocaleString()} players`}
      </span>

      <div className="flex items-center gap-2">
        <button
          className={`${btnBase} ${page > 1 ? btnActive : ""}`}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isPending}
          aria-label="Previous page"
        >
          ← Prev
        </button>

        <span className="px-2 tabular-nums">
          Page {page} of {totalPages}
        </span>

        <button
          className={`${btnBase} ${page < totalPages ? btnActive : ""}`}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isPending}
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
