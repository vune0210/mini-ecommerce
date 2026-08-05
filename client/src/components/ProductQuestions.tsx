import {
  BadgeCheck,
  Info,
  LogIn,
  MessageCircleQuestion,
  Pencil,
  Reply,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDate } from '../lib/format';
import {
  QUESTION_PAGE_SIZE,
  questionErrorMessage,
  useCreateAnswer,
  useCreateQuestion,
  useDeleteAnswer,
  useDeleteQuestion,
  useHelpfulAnswerVote,
  useQuestions,
  useUpdateAnswer,
  useUpdateQuestion,
} from '../lib/question-api';
import { useAuthStore } from '../stores/auth-store';
import type { Answer, Question, QuestionSort } from '../types/question';
import { Alert, Badge, Pagination, Skeleton } from './ui';

const QUESTION_MIN = 5;
const ANSWER_MIN = 2;
const BODY_MAX = 1000;

/**
 * All three are orderings — none of them removes a question from the list. The
 * labels say "trước" (first) rather than "chỉ" (only) so nobody reads the
 * control as a filter and then wonders where the other threads went.
 */
const sortOptions: Array<{ value: QuestionSort; label: string }> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'answered', label: 'Câu đã có trả lời lên trước' },
  { value: 'unanswered', label: 'Câu chưa có trả lời lên trước' },
];

type Editing = { kind: 'question' | 'answer'; id: string; body: string };

export function ProductQuestions({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<QuestionSort>('newest');
  const [askBody, setAskBody] = useState('');
  const [askError, setAskError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [answering, setAnswering] = useState<{ questionId: string; body: string } | null>(null);
  /**
   * The API never says which answers the viewer has already voted on, so this
   * is the only record of it — and it lives only as long as this page is open.
   * The footnote under the list says exactly that rather than dressing it up as
   * server-backed state.
   */
  const [votedIds, setVotedIds] = useState<ReadonlySet<string>>(new Set());
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const location = useLocation();

  const questions = useQuestions(productId, page, sort);
  const ask = useCreateQuestion(productId);
  const editQuestion = useUpdateQuestion(productId);
  const removeQuestion = useDeleteQuestion(productId);
  const answer = useCreateAnswer(productId);
  const editAnswer = useUpdateAnswer(productId);
  const removeAnswer = useDeleteAnswer(productId);
  const vote = useHelpfulAnswerVote(productId);

  const items = questions.data?.items ?? [];
  const total = questions.data?.total ?? 0;
  const totalPages = questions.data ? Math.max(1, Math.ceil(total / QUESTION_PAGE_SIZE)) : 1;
  const savingEdit = editQuestion.isPending || editAnswer.isPending;

  const onError = (reason: unknown) => setListError(questionErrorMessage(reason));

  /** Anonymous visitors go to the login page instead of firing a request that 401s. */
  function goToLogin(): void {
    navigate('/login', { state: { from: location.pathname } });
  }

  function submitQuestion(event: FormEvent): void {
    event.preventDefault();
    setAskError(null);
    const body = askBody.trim();
    if (body.length < QUESTION_MIN) {
      setAskError(`Câu hỏi cần ít nhất ${QUESTION_MIN} ký tự.`);
      return;
    }
    ask.mutate(body, {
      onSuccess: () => {
        setAskBody('');
        setPage(1);
      },
      onError: (reason) => setAskError(questionErrorMessage(reason)),
    });
  }

  function submitAnswer(event: FormEvent, questionId: string): void {
    event.preventDefault();
    setListError(null);
    const body = answering?.body.trim() ?? '';
    if (body.length < ANSWER_MIN) {
      setListError(`Câu trả lời cần ít nhất ${ANSWER_MIN} ký tự.`);
      return;
    }
    answer.mutate({ questionId, body }, { onSuccess: () => setAnswering(null), onError });
  }

  function saveEdit(event: FormEvent): void {
    event.preventDefault();
    if (!editing) return;
    setListError(null);
    const body = editing.body.trim();
    if (body.length < ANSWER_MIN) {
      setListError(`Nội dung cần ít nhất ${ANSWER_MIN} ký tự.`);
      return;
    }
    // Branched rather than picking a mutation into a variable: the two hooks
    // resolve to different result types, and a union of them is not callable.
    const options = { onSuccess: () => setEditing(null), onError };
    if (editing.kind === 'question') editQuestion.mutate({ id: editing.id, body }, options);
    else editAnswer.mutate({ id: editing.id, body }, options);
  }

  function destroyQuestion(question: Question): void {
    setListError(null);
    if (
      !window.confirm(
        question.answerCount > 0
          ? `Xoá câu hỏi này?\n\nKhông thể hoàn tác — ${question.answerCount} câu trả lời trong luồng cũng sẽ bị xoá theo.`
          : 'Xoá câu hỏi này?\n\nKhông thể hoàn tác.',
      )
    )
      return;
    removeQuestion.mutate(question.id, { onError });
  }

  function destroyAnswer(id: string): void {
    setListError(null);
    if (!window.confirm('Xoá câu trả lời này?\n\nKhông thể hoàn tác — lượt "hữu ích" cũng mất theo.'))
      return;
    removeAnswer.mutate(id, { onError });
  }

  function toggleHelpful(item: Answer): void {
    if (!user) {
      goToLogin();
      return;
    }
    setListError(null);
    const helpful = !votedIds.has(item.id);
    vote.mutate(
      { answerId: item.id, helpful },
      {
        onSuccess: () =>
          setVotedIds((current) => {
            const next = new Set(current);
            if (helpful) next.add(item.id);
            else next.delete(item.id);
            return next;
          }),
        onError,
      },
    );
  }

  function startAnswer(questionId: string): void {
    if (!user) {
      goToLogin();
      return;
    }
    setListError(null);
    setEditing(null);
    setAnswering((current) =>
      current?.questionId === questionId ? null : { questionId, body: '' },
    );
  }

  function startEdit(kind: Editing['kind'], id: string, body: string): void {
    setListError(null);
    setAnswering(null);
    setEditing({ kind, id, body });
  }

  /** Shared by the ask box, the reply box and both edit boxes. */
  function bodyField(
    id: string,
    value: string,
    onChange: (next: string) => void,
    placeholder: string,
    rows = 3,
  ) {
    return (
      <textarea
        className="field"
        id={id}
        rows={rows}
        maxLength={BODY_MAX}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <section className="mt-14 border-t border-slate-200 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Hỏi &amp; đáp về sản phẩm
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Câu trả lời của nhân viên cửa hàng có nhãn{' '}
            <span className="font-semibold text-brand-700">Chính thức</span> và luôn được xếp lên
            đầu; khách hàng khác cũng có thể trả lời.
          </p>
        </div>
        {questions.data && total > 0 && (
          <Badge tone="slate">
            {total} câu hỏi
          </Badge>
        )}
      </div>

      {user ? (
        <form className="card mt-6 space-y-3 p-6" onSubmit={submitQuestion}>
          <label className="label" htmlFor="question-body">
            Đặt câu hỏi về sản phẩm này
          </label>
          {bodyField(
            'question-body',
            askBody,
            setAskBody,
            'Ví dụ: Sản phẩm này có hỗ trợ sạc nhanh không?',
          )}
          {askError && <Alert>{askError}</Alert>}
          <div className="flex flex-wrap items-center gap-4">
            <button className="btn-primary" disabled={ask.isPending}>
              <MessageCircleQuestion className="h-4 w-4" aria-hidden />
              Gửi câu hỏi
            </button>
            <p className="text-xs text-slate-500">
              Từ {QUESTION_MIN} đến {BODY_MAX} ký tự. Tên hiển thị của bạn sẽ đi kèm câu hỏi — email
              thì không.
            </p>
          </div>
        </form>
      ) : (
        <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="font-medium text-slate-700">Bạn cần đăng nhập để đặt câu hỏi</p>
            <p className="mt-1 text-sm text-slate-500">
              Ai cũng đọc được phần hỏi &amp; đáp, nhưng chỉ tài khoản đã đăng nhập mới gửi được câu
              hỏi, câu trả lời và bình chọn hữu ích.
            </p>
          </div>
          <button className="btn-primary" onClick={goToLogin}>
            <LogIn className="h-4 w-4" aria-hidden />
            Đăng nhập
          </button>
        </div>
      )}

      {total > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-500" htmlFor="question-sort">
              Sắp xếp
            </label>
            <select
              className="field w-auto"
              id="question-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as QuestionSort);
                setPage(1);
              }}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Đây chỉ là thứ tự hiển thị, không phải bộ lọc: mọi câu hỏi vẫn nằm trong danh sách, kể
            cả khi bạn chọn “chưa có trả lời lên trước”.
          </p>
        </div>
      )}

      {listError && <Alert className="mt-4">{listError}</Alert>}

      {questions.isPending ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : questions.isError ? (
        <Alert className="mt-6">Không thể tải phần hỏi &amp; đáp. Vui lòng thử lại.</Alert>
      ) : items.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
            <MessageCircleQuestion className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-3 font-medium text-slate-700">Chưa có câu hỏi nào</p>
          <p className="mt-1 text-sm text-slate-500">
            {user
              ? 'Hãy là người đầu tiên hỏi về sản phẩm này.'
              : 'Đăng nhập để trở thành người đầu tiên hỏi về sản phẩm này.'}
          </p>
        </div>
      ) : (
        <>
          <ul className={`mt-6 space-y-4 transition-opacity ${questions.isFetching ? 'opacity-60' : ''}`}>
            {items.map((question) => {
              const mineQuestion = question.author.id === user?.id;
              const canDeleteQuestion = mineQuestion || user?.role === 'ADMIN';
              const editingQuestion =
                editing?.kind === 'question' && editing.id === question.id ? editing : null;
              const replying = answering?.questionId === question.id ? answering : null;

              return (
                <li className="card p-5" key={question.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold uppercase text-brand-700">
                        {question.author.name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {question.author.name}
                          {mineQuestion && <span className="ml-2 text-xs text-slate-400">(bạn)</span>}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDate(question.createdAt)}
                          {question.updatedAt !== question.createdAt && ' · đã sửa'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {mineQuestion && (
                        <button
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          onClick={() => startEdit('question', question.id, question.body)}
                          aria-label="Sửa câu hỏi"
                          title="Sửa câu hỏi của bạn"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                      {canDeleteQuestion && (
                        <button
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          disabled={removeQuestion.isPending}
                          onClick={() => destroyQuestion(question)}
                          aria-label="Xoá câu hỏi"
                          title="Xoá câu hỏi cùng toàn bộ câu trả lời"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>

                  {editingQuestion ? (
                    <form className="mt-4 space-y-3" onSubmit={saveEdit}>
                      {bodyField(
                        `edit-question-${question.id}`,
                        editingQuestion.body,
                        (body) => setEditing({ ...editingQuestion, body }),
                        'Nội dung câu hỏi',
                      )}
                      <div className="flex items-center gap-2">
                        <button className="btn-primary btn-sm" disabled={savingEdit}>
                          Lưu
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          type="button"
                          onClick={() => setEditing(null)}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                          Huỷ
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="mt-4 whitespace-pre-line font-medium leading-relaxed text-slate-800">
                      {question.body}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {question.answerCount > 0 ? (
                      <Badge tone="emerald">{question.answerCount} câu trả lời</Badge>
                    ) : (
                      <Badge tone="amber">Chưa có trả lời</Badge>
                    )}
                    <button className="btn-ghost btn-sm" onClick={() => startAnswer(question.id)}>
                      <Reply className="h-3.5 w-3.5" aria-hidden />
                      {replying ? 'Đóng ô trả lời' : 'Trả lời'}
                    </button>
                  </div>

                  {replying && (
                    <form
                      className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4"
                      onSubmit={(event) => submitAnswer(event, question.id)}
                    >
                      <label className="label" htmlFor={`answer-${question.id}`}>
                        Câu trả lời của bạn
                      </label>
                      {bodyField(
                        `answer-${question.id}`,
                        replying.body,
                        (body) => setAnswering({ questionId: question.id, body }),
                        'Chia sẻ điều bạn biết về sản phẩm này',
                        2,
                      )}
                      <div className="flex items-center gap-2">
                        <button className="btn-primary btn-sm" disabled={answer.isPending}>
                          Gửi trả lời
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          type="button"
                          onClick={() => setAnswering(null)}
                        >
                          Huỷ
                        </button>
                      </div>
                    </form>
                  )}

                  {question.answers.length > 0 && (
                    <ul className="mt-4 space-y-3 border-l-2 border-slate-100 pl-4">
                      {question.answers.map((item) => {
                        const mine = item.author.id === user?.id;
                        const canDelete = mine || user?.role === 'ADMIN';
                        const voted = votedIds.has(item.id);
                        const votePending = vote.isPending && vote.variables?.answerId === item.id;
                        const editingAnswer =
                          editing?.kind === 'answer' && editing.id === item.id ? editing : null;

                        return (
                          <li className="rounded-xl bg-slate-50/80 p-4" key={item.id}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-800">
                                  {item.author.name}
                                </span>
                                {mine && <span className="text-xs text-slate-400">(bạn)</span>}
                                {item.isOfficial && (
                                  <Badge tone="brand">
                                    <BadgeCheck className="h-3 w-3" aria-hidden />
                                    Chính thức
                                  </Badge>
                                )}
                                <span className="text-xs text-slate-400">
                                  {formatDate(item.createdAt)}
                                  {item.updatedAt !== item.createdAt && ' · đã sửa'}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {mine && (
                                  <button
                                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                                    onClick={() => startEdit('answer', item.id, item.body)}
                                    aria-label="Sửa câu trả lời"
                                    title="Sửa câu trả lời của bạn"
                                  >
                                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                    disabled={removeAnswer.isPending}
                                    onClick={() => destroyAnswer(item.id)}
                                    aria-label="Xoá câu trả lời"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                )}
                              </div>
                            </div>

                            {editingAnswer ? (
                              <form className="mt-3 space-y-3" onSubmit={saveEdit}>
                                {bodyField(
                                  `edit-answer-${item.id}`,
                                  editingAnswer.body,
                                  (body) => setEditing({ ...editingAnswer, body }),
                                  'Nội dung câu trả lời',
                                  2,
                                )}
                                <div className="flex items-center gap-2">
                                  <button className="btn-primary btn-sm" disabled={savingEdit}>
                                    Lưu
                                  </button>
                                  <button
                                    className="btn-ghost btn-sm"
                                    type="button"
                                    onClick={() => setEditing(null)}
                                  >
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                    Huỷ
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-600">
                                {item.body}
                              </p>
                            )}

                            <div className="mt-3">
                              {mine ? (
                                // The server rejects self-votes with 403, so the
                                // button is never offered — only the tally.
                                <p className="text-xs text-slate-500">
                                  {item.helpfulCount > 0
                                    ? `${item.helpfulCount} người thấy câu trả lời này hữu ích`
                                    : 'Chưa có ai bình chọn câu trả lời này'}
                                </p>
                              ) : (
                                <button
                                  className={`btn-secondary btn-sm ${voted ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
                                  type="button"
                                  disabled={votePending}
                                  onClick={() => toggleHelpful(item)}
                                  aria-pressed={voted}
                                >
                                  <ThumbsUp
                                    className={`h-3.5 w-3.5 ${voted ? 'fill-current' : ''}`}
                                    aria-hidden
                                  />
                                  {voted ? 'Đã thấy hữu ích' : 'Hữu ích'}
                                  {item.helpfulCount > 0 && (
                                    <span className="tabular-nums">({item.helpfulCount})</span>
                                  )}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Số câu trả lời chỉ tính những câu đang hiển thị: nếu quản trị viên ẩn một câu trả lời,
            câu hỏi sẽ quay lại trạng thái “chưa có trả lời”.
            {user &&
              ' Máy chủ cũng không cho biết bạn đã bình chọn những câu trả lời nào, nên trạng thái “Đã thấy hữu ích” chỉ được ghi nhớ trong lần xem này; tải lại trang sẽ hiển thị lại nút thường. Bình chọn nhiều lần cũng chỉ tính một lần.'}
          </p>

          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            summary={`${total} câu hỏi`}
          />
        </>
      )}
    </section>
  );
}
