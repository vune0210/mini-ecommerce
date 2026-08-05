import { Heart, Loader2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useAddToWishlist,
  useIsWishlisted,
  useRemoveFromWishlist,
  wishlistErrorMessage,
} from '../lib/wishlist-api';
import { useAuthStore } from '../stores/auth-store';

type WishlistButtonProps = {
  productId: string;
  /** Used for the screen-reader label; the visible label never repeats it. */
  productName?: string;
  /** 'icon' floats over a product card, 'labelled' sits beside "add to cart". */
  variant?: 'icon' | 'labelled';
  className?: string;
};

export function WishlistButton({
  productId,
  productName,
  variant = 'icon',
  className = '',
}: WishlistButtonProps) {
  const isLoggedIn = useAuthStore((state) => Boolean(state.user && state.tokens));
  const navigate = useNavigate();
  const location = useLocation();
  const savedQuery = useIsWishlisted(productId);
  const save = useAddToWishlist();
  const unsave = useRemoveFromWishlist();

  const isSaved = savedQuery.data === true;
  const isPending = save.isPending || unsave.isPending;
  const error = save.error ?? unsave.error;
  const label = isSaved ? 'Đã yêu thích' : 'Yêu thích';
  const ariaLabel = `${isSaved ? 'Bỏ' : 'Lưu'} ${productName ?? 'sản phẩm'} ${
    isSaved ? 'khỏi' : 'vào'
  } danh sách yêu thích`;

  const toggle = (event: MouseEvent<HTMLButtonElement>): void => {
    // Product tiles wrap the whole card in a <Link>; without this the heart
    // would navigate to the detail page instead of saving.
    event.preventDefault();
    event.stopPropagation();
    // A guest has no token, so firing the request would only earn a 401.
    if (!isLoggedIn) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    if (isSaved) unsave.mutate(productId);
    else save.mutate(productId);
  };

  const heart = isPending ? (
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
  ) : (
    <Heart className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} aria-hidden />
  );

  if (variant === 'labelled') {
    return (
      <button
        className={`btn-secondary ${isSaved ? 'border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50' : ''} ${className}`}
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={isSaved}
        aria-label={ariaLabel}
        title={error ? wishlistErrorMessage(error) : undefined}
      >
        {heart}
        {label}
      </button>
    );
  }

  return (
    <button
      className={`grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-sm ring-1 ring-inset ring-slate-200 backdrop-blur transition-colors hover:bg-white disabled:opacity-60 ${isSaved ? 'text-rose-600' : 'text-slate-500 hover:text-rose-600'} ${className}`}
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={isSaved}
      aria-label={ariaLabel}
      title={error ? wishlistErrorMessage(error) : label}
    >
      {heart}
    </button>
  );
}
