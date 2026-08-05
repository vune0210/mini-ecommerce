import {
  Eye,
  EyeOff,
  Filter,
  MessageSquare,
  MessageSquareOff,
  Package,
  ThumbsUp,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { Alert, Badge, EmptyState, PageHeader, Panel, Pagination, Skeleton, Stars } from '../components/ui';
import { formatDateTime } from '../lib/format';
import {
  ADMIN_REVIEW_PAGE_SIZE,
  adminReviewError,
  useAdminReviews,
  useDeleteAdminReview,
  useSetReviewVisibility,
} from '../lib/review-admin-api';
import type { ReviewSort } from '../types/catalog';
import type { AdminReview, ReviewHiddenFilter, ReviewRatingFilter } from '../types/review-admin';

const SORT_LABEL: Record<ReviewSort, string> = {
  newest: 'Mới nhất',
  helpful: 'Hữu ích nhất',
  rating_desc: 'Sao cao đến thấp',
  rating_asc: 'Sao thấp đến cao',
};

const RATINGS: ReviewRatingFilter[] = ['5', '4', '3', '2', '1'];

export function AdminReviewsPage() {
  const [page, setPage] = useState(1);
  const [isHidden, setIsHidden] = useState<ReviewHiddenFilter>('');
  const [rating, setRating] = useState<ReviewRatingFilter>('');
  const [withComment, setWithComment] = useState(false);
  const [sort, setSort] = useState<ReviewSort>('newest');
  // Kept as a pair so the chip can name the product the id belongs to.
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reviews = useAdminReviews({
    page,
    productId: product?.id ?? '',
    isHidden,
    rating,
    withComment,
    sort,
  });
  const visibility = useSetReviewVisibility();
  const remove = useDeleteAdminReview();
  const busy = visibility.isPending || remove.isPending;
  const items = reviews.data?.items ?? [];
  const total = reviews.data?.total ?? 0;
  const totalPages = reviews.data ? Math.max(1, Math.ceil(total / ADMIN_REVIEW_PAGE_SIZE)) : 1;
  const filtered = Boolean(isHidden || rating || withComment || product);

  const onError = (reason: unknown) => setError(adminReviewError(reason));

  /** Every filter change invalidates the current page number. */
  function applyFilter(change: () => void): void {
    change();
    setPage(1);
  }

  function toggleVisibility(review: AdminReview): void {
    setError(null);
    // No confirm on the way in or out: hiding keeps the row and is reversible,
    // which is exactly why it should feel cheaper than deleting.
    visibility.mutate({ id: review.id, isHidden: !review.isHidden }, { onError });
  }

  function destroy(review: AdminReview): void {
    setError(null);
    if (
      !window.confirm(
        `Xoá vĩnh viễn đánh giá của “${review.author.name}”?\n\nKhông thể hoàn tác: dòng dữ liệu và lượt "hữu ích" sẽ mất hẳn. Nếu chỉ muốn gỡ khỏi gian hàng, hãy dùng “Ẩn” — thao tác đó giữ lại đánh giá và có thể bật lại bất cứ lúc nào.`,
      )
    )
      return;
    remove.mutate(review.id, { onError });
  }

  return (
    <AdminShell>
      <PageHeader
        title="Kiểm duyệt đánh giá"
        description="Hàng đợi đánh giá của mọi sản phẩm, gồm cả các đánh giá đã ẩn."
        action={reviews.data && <Badge tone="slate">{total} đánh giá</Badge>}
      />

      <Alert tone="info" className="mb-6">
        <p className="font-semibold">Ẩn trước, xoá sau.</p>
        <p className="mt-1">
          Khi ẩn, đánh giá biến mất khỏi danh sách đánh giá của sản phẩm, khỏi bảng phân bố sao{' '}
          <strong>và khỏi điểm trung bình</strong> — nhưng dữ liệu vẫn được giữ lại, bạn có thể hiện
          lại bất cứ lúc nào. Xoá thì không thể hoàn tác, nên chỉ dùng cho nội dung phải gỡ hẳn.
        </p>
      </Alert>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select
          className="field"
          value={rating}
          onChange={(event) => applyFilter(() => setRating(event.target.value as ReviewRatingFilter))}
          aria-label="Lọc theo số sao"
        >
          <option value="">Tất cả số sao</option>
          {RATINGS.map((value) => (
            <option value={value} key={value}>
              {value} sao
            </option>
          ))}
        </select>
        <select
          className="field"
          value={isHidden}
          onChange={(event) => applyFilter(() => setIsHidden(event.target.value as ReviewHiddenFilter))}
          aria-label="Lọc theo trạng thái hiển thị"
        >
          <option value="">Hiện và ẩn</option>
          <option value="false">Đang hiển thị</option>
          <option value="true">Đã ẩn</option>
        </select>
        <select
          className="field"
          value={sort}
          onChange={(event) => applyFilter(() => setSort(event.target.value as ReviewSort))}
          aria-label="Sắp xếp"
        >
          {(Object.keys(SORT_LABEL) as ReviewSort[]).map((value) => (
            <option value={value} key={value}>
              {SORT_LABEL[value]}
            </option>
          ))}
        </select>
        <div className="flex items-center">
          {filtered ? (
            <button
              className="btn-ghost btn-sm"
              onClick={() =>
                applyFilter(() => {
                  setIsHidden('');
                  setRating('');
                  setWithComment(false);
                  setProduct(null);
                })
              }
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Xoá bộ lọc
            </button>
          ) : (
            <p className="text-xs text-slate-400">Không có bộ lọc nào đang bật</p>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          className={isHidden === 'true' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          aria-pressed={isHidden === 'true'}
          onClick={() => applyFilter(() => setIsHidden(isHidden === 'true' ? '' : 'true'))}
        >
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
          Chỉ đánh giá đã ẩn
        </button>
        <button
          className={withComment ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          aria-pressed={withComment}
          onClick={() => applyFilter(() => setWithComment(!withComment))}
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          Chỉ đánh giá có nội dung
        </button>
        {/* The everyday moderation sweep, in one click. */}
        <button
          className={rating === '1' && withComment ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          aria-pressed={rating === '1' && withComment}
          onClick={() =>
            applyFilter(() => {
              const on = rating === '1' && withComment;
              setRating(on ? '' : '1');
              setWithComment(!on);
            })
          }
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
          1 sao có nội dung
        </button>
        {product && (
          <Badge tone="brand" className="gap-2">
            <Package className="h-3.5 w-3.5" aria-hidden />
            {product.name}
            <button
              className="text-brand-500 hover:text-brand-800"
              aria-label="Bỏ lọc theo sản phẩm"
              onClick={() => applyFilter(() => setProduct(null))}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </Badge>
        )}
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {reviews.isPending ? (
        <Skeleton className="h-96" />
      ) : reviews.isError ? (
        <Alert>Không thể tải hàng đợi kiểm duyệt.</Alert>
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessageSquareOff}
          title="Không có đánh giá nào khớp bộ lọc"
          description={
            filtered
              ? 'Thử bỏ bớt bộ lọc để xem toàn bộ hàng đợi kiểm duyệt.'
              : 'Chưa có khách hàng nào đánh giá sản phẩm.'
          }
        />
      ) : (
        <>
          <Panel bare>
            <ul className={`divide-y divide-slate-100 transition-opacity ${reviews.isFetching ? 'opacity-60' : ''}`}>
              {items.map((review) => (
                <li
                  className={`px-5 py-4 ${
                    review.isHidden ? 'border-l-4 border-l-rose-300 bg-rose-50/40 pl-4' : ''
                  }`}
                  key={review.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars rating={review.rating} size="sm" />
                        <span className="text-sm font-semibold text-slate-700">{review.rating}/5</span>
                        {review.isHidden ? (
                          <Badge tone="rose">
                            <EyeOff className="h-3 w-3" aria-hidden />
                            Đã ẩn khỏi gian hàng
                          </Badge>
                        ) : (
                          <Badge tone="emerald">
                            <Eye className="h-3 w-3" aria-hidden />
                            Đang hiển thị
                          </Badge>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                          {review.helpfulCount} lượt hữu ích
                        </span>
                      </div>

                      <p
                        className={`mt-2 max-w-3xl whitespace-pre-line text-sm ${
                          review.comment ? 'text-slate-700' : 'italic text-slate-400'
                        } ${review.isHidden ? 'opacity-70' : ''}`}
                      >
                        {review.comment ?? 'Đánh giá chỉ có số sao, không có nội dung.'}
                      </p>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        {/* API chỉ trả tên hiển thị — email người đánh giá không bao giờ lộ. */}
                        <span className="inline-flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                          {review.author.name}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                          {review.productName ? (
                            <Link className="link" to={`/products/${review.productId}`}>
                              {review.productName}
                            </Link>
                          ) : (
                            <span className="italic text-slate-400">Sản phẩm đã bị xoá</span>
                          )}
                          <button
                            className="text-slate-400 hover:text-brand-600"
                            aria-label="Chỉ xem đánh giá của sản phẩm này"
                            title="Chỉ xem đánh giá của sản phẩm này"
                            onClick={() =>
                              applyFilter(() =>
                                setProduct({
                                  id: review.productId,
                                  name: review.productName ?? 'Sản phẩm đã bị xoá',
                                }),
                              )
                            }
                          >
                            <Filter className="h-3 w-3" aria-hidden />
                          </button>
                        </span>
                        <span>{formatDateTime(review.createdAt)}</span>
                        {review.updatedAt !== review.createdAt && (
                          <span className="text-slate-400">(đã sửa)</span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        className={review.isHidden ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                        disabled={busy}
                        onClick={() => toggleVisibility(review)}
                        title={
                          review.isHidden
                            ? 'Hiện lại: đánh giá quay lại gian hàng và được tính vào điểm trung bình.'
                            : 'Ẩn: gỡ khỏi gian hàng và khỏi điểm trung bình, có thể hoàn tác.'
                        }
                      >
                        {review.isHidden ? (
                          <>
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                            Hiện lại
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3.5 w-3.5" aria-hidden />
                            Ẩn
                          </>
                        )}
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        disabled={busy}
                        onClick={() => destroy(review)}
                        title="Xoá vĩnh viễn — không thể hoàn tác."
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Xoá
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} summary={`${total} đánh giá`} />
        </>
      )}
    </AdminShell>
  );
}
