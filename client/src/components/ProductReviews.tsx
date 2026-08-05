import { EyeOff, Info, MessageSquare, Star, ThumbsUp, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDate } from '../lib/format';
import {
  REVIEW_PAGE_SIZE,
  reviewErrorMessage,
  useCreateReview,
  useDeleteReview,
  useHelpfulVote,
  useMyReview,
  useReviews,
  type ReviewFilters,
} from '../lib/review-api';
import { useAuthStore } from '../stores/auth-store';
import type { Review, ReviewSort } from '../types/catalog';
import { Alert, Badge, Pagination, Skeleton, Stars } from './ui';

const STAR_ROWS = ['5', '4', '3', '2', '1'] as const;

const sortOptions: Array<{ value: ReviewSort; label: string }> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'helpful', label: 'Hữu ích nhất' },
  { value: 'rating_desc', label: 'Điểm cao nhất' },
  { value: 'rating_asc', label: 'Điểm thấp nhất' },
];

export function ProductReviews({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [withComment, setWithComment] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  /**
   * The API never says which reviews the viewer has already voted on, so this
   * is the only record of it — and it lives only as long as this page is open.
   * The footnote under the list says exactly that rather than dressing it up as
   * server-backed state.
   */
  const [votedIds, setVotedIds] = useState<ReadonlySet<string>>(new Set());
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const location = useLocation();

  const filters: ReviewFilters = {
    sort,
    ...(starFilter ? { rating: starFilter } : {}),
    ...(withComment ? { withComment: true } : {}),
  };
  const reviews = useReviews(productId, page, filters);
  const myReview = useMyReview(productId);
  const create = useCreateReview(productId);
  const remove = useDeleteReview(productId);
  const vote = useHelpfulVote(productId);
  const summary = reviews.data?.summary;
  const totalPages = reviews.data ? Math.max(1, Math.ceil(reviews.data.total / REVIEW_PAGE_SIZE)) : 1;
  // Server-answered, so a review sitting on a later page still hides the form.
  const canReview = Boolean(user) && myReview.isFetched && !myReview.data;
  const hasFilters = starFilter !== null || withComment;
  const hiddenReview = myReview.data?.isHidden ? myReview.data : null;

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

  function removeReview(id: string): void {
    setListError(null);
    remove.mutate(id, { onError: (reason) => setListError(reviewErrorMessage(reason)) });
  }

  function filterByStar(star: number): void {
    setStarFilter((current) => (current === star ? null : star));
    setPage(1);
  }

  function clearFilters(): void {
    setStarFilter(null);
    setWithComment(false);
    setPage(1);
  }

  function toggleHelpful(review: Review): void {
    if (!user) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setListError(null);
    const helpful = !votedIds.has(review.id);
    vote.mutate(
      { reviewId: review.id, helpful },
      {
        onSuccess: () =>
          setVotedIds((current) => {
            const next = new Set(current);
            if (helpful) next.add(review.id);
            else next.delete(review.id);
            return next;
          }),
        onError: (reason) => setListError(reviewErrorMessage(reason)),
      },
    );
  }

  return (
    <section className="mt-14 border-t border-slate-200 pt-10">
      <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
        Đánh giá từ khách hàng
      </h2>

      {hiddenReview && (
        <Alert tone="warning" className="mt-5">
          <p className="font-semibold">Đánh giá của bạn đang bị ẩn</p>
          <p className="mt-1">
            Quản trị viên đã ẩn đánh giá này, nên nó không xuất hiện trong danh sách bên dưới và
            không được tính vào điểm trung bình. Đánh giá vẫn thuộc về bạn — bạn có thể xoá để gửi
            lại đánh giá khác.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Stars rating={hiddenReview.rating} size="sm" />
            {hiddenReview.comment && (
              <span className="text-amber-900/80">“{hiddenReview.comment}”</span>
            )}
            <button
              className="btn-secondary btn-sm"
              disabled={remove.isPending}
              onClick={() => removeReview(hiddenReview.id)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Xoá đánh giá của tôi
            </button>
          </div>
        </Alert>
      )}

      {summary && summary.reviewCount > 0 && (
        <div className="card mt-5 grid gap-8 p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div className="text-center sm:pr-8">
            <p className="text-5xl font-bold tracking-tight text-slate-900">
              {summary.averageRating.toFixed(1)}
            </p>
            <Stars rating={summary.averageRating} className="mt-2 justify-center" />
            <p className="mt-2 text-sm text-slate-500">{summary.reviewCount} đánh giá</p>
          </div>
          <div>
            <div className="space-y-1">
              {STAR_ROWS.map((star) => {
                const value = Number(star);
                const active = starFilter === value;
                const count = summary.distribution[star];
                return (
                  <button
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-1 text-sm transition-colors ${
                      active
                        ? 'bg-brand-50 ring-1 ring-inset ring-brand-200'
                        : 'hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent'
                    }`}
                    type="button"
                    key={star}
                    disabled={count === 0 && !active}
                    onClick={() => filterByStar(value)}
                    aria-pressed={active}
                    aria-label={`Chỉ xem đánh giá ${star} sao (${count})`}
                  >
                    <span className="flex w-8 items-center gap-0.5 text-slate-500">
                      {star}
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${(count / summary.reviewCount) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 text-right tabular-nums text-slate-500">{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 px-2 text-xs text-slate-400">
              Bấm vào một mức sao để chỉ xem các đánh giá đó.
            </p>
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

      {Boolean(summary?.reviewCount) && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-500" htmlFor="review-sort">
            Sắp xếp
          </label>
          <select
            className="field w-auto"
            id="review-sort"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as ReviewSort);
              setPage(1);
            }}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              type="checkbox"
              checked={withComment}
              onChange={(event) => {
                setWithComment(event.target.checked);
                setPage(1);
              }}
            />
            Chỉ đánh giá có nhận xét
          </label>
          {starFilter !== null && (
            <Badge tone="brand">
              Đang lọc {starFilter} sao
              <button
                className="text-brand-700 hover:text-brand-900"
                type="button"
                onClick={() => filterByStar(starFilter)}
                aria-label="Bỏ lọc theo số sao"
              >
                ×
              </button>
            </Badge>
          )}
          {hasFilters && (
            <button className="btn-ghost btn-sm" onClick={clearFilters}>
              Xoá bộ lọc
            </button>
          )}
        </div>
      )}

      {listError && <Alert className="mt-4">{listError}</Alert>}

      {reviews.isPending ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : reviews.isError ? (
        <Alert className="mt-6">Không thể tải đánh giá. Vui lòng thử lại.</Alert>
      ) : !reviews.data?.items.length ? (
        <div className="card mt-6 flex flex-col items-center px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
            {hasFilters ? (
              <EyeOff className="h-5 w-5" aria-hidden />
            ) : (
              <MessageSquare className="h-5 w-5" aria-hidden />
            )}
          </span>
          {hasFilters ? (
            <>
              <p className="mt-3 font-medium text-slate-700">Không có đánh giá nào khớp bộ lọc</p>
              <p className="mt-1 text-sm text-slate-500">
                Sản phẩm có {summary?.reviewCount ?? 0} đánh giá, nhưng không đánh giá nào thoả
                điều kiện bạn chọn.
              </p>
              <button className="btn-secondary btn-sm mt-4" onClick={clearFilters}>
                Xoá bộ lọc
              </button>
            </>
          ) : (
            <>
              <p className="mt-3 font-medium text-slate-700">Chưa có đánh giá nào</p>
              <p className="mt-1 text-sm text-slate-500">Hãy là người đầu tiên chia sẻ cảm nhận.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-4">
            {reviews.data.items.map((review) => {
              const isMine = review.author.id === user?.id;
              const voted = votedIds.has(review.id);
              const votePending = vote.isPending && vote.variables?.reviewId === review.id;
              return (
                <li className="card p-5" key={review.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold uppercase text-brand-700">
                        {review.author.name.charAt(0)}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">
                          {review.author.name}
                          {isMine && <span className="ml-2 text-xs text-slate-400">(bạn)</span>}
                        </p>
                        <Stars rating={review.rating} size="sm" className="mt-0.5" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-slate-400">{formatDate(review.createdAt)}</p>
                      {(isMine || user?.role === 'ADMIN') && (
                        <button
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          disabled={remove.isPending}
                          onClick={() => removeReview(review.id)}
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
                  <div className="mt-4 flex items-center gap-3">
                    {isMine ? (
                      // The server rejects self-votes with 403, so the button is
                      // never offered — only the tally it earned.
                      <p className="text-xs text-slate-500">
                        {review.helpfulCount > 0
                          ? `${review.helpfulCount} người thấy đánh giá này hữu ích`
                          : 'Chưa có ai bình chọn đánh giá này'}
                      </p>
                    ) : (
                      <button
                        className={`btn-secondary btn-sm ${voted ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
                        type="button"
                        disabled={votePending}
                        onClick={() => toggleHelpful(review)}
                        aria-pressed={voted}
                      >
                        <ThumbsUp
                          className={`h-3.5 w-3.5 ${voted ? 'fill-current' : ''}`}
                          aria-hidden
                        />
                        {voted ? 'Đã thấy hữu ích' : 'Hữu ích'}
                        {review.helpfulCount > 0 && (
                          <span className="tabular-nums">({review.helpfulCount})</span>
                        )}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {user && (
            <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Số lượt hữu ích được lưu trên máy chủ, nhưng máy chủ không cho biết bạn đã bình chọn
              những đánh giá nào. Vì vậy trạng thái “Đã thấy hữu ích” chỉ được ghi nhớ trong lần xem
              này; tải lại trang sẽ hiển thị lại nút thường. Bình chọn nhiều lần cũng chỉ tính một
              lần.
            </p>
          )}

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </section>
  );
}
