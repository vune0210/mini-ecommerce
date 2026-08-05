import { ArrowDown, ArrowUp, ImageOff, ImagePlus, Images, Star, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ProductImage } from '../ProductImage';
import { Alert, Badge, EmptyState, Panel, Skeleton } from '../ui';
import {
  mediaError,
  useAddProductImage,
  useDeleteProductImage,
  useProductMedia,
  useReorderProductImages,
  useUpdateProductImage,
} from '../../lib/media-api';
import type { ProductImage as GalleryImage } from '../../types/media';

type ProductImageManagerProps = { productId: string; productName: string; className?: string };

/** The API validates with @IsUrl; catching it here keeps the round trip out of a typo. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The gallery editor. Two server rules shape it rather than fight it: exactly
 * one image is primary and the server elects it — so there is a "đặt làm ảnh
 * chính" action but no way to un-set one — and `products.imageUrl` is a mirror
 * of that primary, so it is never written from here.
 */
export function ProductImageManager({ productId, productName, className = '' }: ProductImageManagerProps) {
  const media = useProductMedia(productId);
  const add = useAddProductImage();
  const update = useUpdateProductImage();
  const remove = useDeleteProductImage();
  const reorder = useReorderProductImages();

  const [url, setUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Alt-text edits in flight, keyed by image id. Only touched rows get an
  // entry, so a refetch of every other row still shows the server's value.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const images = media.data?.images ?? [];
  const busy = add.isPending || update.isPending || remove.isPending || reorder.isPending;
  const fail = (reason: unknown): void => setError(mediaError(reason));

  function submit(event: FormEvent): void {
    event.preventDefault();
    const trimmed = url.trim();
    if (!isHttpUrl(trimmed)) {
      setError('Nhập một đường dẫn ảnh đầy đủ, bắt đầu bằng http:// hoặc https://.');
      return;
    }
    setError(null);
    add.mutate(
      { productId, url: trimmed, ...(altText.trim() ? { altText: altText.trim() } : {}) },
      {
        onSuccess: () => {
          setUrl('');
          setAltText('');
        },
        onError: fail,
      },
    );
  }

  function move(index: number, delta: number): void {
    const target = index + delta;
    const next = [...images];
    const moving = next[index];
    const displaced = next[target];
    if (!moving || !displaced) return;
    next[index] = displaced;
    next[target] = moving;
    setError(null);
    // One PUT with the whole order: a PATCH per image would park the gallery in
    // an order nobody asked for between calls.
    reorder.mutate({ productId, imageIds: next.map((image) => image.id) }, { onError: fail });
  }

  function saveAlt(image: GalleryImage): void {
    const draft = drafts[image.id];
    if (draft === undefined) return;
    setError(null);
    update.mutate(
      { productId, imageId: image.id, altText: draft.trim() || null },
      {
        onSuccess: () =>
          setDrafts((current) => {
            const next = { ...current };
            delete next[image.id];
            return next;
          }),
        onError: fail,
      },
    );
  }

  function promote(image: GalleryImage): void {
    setError(null);
    update.mutate({ productId, imageId: image.id, isPrimary: true }, { onError: fail });
  }

  function deleteImage(image: GalleryImage): void {
    if (!window.confirm(`Xóa ảnh này khỏi “${productName}”?`)) return;
    setError(null);
    remove.mutate({ productId, imageId: image.id }, { onError: fail });
  }

  return (
    <Panel className={className} title="Thư viện ảnh" icon={Images}>
      <form className="grid gap-3 sm:grid-cols-[2fr_2fr_auto] sm:items-end" onSubmit={submit}>
        <div>
          <label className="label" htmlFor={`image-url-${productId}`}>
            Đường dẫn ảnh
          </label>
          <input
            className="field"
            id={`image-url-${productId}`}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://cdn.example.com/ao-thun-truoc.jpg"
            value={url}
          />
        </div>
        <div>
          <label className="label" htmlFor={`image-alt-${productId}`}>
            Mô tả ảnh <span className="font-normal text-slate-400">(không bắt buộc)</span>
          </label>
          <input
            className="field"
            id={`image-alt-${productId}`}
            onChange={(event) => setAltText(event.target.value)}
            placeholder="Áo thun đen nhìn từ phía trước"
            value={altText}
          />
        </div>
        <button className="btn-primary" disabled={add.isPending}>
          <ImagePlus className="h-4 w-4" aria-hidden />
          Thêm ảnh
        </button>
      </form>
      <p className="mt-1.5 text-xs text-slate-400">
        Ảnh đầu tiên tự động thành ảnh chính. Ảnh chính được đồng bộ sang ảnh đại diện của sản phẩm,
        nên không cần (và không nên) sửa đường dẫn ảnh đại diện bằng tay.
      </p>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-5">
        {media.isPending ? (
          <Skeleton className="h-32" />
        ) : media.isError ? (
          <Alert>Không tải được thư viện ảnh của sản phẩm.</Alert>
        ) : !images.length ? (
          <EmptyState
            icon={ImageOff}
            title="Chưa có ảnh nào"
            description="Thêm ảnh đầu tiên ở trên; ảnh đó sẽ trở thành ảnh chính và hiện ở mọi danh sách sản phẩm."
          />
        ) : (
          <ul className={`space-y-2 transition-opacity ${busy ? 'opacity-60' : ''}`}>
            {images.map((image, index) => {
              const draft = drafts[image.id];
              const dirty = draft !== undefined && draft !== (image.altText ?? '');
              return (
                <li
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"
                  key={image.id}
                >
                  <ProductImage
                    imageUrl={image.url}
                    name={image.altText ?? productName}
                    className="h-14 w-14 shrink-0 rounded-lg"
                  />
                  <div className="min-w-[12rem] flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="slate">#{index + 1}</Badge>
                      {image.isPrimary && (
                        <Badge tone="brand">
                          <Star className="h-3 w-3 fill-current" aria-hidden />
                          Ảnh chính
                        </Badge>
                      )}
                      <span className="truncate text-xs text-slate-400" title={image.url}>
                        {image.url}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        aria-label={`Mô tả ảnh #${index + 1}`}
                        className="field py-1.5 text-xs"
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [image.id]: event.target.value }))
                        }
                        placeholder="Mô tả cho trình đọc màn hình"
                        value={draft ?? image.altText ?? ''}
                      />
                      {dirty && (
                        <button
                          className="btn-secondary btn-sm shrink-0"
                          disabled={update.isPending}
                          onClick={() => saveAlt(image)}
                          type="button"
                        >
                          Lưu
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label={`Đưa ảnh #${index + 1} lên trước`}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                      type="button"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      aria-label={`Đưa ảnh #${index + 1} xuống sau`}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      disabled={busy || index === images.length - 1}
                      onClick={() => move(index, 1)}
                      type="button"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      disabled={busy || image.isPrimary}
                      onClick={() => promote(image)}
                      title={
                        image.isPrimary
                          ? 'Đây đang là ảnh chính. Muốn đổi thì đặt một ảnh khác làm ảnh chính — không thể bỏ trống ảnh chính.'
                          : 'Dùng ảnh này làm ảnh đại diện sản phẩm'
                      }
                      type="button"
                    >
                      <Star className={`h-3.5 w-3.5 ${image.isPrimary ? 'fill-current' : ''}`} aria-hidden />
                      {image.isPrimary ? 'Đang là ảnh chính' : 'Đặt làm ảnh chính'}
                    </button>
                    <button
                      aria-label={`Xóa ảnh #${index + 1}`}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => deleteImage(image)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
