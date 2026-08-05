import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminQuestionListResponse,
  AdminQuestionQuery,
  Answer,
  ModeratedAnswer,
  ModeratedQuestion,
  Question,
  QuestionListResponse,
  QuestionSort,
  SetVisibilityInput,
  UpdateBodyInput,
} from '../types/question';
import { apiJson, apiVoid } from './api-client';

const questionsKey = ['questions'] as const;
const adminQuestionsKey = ['admin-questions'] as const;
export const QUESTION_PAGE_SIZE = 10;
export const ADMIN_QUESTION_PAGE_SIZE = 20;

const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Hidden questions and hidden answers are absent from this payload entirely. */
export function getQuestions(
  productId: string,
  page: number,
  sort: QuestionSort = 'newest',
): Promise<QuestionListResponse> {
  const query = new URLSearchParams({ page: String(page), limit: String(QUESTION_PAGE_SIZE) });
  if (sort !== 'newest') query.set('sort', sort);
  return apiJson<QuestionListResponse>(
    `/api/products/${encodeURIComponent(productId)}/questions?${query.toString()}`,
  );
}

export const createQuestion = ({ productId, body }: { productId: string; body: string }) =>
  apiJson<Question>(`/api/products/${encodeURIComponent(productId)}/questions`, {
    method: 'POST',
    ...json({ body }),
  });
export const updateQuestion = ({ id, body }: UpdateBodyInput) =>
  apiJson<Question>(`/api/questions/${encodeURIComponent(id)}`, { method: 'PATCH', ...json({ body }) });
/** Answers 204, and the thread cascades with it — apiVoid, not apiJson. */
export const deleteQuestion = (id: string) =>
  apiVoid(`/api/questions/${encodeURIComponent(id)}`, { method: 'DELETE' });

/**
 * No `isOfficial` in the payload on purpose: the server derives the badge from
 * the caller's role, and `forbidNonWhitelisted` rejects the field outright.
 */
export const createAnswer = ({ questionId, body }: { questionId: string; body: string }) =>
  apiJson<Answer>(`/api/questions/${encodeURIComponent(questionId)}/answers`, {
    method: 'POST',
    ...json({ body }),
  });
export const updateAnswer = ({ id, body }: UpdateBodyInput) =>
  apiJson<Answer>(`/api/answers/${encodeURIComponent(id)}`, { method: 'PATCH', ...json({ body }) });
export const deleteAnswer = (id: string) =>
  apiVoid(`/api/answers/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Both halves answer 200 with the updated answer, and both are idempotent. */
export const voteAnswer = (id: string) =>
  apiJson<Answer>(`/api/answers/${encodeURIComponent(id)}/helpful`, { method: 'POST' });
export const unvoteAnswer = (id: string) =>
  apiJson<Answer>(`/api/answers/${encodeURIComponent(id)}/helpful`, { method: 'DELETE' });

/** The moderation queue: hidden questions and hidden answers included. */
export function getAdminQuestions(
  params: AdminQuestionQuery & { limit: number },
): Promise<AdminQuestionListResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sort: params.sort,
  });
  if (params.productId) query.set('productId', params.productId);
  if (params.isHidden) query.set('isHidden', params.isHidden);
  // Sending unansweredOnly=false would not narrow anything server-side; omit it.
  if (params.unansweredOnly) query.set('unansweredOnly', 'true');
  return apiJson<AdminQuestionListResponse>(`/api/admin/questions?${query.toString()}`);
}

export const setQuestionVisibility = ({ id, isHidden }: SetVisibilityInput) =>
  apiJson<ModeratedQuestion>(`/api/questions/${encodeURIComponent(id)}/visibility`, {
    method: 'PATCH',
    ...json({ isHidden }),
  });
export const setAnswerVisibility = ({ id, isHidden }: SetVisibilityInput) =>
  apiJson<ModeratedAnswer>(`/api/answers/${encodeURIComponent(id)}/visibility`, {
    method: 'PATCH',
    ...json({ isHidden }),
  });

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }

/** placeholderData keeps the current page on screen while a sort change loads. */
export function useQuestions(productId: string, page = 1, sort: QuestionSort = 'newest') {
  return useQuery({
    queryKey: [...questionsKey, productId, page, sort],
    queryFn: () => getQuestions(productId, page, sort),
    enabled: Boolean(productId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Every storefront write moves the thread the shopper is looking at, and an
 * answer also moves its question's `answerCount` — so the whole product's
 * question cache goes, not just the page the row happened to be on.
 */
function useQuestionMutation<TInput, TResult>(
  productId: string,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const invalidate = useInvalidate([[...questionsKey, productId]]);
  return useMutation({ mutationFn, onSuccess: invalidate });
}

export function useCreateQuestion(productId: string) { return useQuestionMutation(productId, (body: string) => createQuestion({ productId, body })); }
export function useUpdateQuestion(productId: string) { return useQuestionMutation(productId, updateQuestion); }
export function useDeleteQuestion(productId: string) { return useQuestionMutation(productId, deleteQuestion); }
export function useCreateAnswer(productId: string) { return useQuestionMutation(productId, createAnswer); }
export function useUpdateAnswer(productId: string) { return useQuestionMutation(productId, updateAnswer); }
export function useDeleteAnswer(productId: string) { return useQuestionMutation(productId, deleteAnswer); }

/**
 * The list endpoint does not report which answers the caller has already voted
 * on, so the pressed state cannot be read back from the server; the caller owns
 * that memory. Both directions are idempotent, so a stale local guess costs at
 * most a redundant request, never a double count.
 */
export function useHelpfulAnswerVote(productId: string) {
  return useQuestionMutation(productId, ({ answerId, helpful }: { answerId: string; helpful: boolean }) =>
    helpful ? voteAnswer(answerId) : unvoteAnswer(answerId),
  );
}

/**
 * Moderation touches both views: the queue itself and the storefront thread the
 * row belongs to. Hiding an answer also moves its question's `answerCount`, so
 * the product page must refetch or it keeps advertising an answer nobody reads.
 */
const moderationKeys = [adminQuestionsKey, questionsKey] as const;

export function useAdminQuestions(params: AdminQuestionQuery) { return useQuery({ queryKey: [...adminQuestionsKey, params], queryFn: () => getAdminQuestions({ ...params, limit: ADMIN_QUESTION_PAGE_SIZE }), placeholderData: keepPreviousData }); }
export function useSetQuestionVisibility() { const invalidate = useInvalidate(moderationKeys); return useMutation({ mutationFn: setQuestionVisibility, onSuccess: invalidate }); }
export function useSetAnswerVisibility() { const invalidate = useInvalidate(moderationKeys); return useMutation({ mutationFn: setAnswerVisibility, onSuccess: invalidate }); }
export function useDeleteAdminQuestion() { const invalidate = useInvalidate(moderationKeys); return useMutation({ mutationFn: deleteQuestion, onSuccess: invalidate }); }
export function useDeleteAdminAnswer() { const invalidate = useInvalidate(moderationKeys); return useMutation({ mutationFn: deleteAnswer, onSuccess: invalidate }); }

export function questionErrorMessage(error: unknown): string { if (!(error instanceof Error)) return 'Thao tác không thành công.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Thao tác không thành công.'; } catch { return error.message; } }
