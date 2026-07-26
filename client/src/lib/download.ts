import { apiFetch } from './api-client';

/** Falls back to this when the server sends no Content-Disposition filename. */
const FALLBACK = 'export.csv';

function filenameFrom(header: string | null): string {
  if (!header) return FALLBACK;
  // RFC 5987 form wins when present: filename*=UTF-8''name.csv
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) return decodeURIComponent(encoded[1].trim());
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : FALLBACK;
}

/**
 * Downloads an authenticated file. A plain <a href> cannot carry the bearer
 * token, so the bytes are fetched through apiFetch (which also refreshes an
 * expired access token) and handed to the browser as an object URL.
 *
 * Reading the filename needs the API to expose Content-Disposition through
 * CORS — the server sets `exposedHeaders` for exactly this.
 */
export async function downloadFile(path: string): Promise<void> {
  const response = await apiFetch(path);
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFrom(response.headers.get('Content-Disposition'));
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
