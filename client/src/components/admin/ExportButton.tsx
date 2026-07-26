import { Download, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { adminError, exportCsv } from '../../lib/admin-api';
import type { ExportQuery } from '../../types/admin';

type Props = {
  kind: 'orders' | 'products';
  params?: ExportQuery;
  label?: string;
  className?: string;
};

/**
 * The CSV endpoints are bearer-protected, so the file cannot be a plain link —
 * the bytes are fetched with the token and handed to the browser as a blob.
 */
export function ExportButton({ kind, params, label = 'Xuất CSV', className = 'btn-secondary btn-sm' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await exportCsv(kind, params);
    } catch (reason) {
      setError(adminError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button className={className} onClick={() => void run()} disabled={busy}>
        {busy ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        {busy ? 'Đang xuất...' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
