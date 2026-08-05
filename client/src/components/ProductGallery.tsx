import { Star } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ProductImage } from './ProductImage';
import type { ProductImage as GalleryImage } from '../types/media';

export type ProductGalleryProps = {
  /** The gallery as the API returns it: already sorted, exactly one primary. */
  images: GalleryImage[] | undefined;
  /**
   * The legacy single thumbnail. Rendered only when the gallery is empty — a
   * product created before galleries existed still has to show its picture.
   */
  imageUrl?: string | null;
  /** Falls back to this when an image carries no alt text of its own. */
  name: string;
  className?: string;
};

/**
 * Main image plus a thumbnail strip, driven by the keyboard as a tab list:
 * arrow keys walk the strip, Home/End jump to its ends. A plain row of buttons
 * would also be reachable, but a shopper tabbing through a ten-picture gallery
 * would then have to press Tab ten times to get past it.
 */
export function ProductGallery({ images, imageUrl = null, name, className = '' }: ProductGalleryProps) {
  const gallery = images ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const thumbnails = useRef<Array<HTMLButtonElement | null>>([]);
  const groupId = useId();

  // Derived rather than stored as an index: an id that disappeared — a deleted
  // image, or another product rendered by the same component — falls back to
  // the primary instead of blanking the frame or pointing at the wrong slot.
  const active: GalleryImage | undefined =
    gallery.find((image) => image.id === activeId) ??
    gallery.find((image) => image.isPrimary) ??
    gallery[0];

  if (!active) {
    return (
      <div className={className}>
        <ProductImage
          imageUrl={imageUrl}
          name={name}
          className="aspect-square w-full rounded-2xl"
        />
      </div>
    );
  }

  const activeIndex = gallery.indexOf(active);

  function select(index: number): void {
    const next = gallery[index];
    if (!next) return;
    setActiveId(next.id);
    // Focus follows selection, which is what a tab list promises: the picture
    // on screen and the thumbnail under the cursor must never disagree.
    thumbnails.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const last = gallery.length - 1;
    const moves: Record<string, number | undefined> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  }

  return (
    <div className={className}>
      <div
        aria-labelledby={`${groupId}-tab-${active.id}`}
        id={`${groupId}-panel`}
        role="tabpanel"
        tabIndex={-1}
      >
        <ProductImage
          imageUrl={active.url}
          name={active.altText ?? name}
          className="aspect-square w-full rounded-2xl"
        />
      </div>

      {gallery.length > 1 && (
        <>
          <div
            aria-label={`Ảnh của ${name}`}
            className="mt-3 flex gap-2 overflow-x-auto pb-1"
            role="tablist"
          >
            {gallery.map((image, index) => {
              const selected = image.id === active.id;
              return (
                <button
                  aria-controls={`${groupId}-panel`}
                  aria-label={image.altText ?? `${name} — ảnh ${index + 1}`}
                  aria-selected={selected}
                  className={`relative shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                    selected ? 'border-brand-600' : 'border-transparent hover:border-slate-300'
                  }`}
                  id={`${groupId}-tab-${image.id}`}
                  key={image.id}
                  onClick={() => setActiveId(image.id)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  ref={(node) => {
                    thumbnails.current[index] = node;
                  }}
                  role="tab"
                  // Roving tabindex: the strip is one stop, not one per picture.
                  tabIndex={selected ? 0 : -1}
                  type="button"
                >
                  <ProductImage
                    imageUrl={image.url}
                    name={image.altText ?? name}
                    className="h-16 w-16"
                  />
                  {image.isPrimary && (
                    <span
                      className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-white/90 text-brand-600"
                      title="Ảnh chính"
                    >
                      <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-400" aria-live="polite">
            Ảnh {activeIndex + 1} / {gallery.length}
            <span className="ml-2 hidden sm:inline">Dùng phím mũi tên để xem ảnh khác.</span>
          </p>
        </>
      )}
    </div>
  );
}
