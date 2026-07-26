import { ImageOff } from 'lucide-react';

type ProductImageProps = { imageUrl: string | null; name: string; className?: string };

export function ProductImage({ imageUrl, name, className = '' }: ProductImageProps) {
  if (!imageUrl) {
    return (
      <div
        className={`grid place-items-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 ${className}`}
        aria-label={`Không có ảnh cho ${name}`}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
      </div>
    );
  }
  return <img className={`bg-slate-100 object-cover ${className}`} src={imageUrl} alt={name} loading="lazy" />;
}
