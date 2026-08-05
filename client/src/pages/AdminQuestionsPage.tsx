import {
  BadgeCheck,
  Eye,
  EyeOff,
  Filter,
  MessageCircleQuestion,
  MessagesSquare,
  Package,
  ThumbsUp,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { Alert, Badge, EmptyState, PageHeader, Panel, Pagination, Skeleton } from '../components/ui';
import { formatDateTime } from '../lib/format';
import {
  ADMIN_QUESTION_PAGE_SIZE,
  questionErrorMessage,
  useAdminQuestions,
  useDeleteAdminAnswer,
  useDeleteAdminQuestion,
  useSetAnswerVisibility,
  useSetQuestionVisibility,
} from '../lib/question-api';
import type {
  ModeratedAnswer,
  ModeratedQuestion,
  QuestionHiddenFilter,
  QuestionSort,
} from '../types/question';

/** All three are orderings. The only row-removing filter here is unansweredOnly. */
const SORT_LABEL: Record<QuestionSort, string> = {
  newest: 'Mới nhất',
  answered: 'Câu đã có trả lời lên trước',
  unanswered: 'Câu chưa có trả lời lên trước',
};

export function AdminQuestionsPage() {
  const [page, setPage] = useState(1);
  const [isHidden, setIsHidden] = useState<QuestionHiddenFilter>('');
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [sort, setSort] = useState<QuestionSort>('newest');
  // Kept as a pair so the chip can name the product the id belongs to.
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const questions = useAdminQuestions({
    page,
    productId: product?.id ?? '',
    isHidden,
    unansweredOnly,
    sort,
  });
  const questionVisibility = useSetQuestionVisibility();
  const answerVisibility = useSetAnswerVisibility();
  const removeQuestion = useDeleteAdminQuestion();
  const removeAnswer = useDeleteAdminAnswer();
  const busy =
    questionVisibility.isPending ||
    answerVisibility.isPending ||
    removeQuestion.isPending ||
    removeAnswer.isPending;

  const items = questions.data?.items ?? [];
  const total = questions.data?.total ?? 0;
  const totalPages = questions.data ? Math.max(1, Math.ceil(total / ADMIN_QUESTION_PAGE_SIZE)) : 1;
  const filtered = Boolean(isHidden || unansweredOnly || product);

  const onError = (reason: unknown) => setError(questionErrorMessage(reason));

  /** Every filter change invalidates the current page number. */
  function applyFilter(change: () => void): void {
    change();
    setPage(1);
  }

  // No confirm on the way in or out: hiding keeps the row and is reversible,
  // which is exactly why it should feel cheaper than deleting.
  function toggleQuestion(question: ModeratedQuestion): void {
    setError(null);
    questionVisibility.mutate({ id: question.id, isHidden: !question.isHidden }, { onError });
  }

  function toggleAnswer(answer: ModeratedAnswer): void {
    setError(null);
    answerVisibility.mutate({ id: answer.id, isHidden: !answer.isHidden }, { onError });
  }

  function destroyQuestion(question: ModeratedQuestion): void {
    setError(null);
    if (
      !window.confirm(
        `Xoá vĩnh viễn câu hỏi của “${question.author.name}”?\n\nKhông thể hoàn tác: câu hỏi và toàn bộ câu trả lời trong luồng sẽ mất hẳn. Nếu chỉ muốn gỡ khỏi gian hàng, hãy dùng “Ẩn” — thao tác đó giữ lại dữ liệu và có thể bật lại bất cứ lúc nào.`,
      )
    )
      return;
    removeQuestion.mutate(question.id, { onError });
  }

  function destroyAnswer(answer: ModeratedAnswer): void {
    setError(null);
    if (
      !window.confirm(
        `Xoá vĩnh viễn câu trả lời của “${answer.author.name}”?\n\nKhông thể hoàn tác: nội dung và lượt "hữu ích" sẽ mất hẳn. Dùng “Ẩn” nếu chỉ muốn gỡ khỏi gian hàng.`,
      )
    )
      return;
    removeAnswer.mutate(answer.id, { onError });
  }

  return (
    <AdminShell>
      <PageHeader
        title="Kiểm duyệt hỏi & đáp"
        description="Hàng đợi câu hỏi của mọi sản phẩm, gồm cả câu hỏi và câu trả lời đã ẩn."
        action={questions.data && <Badge tone="slate">{total} câu hỏi</Badge>}
      />

      <Alert tone="info" className="mb-6">
        <p className="font-semibold">Ẩn trước, xoá sau.</p>
        <p className="mt-1">
          Ẩn một câu hỏi sẽ gỡ cả luồng khỏi trang sản phẩm và không ai trả lời thêm được nữa; ẩn
          một câu trả lời sẽ <strong>trừ nó khỏi số câu trả lời</strong> của câu hỏi, nên một luồng
          bị ẩn hết sẽ quay lại trạng thái “chưa có trả lời”. Cả hai đều{' '}
          <strong>giữ nguyên dữ liệu và có thể hoàn tác</strong>. Xoá thì không: dòng dữ liệu mất
          hẳn, và xoá câu hỏi sẽ xoá theo mọi câu trả lời của nó.
        </p>
      </Alert>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <select
          className="field"
          value={isHidden}
          onChange={(event) =>
            applyFilter(() => setIsHidden(event.target.value as QuestionHiddenFilter))
          }
          aria-label="Lọc theo trạng thái hiển thị"
        >
          <option value="">Hiện và ẩn</option>
          <option value="false">Đang hiển thị</option>
          <option value="true">Đã ẩn</option>
        </select>
        <select
          className="field"
          value={sort}
          onChange={(event) => applyFilter(() => setSort(event.target.value as QuestionSort))}
          aria-label="Sắp xếp"
        >
          {(Object.keys(SORT_LABEL) as QuestionSort[]).map((value) => (
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
                  setUnansweredOnly(false);
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

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {/* The backlog worth working through — and the only control here that
            actually removes rows; the select above only reorders them. */}
        <button
          className={unansweredOnly ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          aria-pressed={unansweredOnly}
          onClick={() => applyFilter(() => setUnansweredOnly(!unansweredOnly))}
        >
          <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden />
          Chỉ câu chưa có trả lời
        </button>
        <button
          className={isHidden === 'true' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          aria-pressed={isHidden === 'true'}
          onClick={() => applyFilter(() => setIsHidden(isHidden === 'true' ? '' : 'true'))}
        >
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
          Chỉ câu hỏi đã ẩn
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
      <p className="mb-6 text-xs text-slate-400">
        “Câu đã/chưa có trả lời lên trước” chỉ đổi thứ tự, không bỏ bớt câu hỏi nào. Muốn lọc thật
        sự, hãy bật “Chỉ câu chưa có trả lời”.
      </p>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {questions.isPending ? (
        <Skeleton className="h-96" />
      ) : questions.isError ? (
        <Alert>Không thể tải hàng đợi kiểm duyệt.</Alert>
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Không có câu hỏi nào khớp bộ lọc"
          description={
            filtered
              ? 'Thử bỏ bớt bộ lọc để xem toàn bộ hàng đợi kiểm duyệt.'
              : 'Chưa có khách hàng nào đặt câu hỏi về sản phẩm.'
          }
        />
      ) : (
        <>
          <Panel bare>
            <ul
              className={`divide-y divide-slate-100 transition-opacity ${questions.isFetching ? 'opacity-60' : ''}`}
            >
              {items.map((question) => (
                <li
                  className={`px-5 py-4 ${
                    question.isHidden ? 'border-l-4 border-l-rose-300 bg-rose-50/40 pl-4' : ''
                  }`}
                  key={question.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {question.isHidden ? (
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
                        {question.answerCount > 0 ? (
                          <Badge tone="slate">{question.answerCount} trả lời đang hiển thị</Badge>
                        ) : (
                          <Badge tone="amber">Chưa có trả lời</Badge>
                        )}
                      </div>

                      <p
                        className={`mt-2 max-w-3xl whitespace-pre-line text-sm font-medium text-slate-800 ${
                          question.isHidden ? 'opacity-70' : ''
                        }`}
                      >
                        {question.body}
                      </p>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        {/* API chỉ trả tên hiển thị — email người hỏi không bao giờ lộ. */}
                        <span className="inline-flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                          {question.author.name}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                          {question.productName ? (
                            <Link className="link" to={`/products/${question.productId}`}>
                              {question.productName}
                            </Link>
                          ) : (
                            <span className="italic text-slate-400">Sản phẩm đã bị xoá</span>
                          )}
                          <button
                            className="text-slate-400 hover:text-brand-600"
                            aria-label="Chỉ xem câu hỏi của sản phẩm này"
                            title="Chỉ xem câu hỏi của sản phẩm này"
                            onClick={() =>
                              applyFilter(() =>
                                setProduct({
                                  id: question.productId,
                                  name: question.productName ?? 'Sản phẩm đã bị xoá',
                                }),
                              )
                            }
                          >
                            <Filter className="h-3 w-3" aria-hidden />
                          </button>
                        </span>
                        <span>{formatDateTime(question.createdAt)}</span>
                        {question.updatedAt !== question.createdAt && (
                          <span className="text-slate-400">(đã sửa)</span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        className={question.isHidden ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                        disabled={busy}
                        onClick={() => toggleQuestion(question)}
                        title={
                          question.isHidden
                            ? 'Hiện lại: câu hỏi và các câu trả lời chưa bị ẩn riêng sẽ quay lại trang sản phẩm.'
                            : 'Ẩn: gỡ cả luồng khỏi trang sản phẩm, có thể hoàn tác.'
                        }
                      >
                        {question.isHidden ? (
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
                        onClick={() => destroyQuestion(question)}
                        title="Xoá vĩnh viễn câu hỏi cùng toàn bộ câu trả lời — không thể hoàn tác."
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Xoá
                      </button>
                    </div>
                  </div>

                  {question.answers.length > 0 && (
                    <ul className="mt-3 space-y-2 border-l-2 border-slate-100 pl-4">
                      {question.answers.map((answer) => (
                        <li
                          className={`rounded-xl p-3 ${
                            answer.isHidden ? 'bg-rose-50/60' : 'bg-slate-50'
                          }`}
                          key={answer.id}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold text-slate-700">
                                  {answer.author.name}
                                </span>
                                {answer.isOfficial && (
                                  <Badge tone="brand">
                                    <BadgeCheck className="h-3 w-3" aria-hidden />
                                    Chính thức
                                  </Badge>
                                )}
                                {answer.isHidden ? (
                                  <Badge tone="rose">
                                    <EyeOff className="h-3 w-3" aria-hidden />
                                    Đã ẩn · không tính vào số trả lời
                                  </Badge>
                                ) : (
                                  <Badge tone="emerald">
                                    <Eye className="h-3 w-3" aria-hidden />
                                    Đang hiển thị
                                  </Badge>
                                )}
                                <span className="inline-flex items-center gap-1 text-slate-500">
                                  <ThumbsUp className="h-3 w-3" aria-hidden />
                                  {answer.helpfulCount}
                                </span>
                                <span className="text-slate-400">
                                  {formatDateTime(answer.createdAt)}
                                </span>
                              </div>
                              <p
                                className={`mt-1.5 max-w-3xl whitespace-pre-line text-sm text-slate-600 ${
                                  answer.isHidden ? 'opacity-70' : ''
                                }`}
                              >
                                {answer.body}
                              </p>
                            </div>

                            <div className="flex shrink-0 gap-2">
                              <button
                                className={
                                  answer.isHidden ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
                                }
                                disabled={busy}
                                onClick={() => toggleAnswer(answer)}
                                title={
                                  answer.isHidden
                                    ? 'Hiện lại: câu trả lời quay lại gian hàng và được tính lại vào số câu trả lời.'
                                    : 'Ẩn: gỡ khỏi gian hàng và trừ khỏi số câu trả lời, có thể hoàn tác.'
                                }
                              >
                                {answer.isHidden ? (
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
                                onClick={() => destroyAnswer(answer)}
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
                  )}
                </li>
              ))}
            </ul>
          </Panel>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            summary={`${total} câu hỏi`}
          />
        </>
      )}
    </AdminShell>
  );
}
