import { CalendarDays, X } from 'lucide-react';
import type { StatsQuery } from '../../types/admin';

/** Local-clock day in the ISO form the API validates against. */
function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

const presets: Array<{ label: string; range: StatsQuery }> = [
  { label: '7 ngày', range: { from: dayOffset(6), to: dayOffset(0) } },
  { label: '30 ngày', range: { from: dayOffset(29), to: dayOffset(0) } },
  { label: '90 ngày', range: { from: dayOffset(89), to: dayOffset(0) } },
];

type Props = { value: StatsQuery; onChange: (range: StatsQuery) => void };

/**
 * One filter row above everything it scopes — the tiles and the chart both
 * re-render against the same slice, so the numbers can never disagree.
 */
export function DateRangeFilter({ value, onChange }: Props) {
  const active = (range: StatsQuery): boolean =>
    value.from === range.from && value.to === range.to;
  const hasRange = Boolean(value.from || value.to);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <CalendarDays className="h-4 w-4" aria-hidden />
        Khoảng thời gian
      </span>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active(preset.range)
                ? 'bg-brand-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
            onClick={() => onChange(preset.range)}
            aria-pressed={active(preset.range)}
            key={preset.label}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          className="field w-40 py-1.5"
          type="date"
          value={value.from ?? ''}
          max={value.to || undefined}
          onChange={(event) => onChange({ ...value, from: event.target.value || undefined })}
          aria-label="Từ ngày"
        />
        <span className="text-slate-400">—</span>
        <input
          className="field w-40 py-1.5"
          type="date"
          value={value.to ?? ''}
          min={value.from || undefined}
          onChange={(event) => onChange({ ...value, to: event.target.value || undefined })}
          aria-label="Đến ngày"
        />
      </div>

      {hasRange && (
        <button className="btn-ghost btn-sm" onClick={() => onChange({})}>
          <X className="h-4 w-4" aria-hidden />
          Toàn thời gian
        </button>
      )}
    </div>
  );
}
