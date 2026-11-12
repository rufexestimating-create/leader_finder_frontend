"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  setPage: (p: number) => void;
  noun?: string;
  scrollTo?: string;
}

export function usePagination<T>(items: T[], resetKey: string, pageSize = 25) {
  // The page belongs to one filter: a new resetKey starts again at page 1
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const page = state.key === resetKey ? state.page : 1;

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  function setPage(p: number) {
    setState({ key: resetKey, page: Math.max(1, Math.min(p, totalPages)) });
  }

  return { page: safePage, totalPages, total: items.length, pageSize, pageItems, setPage };
}

export function Pagination({ page, totalPages, total, pageSize, setPage, noun = "items", scrollTo }: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function go(p: number) {
    setPage(p);
    if (scrollTo) {
      document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Build page number buttons: always show first, last, current ±1, and ellipsis
  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <nav className="pager" aria-label={`${noun} pagination`}>
      <span className="pager-info">
        {from}–{to} of <strong>{total}</strong> {noun}
      </span>
      <div className="pager-pages">
        <button
          className="pager-btn"
          onClick={() => go(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="pager-gap">…</span>
          ) : (
            <button
              key={p}
              className={`pager-btn${p === page ? " active" : ""}`}
              onClick={() => go(p as number)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}

        <button
          className="pager-btn"
          onClick={() => go(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
