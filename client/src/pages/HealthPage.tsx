import { Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';

type HealthResponse = { status: string };
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const tones: Record<string, { dot: string; ring: string; text: string; label: string }> = {
  ok: {
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-100',
    text: 'text-emerald-700',
    label: 'Máy chủ đang hoạt động bình thường',
  },
  unavailable: {
    dot: 'bg-red-500',
    ring: 'ring-red-100',
    text: 'text-red-700',
    label: 'Không kết nối được tới máy chủ',
  },
};

export function HealthPage() {
  const [status, setStatus] = useState('Checking server...');
  const tone = tones[status] ?? {
    dot: 'bg-amber-400 animate-pulse',
    ring: 'ring-amber-100',
    text: 'text-amber-700',
    label: 'Đang kiểm tra kết nối...',
  };

  useEffect(() => {
    const controller = new AbortController();
    async function checkHealth(): Promise<void> {
      try {
        const response = await fetch(`${apiBaseUrl}/api/health`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setStatus(((await response.json()) as HealthResponse).status);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('unavailable');
      }
    }
    void checkHealth();
    return () => controller.abort();
  }, []);

  return (
    <AppShell width="sm">
      <section className="card mx-auto max-w-md p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Activity className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Mini E-commerce API
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Trạng thái máy chủ</h1>

        <div
          className={`mt-6 inline-flex items-center gap-2.5 rounded-full bg-slate-50 px-4 py-2 ring-4 ${tone.ring}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden />
          <span className={`font-mono text-sm font-semibold ${tone.text}`} data-testid="health-status">
            {status}
          </span>
        </div>

        <p className="mt-4 text-sm text-slate-500">{tone.label}</p>
        <p className="mt-1 break-all font-mono text-xs text-slate-400">{apiBaseUrl}/api/health</p>
      </section>
    </AppShell>
  );
}
