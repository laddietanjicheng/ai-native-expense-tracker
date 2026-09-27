import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, totalCount, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalCount, page * pageSize);

  return (
    <div className="flex items-center justify-between px-6 py-3">
      <span className="text-sm text-slate-500">
        {totalCount === 0 ? "No expenses" : `Showing ${start}–${end} of ${totalCount}`}
      </span>
      <div className="flex items-center gap-3">
        <IconButton aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </IconButton>
        <span className="text-sm font-semibold text-slate-700">
          Page {page} of {totalPages}
        </span>
        <IconButton aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
