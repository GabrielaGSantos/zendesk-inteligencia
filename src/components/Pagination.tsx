import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  // Generate page numbers to display
  const getPageNumbers = (): (number | '...')[] => {
    const pages: (number | '...')[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      
      for (let i = start; i <= end; i++) pages.push(i);
      
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="pagination">
      <button
        className="pagination__btn"
        disabled={page <= 1}
        onClick={() => onPageChange(1)}
        title="Primeira página"
      >
        <ChevronsLeft size={14} />
      </button>

      <button
        className="pagination__btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        title="Página anterior"
      >
        <ChevronLeft size={14} />
      </button>

      {getPageNumbers().map((p, i) =>
        p === '...' ? (
          <span key={`dots-${i}`} className="pagination__info">...</span>
        ) : (
          <button
            key={p}
            className={`pagination__btn ${page === p ? 'pagination__btn--active' : ''}`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        )
      )}

      <button
        className="pagination__btn"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        title="Próxima página"
      >
        <ChevronRight size={14} />
      </button>

      <button
        className="pagination__btn"
        disabled={page >= totalPages}
        onClick={() => onPageChange(totalPages)}
        title="Última página"
      >
        <ChevronsRight size={14} />
      </button>

      <span className="pagination__info">
        {start}–{end} de {total.toLocaleString('pt-BR')}
      </span>
    </div>
  );
};
