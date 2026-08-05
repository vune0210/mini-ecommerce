import { Check, Tags, X } from 'lucide-react';
import { Alert, Panel, Skeleton } from './ui';
import { useTags } from '../lib/media-api';

export type TagFilterProps = {
  /** The slugs currently applied, exactly as they sit in `?tags=`. */
  selected: string[];
  /** Called with the whole new selection; an empty array means "no tag filter". */
  onChange: (slugs: string[]) => void;
  className?: string;
};

/**
 * Multi-select tag chips. The filter narrows: the API keeps only products
 * carrying *every* selected slug, so the copy here says so in as many words —
 * a shopper who reads a second tick as "show me these too" would take an empty
 * result page for a broken catalogue.
 */
export function TagFilter({ selected, onChange, className = '' }: TagFilterProps) {
  const tags = useTags();

  function toggle(slug: string): void {
    onChange(selected.includes(slug) ? selected.filter((item) => item !== slug) : [...selected, slug]);
  }

  // Slugs from a pasted or bookmarked link that no longer exist. The server
  // matches nothing for them, so they are shown as removable rather than
  // silently dropped — otherwise the page looks empty for no visible reason.
  const unknown = tags.data
    ? selected.filter((slug) => !tags.data.some((tag) => tag.slug === slug))
    : [];

  return (
    <Panel className={className} title="Thẻ sản phẩm" icon={Tags}>
      {tags.isPending ? (
        <Skeleton className="h-20" />
      ) : tags.isError ? (
        <Alert>Không tải được danh sách thẻ.</Alert>
      ) : !tags.data.length ? (
        <p className="text-sm text-slate-500">Chưa có thẻ nào trong catalogue.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            Chọn thêm thẻ để <span className="font-semibold text-slate-700">thu hẹp</span> kết quả:
            sản phẩm phải có <span className="font-semibold text-slate-700">tất cả</span> thẻ đã
            chọn, không phải chỉ một trong số đó.
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.data.map((tag) => {
              const on = selected.includes(tag.slug);
              return (
                <button
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors ${
                    on
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  key={tag.id}
                  onClick={() => toggle(tag.slug)}
                  title={
                    on
                      ? `Bỏ thẻ “${tag.name}” khỏi bộ lọc`
                      : selected.length
                        ? `Thu hẹp thêm: chỉ giữ sản phẩm có cả “${tag.name}”`
                        : `Chỉ hiện sản phẩm có thẻ “${tag.name}”`
                  }
                  type="button"
                >
                  {on && <Check className="h-3 w-3" aria-hidden />}
                  {tag.name}
                  <span className={on ? 'text-white/70' : 'text-slate-400'}>
                    {tag.productCount ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {unknown.map((slug) => (
            <button
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200"
              key={slug}
              onClick={() => toggle(slug)}
              title="Thẻ này không còn tồn tại nên không khớp sản phẩm nào. Bấm để bỏ."
              type="button"
            >
              <X className="h-3 w-3" aria-hidden />
              {slug} · không còn tồn tại
            </button>
          ))}

          {selected.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              {selected.length > 1 && (
                <p className="text-xs text-slate-500">
                  Đang lọc:{' '}
                  <span className="font-semibold text-slate-700">{selected.join(' + ')}</span> — chỉ
                  những sản phẩm có đủ cả {selected.length} thẻ. Số bên cạnh mỗi thẻ là tổng sản
                  phẩm của riêng thẻ đó, không phải số còn lại sau khi lọc.
                </p>
              )}
              <button className="btn-secondary btn-sm mt-3 w-full" onClick={() => onChange([])} type="button">
                Bỏ chọn {selected.length} thẻ
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
