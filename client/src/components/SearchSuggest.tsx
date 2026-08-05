import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductImage } from './ProductImage';
import { apiJson } from '../lib/api-client';
import { formatPrice } from '../lib/format';

/** Mirrors the server's narrow `Suggestion` projection — enough for a row. */
export type Suggestion = {
  id: string;
  name: string;
  slug: string;
  price: string;
  imageUrl: string | null;
  stock: number;
};

/** The server refuses anything shorter, so asking would be a wasted trip. */
const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Called when the customer commits the term rather than picking a product. */
  onSubmit: () => void;
};

/**
 * A typeahead over `/api/products/suggest`. Picking a row navigates straight to
 * the product; pressing Enter falls through to the caller's own search, because
 * "show me everything matching this" is a different intent from "I meant that
 * one" and the box should serve both.
 */
export function SearchSuggest({ value, onChange, onSubmit }: Props) {
  const navigate = useNavigate();
  const listId = useId();
  const [term, setTerm] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(value.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  const suggestions = useQuery({
    queryKey: ['product-suggest', term],
    queryFn: () =>
      apiJson<Suggestion[]>(
        `/api/products/suggest?q=${encodeURIComponent(term)}`,
      ),
    enabled: term.length >= MIN_LENGTH,
  });
  const items = suggestions.data ?? [];

  // A click anywhere else means the customer moved on; leaving the panel open
  // would cover the page they are trying to read.
  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function choose(item: Suggestion): void {
    setOpen(false);
    navigate(`/products/${item.id}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length) return;
      event.preventDefault();
      setOpen(true);
      setHighlighted((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        // Wraps, so the list is reachable in both directions from either end.
        return (next + items.length) % items.length;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const picked = items[highlighted];
      if (open && picked) choose(picked);
      else {
        setOpen(false);
        onSubmit();
      }
    }
  }

  const showPanel = open && term.length >= MIN_LENGTH;

  return (
    <div className="relative" ref={containerRef}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        className="field pl-10"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Tìm theo tên hoặc mã SKU..."
        aria-label="Tìm sản phẩm"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
      />

      {showPanel && (
        <ul
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          id={listId}
          role="listbox"
        >
          {suggestions.isLoading && (
            <li className="px-4 py-3 text-sm text-slate-500">Đang tìm...</li>
          )}
          {!suggestions.isLoading && items.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">
              Không có gợi ý. Nhấn Enter để tìm toàn bộ danh mục.
            </li>
          )}
          {items.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === highlighted}>
              <button
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  index === highlighted ? 'bg-brand-50' : 'hover:bg-slate-50'
                }`}
                type="button"
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(item)}
              >
                <ProductImage
                  className="h-10 w-10 shrink-0 rounded-lg"
                  imageUrl={item.imageUrl}
                  name={item.name}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {item.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatPrice(item.price)}
                    {item.stock < 1 && ' · Hết hàng'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
