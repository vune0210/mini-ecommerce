import { Star } from 'lucide-react';

type StarsProps = { rating: number; size?: 'sm' | 'md' | 'lg'; className?: string };

const sizes = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-5 w-5' };

export function Stars({ rating, size = 'md', className = '' }: StarsProps) {
  const filled = Math.round(rating);
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="img"
      aria-label={`${rating.toFixed(1)} trên 5 sao`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          className={`${sizes[size]} ${value <= filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
          key={value}
          aria-hidden
        />
      ))}
    </span>
  );
}
