import { useCallback, useEffect, useRef, useState } from "react";

/** Debounce a value by `delay` ms. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Pagination state for server-side paginated lists. */
export interface PaginationState {
  page: number;
  pageSize: number;
  search: string;
}

export function usePagination(initialPageSize = 24) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(initialPageSize);
  const [search, setSearch] = useState("");

  const resetPage = useCallback(() => setPage(1), []);

  return {
    page,
    pageSize,
    search,
    setPage,
    setSearch,
    resetPage,
  };
}
