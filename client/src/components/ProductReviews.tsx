import { MessageSquare, Star, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { formatDate } from '../lib/format';
import {
  REVIEW_PAGE_SIZE,
  reviewErrorMessage,
  useCreateReview,
  useDeleteReview,
  useMyReview,
  useReviews,
} from '../lib/review-api';
import { useAuthStore } from '../stores/auth-store';
import { Alert, Pagination, Skeleton, Stars } from './ui';

export function ProductReviews({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const reviews = useReviews(productId, page);
  const myReview = useMyReview(productId);
  const create = useCreateReview(productId);
  const remove = useDeleteReview(productId);
  const summary = reviews.data?.summary;
  const totalPages = reviews.data ? Math.max(1, Math.ceil(reviews.data.total / REVIEW_PAGE_SIZE)) : 1;
  // Server-answered, so a review sitting on a later page still hides the form.
  const canReview = Boolean(user) && myReview.isFetched && !myReview.data;

  function submit(event: FormEvent): void {
    event.preventDefault();
    setError(null);
    create.mutate(
      { productId, rating, comment },
      {
        onSuccess: () => {
          setComment('');
          setRating(5);
          setPage(1);
        },
        onError: (reason) => setError(reviewErrorMessage(reason)),
      },
    );
  }

  return (
    <section className="mt-14 border-t border-slate-200 pt-10">
      <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
        Đánh giá từ khách hàng
      </h2>

      {summary && summary.reviewCount > 0 && (
        <div className="card mt-5 grid gap-8 p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div className="text-center sm:pr-8">
            <p className="text-5xl font-bold tracking-tight text-slate-900">
              {summary.averageRating.toFixed(1)}
            </p>
            <Stars rating={summary.averageRating} className="mt-2 justify-center" />
            <p className="mt-2 text-sm text-slate-500">{summary.reviewCount} đánh giá</p>
          </div>
          <div className="space-y-1.5">
            {(['5', '4', '3', '2', '1'] as const).map((star) => (
              <div className="flex items-center gap-3 text-sm" key={star}>
                <span className="flex w-8 items-center gap-0.5 text-slate-500">
                  {star}
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${(summary.distribution[star] / summary.reviewCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums text-slate-500">
                  {summary.distribution[star]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {canReview && (
        <form className="card mt-6 space-y-4 p-6" onSubmit={submit}>
          <div>
            <span className="label">Chấm điểm</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  className="rounded p-1 transition-transform hover:scale-110"
                  type="button"
                  key={value}
                  onClick={() => setRating(value)}
                  aria-label={`${value} sao`}
                  aria-pressed={rating === value}
                >
                  <Star
                    className={`h-7 w-7 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                    aria-hidden
                  />
                </button>
              ))}
              <span className="ml-2 text-sm font-medium text-slate-600">{rating}/5</span>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="review-comment">
              Nhận xét
            </label>
            <textarea
              className="field"
              id="review-comment"
              rows={3}
              maxLength={1000}
              placeholder="Chia sẻ cảm nhận của bạn (không bắt buộc)"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap items-center gap-4">
            <button className="btn-primary" disabled={create.isPending}>
              Gửi đánh giá
            </button>
            <p className="text-xs text-slate-500">
              Chỉ đánh giá được sản phẩm thuộc đơn hàng đã hoàn tất của bạn.
            </p>
          </div>
        </form>
      )}

      {reviews.isPending ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : !reviews.data?.items.length ? (
        <div className="card mt-6 flex flex-col items-center px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
            <MessageSquare className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-3 font-medium text-slate-700">Chưa có đánh giá nào</p>
          <p className="mt-1 text-sm text-slate-500">Hãy là người đầu tiên chia sẻ cảm nhận.</p>
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-4">
            {reviews.data.items.map((review) => (
              <li className="card p-5" key={review.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold uppercase text-brand-700">
                      {review.author.name.charAt(0)}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">{review.author.name}</p>
                      <Stars rating={review.rating} size="sm" className="mt-0.5" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-slate-400">{formatDate(review.createdAt)}</p>
                    {(review.author.id === user?.id || user?.role === 'ADMIN') && (
                      <button
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(review.id, {
                            onError: (reason) => setError(reviewErrorMessage(reason)),
                          })
                        }
                        aria-label="Xoá đánh giá"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
                {review.comment && (
                  <p className="mt-4 whitespace-pre-line leading-relaxed text-slate-600">
                    {review.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </section>
  );
}
