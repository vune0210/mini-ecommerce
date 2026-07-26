import { Table2, TrendingUp } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DailyPoint } from '../../types/admin';
import { formatPrice } from '../../lib/format';

/**
 * Single-series area chart of daily revenue.
 *
 * One series, one hue — the card title names it, so there is no legend. Orders
 * per day ride along in the tooltip rather than on a second y-axis: two scales
 * on one plot invent a correlation the data does not contain.
 */

const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 34, left: 60 };
const MIN_WIDTH = 320;

const compact = new Intl.NumberFormat('vi-VN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** "2026-07-26" -> "26/07"; the series is dense so ticks stay short. */
const tickLabel = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Rounds the axis top up to 1/2/5 × 10ⁿ so gridlines land on round numbers. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Rendering at the measured pixel width keeps strokes exactly 2px and makes
    // the hover maths 1:1 with the pointer, unlike a scaled viewBox.
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function RevenueChart({ series }: { series: DailyPoint[] }) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => setHovered(null), [series]);

  const chartWidth = Math.max(width, MIN_WIDTH);
  const plotWidth = chartWidth - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...series.map((point) => Number(point.revenue)), 0));

  const xAt = (index: number): number =>
    series.length <= 1 ? PAD.left + plotWidth / 2 : PAD.left + (index / (series.length - 1)) * plotWidth;
  const yAt = (value: number): number => PAD.top + plotHeight - (value / max) * plotHeight;

  const points = series.map((point, index) => ({
    ...point,
    x: xAt(index),
    y: yAt(Number(point.revenue)),
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area =
    points.length > 0
      ? `${PAD.left},${PAD.top + plotHeight} ${line} ${points[points.length - 1].x},${PAD.top + plotHeight}`
      : '';

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);
  // Enough ticks to orient, never so many they collide.
  const tickStep = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(plotWidth / 72))));
  const peak = points.reduce(
    (best, point) => (Number(point.revenue) > Number(best?.revenue ?? '-1') ? point : best),
    points[0],
  );
  const showPeakLabel = peak && Number(peak.revenue) > 0 && hovered === null;

  function trackPointer(event: React.PointerEvent<SVGSVGElement>): void {
    if (!series.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - bounds.left - PAD.left;
    const ratio = series.length <= 1 ? 0 : offset / plotWidth;
    const index = Math.round(ratio * (series.length - 1));
    setHovered(Math.min(Math.max(index, 0), series.length - 1));
  }

  const active = hovered === null ? null : points[hovered];

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <TrendingUp className="h-4 w-4 text-slate-400" aria-hidden />
          Doanh thu theo ngày
        </h2>
        <button
          className="btn-secondary btn-sm"
          onClick={() => setShowTable((open) => !open)}
          aria-pressed={showTable}
        >
          <Table2 className="h-4 w-4" aria-hidden />
          {showTable ? 'Xem biểu đồ' : 'Xem bảng'}
        </button>
      </header>

      <div className="p-5" ref={containerRef}>
        {!series.length ? (
          <p className="py-12 text-center text-sm text-slate-500">
            Chưa có dữ liệu trong khoảng thời gian này.
          </p>
        ) : showTable ? (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2 font-semibold">Ngày</th>
                  <th className="py-2 text-right font-semibold">Đơn</th>
                  <th className="py-2 text-right font-semibold">Doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {series.map((point) => (
                  <tr key={point.date}>
                    <td className="py-2 tabular-nums text-slate-600">{point.date}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{point.orders}</td>
                    <td className="py-2 text-right font-medium tabular-nums text-slate-900">
                      {formatPrice(point.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative">
            <svg
              className="block touch-none"
              width={chartWidth}
              height={HEIGHT}
              role="img"
              aria-label={`Doanh thu từ ${series[0].date} đến ${series[series.length - 1].date}`}
              onPointerMove={trackPointer}
              onPointerLeave={() => setHovered(null)}
            >
              <defs>
                <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                </linearGradient>
              </defs>

              {gridValues.map((value) => (
                <g key={value}>
                  <line
                    x1={PAD.left}
                    x2={chartWidth - PAD.right}
                    y1={yAt(value)}
                    y2={yAt(value)}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 10}
                    y={yAt(value) + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[11px] tabular-nums"
                  >
                    {compact.format(value)}
                  </text>
                </g>
              ))}

              {series.map((point, index) =>
                index % tickStep === 0 || index === series.length - 1 ? (
                  <text
                    key={point.date}
                    x={xAt(index)}
                    y={HEIGHT - 12}
                    textAnchor="middle"
                    className="fill-slate-400 text-[11px] tabular-nums"
                  >
                    {tickLabel(point.date)}
                  </text>
                ) : null,
              )}

              <polygon points={area} fill="url(#revenue-fill)" />
              <polyline
                points={line}
                fill="none"
                stroke="#4f46e5"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {showPeakLabel && (
                <>
                  <circle cx={peak.x} cy={peak.y} r={4} fill="#4f46e5" stroke="#ffffff" strokeWidth={2} />
                  <text
                    x={Math.min(Math.max(peak.x, PAD.left + 28), chartWidth - PAD.right - 28)}
                    // The peak sits near the top of the plot, so a label placed
                    // above it gets clamped onto the line. Drop below instead.
                    y={peak.y - 14 > PAD.top + 10 ? peak.y - 14 : peak.y + 20}
                    textAnchor="middle"
                    // Halo, so the label stays readable wherever the line runs.
                    stroke="#ffffff"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="fill-slate-500 text-[11px] font-medium tabular-nums"
                  >
                    {compact.format(Number(peak.revenue))}
                  </text>
                </>
              )}

              {active && (
                <>
                  <line
                    x1={active.x}
                    x2={active.x}
                    y1={PAD.top}
                    y2={PAD.top + plotHeight}
                    stroke="#94a3b8"
                    strokeWidth={1}
                  />
                  <circle
                    cx={active.x}
                    cy={active.y}
                    r={5}
                    fill="#4f46e5"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                </>
              )}
            </svg>

            {active && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-pop"
                style={{
                  left: Math.min(Math.max(active.x, 70), chartWidth - 70),
                  top: Math.max(active.y - 62, 0),
                }}
              >
                <p className="font-semibold tabular-nums">{active.date}</p>
                <p className="mt-0.5 tabular-nums text-slate-300">
                  {formatPrice(active.revenue)} · {active.orders} đơn
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
