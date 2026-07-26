import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Optional right-hand summary, e.g. "128 đơn hàng". */
  summary?: string;
};

export function Pagination({ page, totalPages, onChange, summary }: PaginationProps) {
  if (totalPages <= 1 && !summary) return null;

  return (
    <nav
      className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:justify-between"
      aria-label="Phân trang"
    >
      <p className="text-sm text-slate-500">{summary ?? `Trang ${page} / ${totalPages}`}</p>
      <div className="flex items-center gap-2">
        <button
          className="btn-secondary btn-sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Trước
        </button>
        <span className="px-2 text-sm font-medium tabular-nums text-slate-600">
          {page} / {totalPages}
        </span>
        <button
          className="btn-secondary btn-sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Sau
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
