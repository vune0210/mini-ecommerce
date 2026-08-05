import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Product } from '../products/entities/product.entity';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import {
  ListAdminQuestionsDto,
  ListQuestionsDto,
  QuestionSort,
} from './dto/list-questions.dto';
import { SetVisibilityDto } from './dto/set-visibility.dto';
import { UpdateBodyDto } from './dto/update-body.dto';
import { AnswerVote } from './entities/answer-vote.entity';
import { ProductAnswer } from './entities/product-answer.entity';
import { ProductQuestion } from './entities/product-question.entity';
import {
  canDeleteContent,
  canEditContent,
  canVoteOn,
  groupAnswersByQuestion,
  isOfficialAuthor,
  normalizeBody,
  sortAnswersForDisplay,
  visibleAnswerCountDelta,
} from './question-rules';

export type PublicAnswer = {
  id: string;
  questionId: string;
  body: string;
  author: { id: string; name: string };
  isOfficial: boolean;
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicQuestion = {
  id: string;
  productId: string;
  body: string;
  author: { id: string; name: string };
  answerCount: number;
  answers: PublicAnswer[];
  createdAt: Date;
  updatedAt: Date;
};

/** The moderation projections: everything above, plus the state staff act on. */
export type ModeratedAnswer = PublicAnswer & { isHidden: boolean };

export type ModeratedQuestion = Omit<PublicQuestion, 'answers'> & {
  isHidden: boolean;
  productName: string | null;
  answers: ModeratedAnswer[];
};

export type QuestionListResponse = {
  items: PublicQuestion[];
  total: number;
  page: number;
  limit: number;
};

export type AdminQuestionListResponse = {
  items: ModeratedQuestion[];
  total: number;
  page: number;
  limit: number;
};

@Injectable()
export class QuestionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProductQuestion)
    private readonly questions: Repository<ProductQuestion>,
    @InjectRepository(ProductAnswer)
    private readonly answers: Repository<ProductAnswer>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    productId: string,
    query: ListQuestionsDto,
  ): Promise<QuestionListResponse> {
    await this.assertProduct(productId);
    const builder = this.questions
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.user', 'user')
      .where('question.product_id = :productId', { productId })
      // Moderated questions are invisible to the storefront, full stop.
      .andWhere('question.is_hidden = :hidden', { hidden: false });
    const total = await builder.getCount();
    const items = await this.applyQuestionSort(builder, query.sort)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    const answers = await this.answersFor(
      items.map((question) => question.id),
      false,
    );
    return {
      items: items.map((question) =>
        this.serializeQuestion(question, answers.get(question.id) ?? []),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async create(
    user: AuthenticatedUser,
    productId: string,
    dto: CreateQuestionDto,
  ): Promise<PublicQuestion> {
    await this.assertProduct(productId);
    const saved = await this.questions.save(
      this.questions.create({
        productId,
        userId: user.id,
        body: this.requireBody(dto.body),
      }),
    );
    // A brand new question has no thread yet, so nothing to fetch.
    return this.serializeQuestion(await this.questionWithAuthor(saved.id), []);
  }

  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateBodyDto,
  ): Promise<PublicQuestion> {
    const question = await this.questionWithAuthor(id);
    if (!canEditContent(question.userId, user))
      throw new ForbiddenException('You can only edit your own question');
    question.body = this.requireBody(dto.body);
    await this.questions.save(question);
    const answers = await this.answersFor([id], false);
    return this.serializeQuestion(question, answers.get(id) ?? []);
  }

  /** Answers go with it: `product_answers.question_id` cascades in the schema. */
  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const question = await this.questionWithAuthor(id);
    if (!canDeleteContent(question.userId, user))
      throw new ForbiddenException('You can only delete your own question');
    await this.questions.remove(question);
  }

  /**
   * Posts an answer and keeps the denormalized counter in step, in one
   * transaction — a reply that is written but never counted leaves the
   * question showing as unanswered on every listing that sorts by the counter.
   */
  async answer(
    questionId: string,
    user: AuthenticatedUser,
    dto: CreateAnswerDto,
  ): Promise<PublicAnswer> {
    const body = this.requireBody(dto.body);
    let answerId = '';
    await this.dataSource.transaction(async (manager) => {
      const questions = manager.getRepository(ProductQuestion);
      const question = await questions.findOneBy({ id: questionId });
      if (!question) throw new NotFoundException('Question not found');
      // A hidden question is not on the page, so an answer to it could only be
      // written against a stale view — and would resurface nothing.
      if (question.isHidden)
        throw new ForbiddenException(
          'This question has been hidden and cannot be answered',
        );
      const answers = manager.getRepository(ProductAnswer);
      const saved = await answers.save(
        answers.create({
          questionId,
          userId: user.id,
          body,
          // Snapshotted from the writer's role, never from the request body.
          isOfficial: isOfficialAuthor(user.role),
        }),
      );
      answerId = saved.id;
      await questions.increment({ id: questionId }, 'answerCount', 1);
      // Inside the transaction, so "someone answered you" cannot survive an
      // answer that rolled back. Skipped when the asker answered themselves —
      // the inbox is for things other people did.
      if (question.userId !== user.id)
        await this.notifications.notify(manager, {
          userId: question.userId,
          type: NotificationType.ANSWER_POSTED,
          title: isOfficialAuthor(user.role)
            ? 'Cửa hàng đã trả lời câu hỏi của bạn'
            : 'Câu hỏi của bạn có câu trả lời mới',
          body: body.length > 160 ? `${body.slice(0, 157)}...` : body,
          metadata: {
            productId: question.productId,
            questionId: question.id,
            answerId: saved.id,
          },
        });
    });
    return this.serializeAnswer(await this.answerWithAuthor(answerId));
  }

  async updateAnswer(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateBodyDto,
  ): Promise<PublicAnswer> {
    const answer = await this.answerWithAuthor(id);
    if (!canEditContent(answer.userId, user))
      throw new ForbiddenException('You can only edit your own answer');
    // `isOfficial` is untouched: the badge records who wrote it, not who is
    // editing it, and an edit is not a chance to re-derive the author's role.
    answer.body = this.requireBody(dto.body);
    await this.answers.save(answer);
    return this.serializeAnswer(answer);
  }

  async removeAnswer(id: string, user: AuthenticatedUser): Promise<void> {
    const answer = await this.answerWithAuthor(id);
    if (!canDeleteContent(answer.userId, user))
      throw new ForbiddenException('You can only delete your own answer');
    await this.dataSource.transaction(async (manager) => {
      const removed = await manager.getRepository(ProductAnswer).delete({ id });
      // Only decrement when a row was actually removed, and only when it was
      // being counted — a hidden answer was already discounted when it was
      // hidden, so removing it must not subtract a second time.
      if (!removed.affected || answer.isHidden) return;
      await manager
        .getRepository(ProductQuestion)
        .decrement({ id: answer.questionId }, 'answerCount', 1);
    });
  }

  /**
   * Records a helpful vote and keeps the denormalized counter in step, in one
   * transaction. Idempotent: a second vote from the same customer hits the
   * unique index and is swallowed rather than counted twice, so a
   * double-tapped button cannot inflate an answer's ranking.
   */
  async vote(id: string, userId: string): Promise<PublicAnswer> {
    await this.dataSource.transaction(async (manager) => {
      const answer = await manager
        .getRepository(ProductAnswer)
        .findOneBy({ id });
      if (!answer) throw new NotFoundException('Answer not found');
      if (!canVoteOn(answer.userId, userId))
        throw new ForbiddenException(
          'You cannot mark your own answer as helpful',
        );
      try {
        await manager
          .getRepository(AnswerVote)
          .insert({ answerId: id, userId });
      } catch (error) {
        const duplicate =
          error instanceof QueryFailedError &&
          (error as QueryFailedError & { code?: string }).code ===
            'ER_DUP_ENTRY';
        if (duplicate) return;
        throw error;
      }
      await manager
        .getRepository(ProductAnswer)
        .increment({ id }, 'helpfulCount', 1);
    });
    return this.serializeAnswer(await this.answerWithAuthor(id));
  }

  async unvote(id: string, userId: string): Promise<PublicAnswer> {
    await this.dataSource.transaction(async (manager) => {
      const removed = await manager
        .getRepository(AnswerVote)
        .delete({ answerId: id, userId });
      // Only decrement when a vote was actually removed; otherwise a repeated
      // un-vote drives the counter below the number of rows backing it.
      if (!removed.affected) return;
      await manager
        .getRepository(ProductAnswer)
        .decrement({ id }, 'helpfulCount', 1);
    });
    return this.serializeAnswer(await this.answerWithAuthor(id));
  }

  /** The moderation queue: hidden questions included, newest first by default. */
  async findAllForAdmin(
    query: ListAdminQuestionsDto,
  ): Promise<AdminQuestionListResponse> {
    const builder = this.questions
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.user', 'user')
      .leftJoinAndSelect('question.product', 'product');
    if (query.productId)
      builder.andWhere('question.product_id = :productId', {
        productId: query.productId,
      });
    if (query.isHidden !== undefined)
      builder.andWhere('question.is_hidden = :hidden', {
        hidden: query.isHidden,
      });
    // Reads the counter rather than joining: it already means "visible answers".
    if (query.unansweredOnly) builder.andWhere('question.answer_count = 0');
    const total = await builder.getCount();
    const items = await this.applyQuestionSort(builder, query.sort)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    const answers = await this.answersFor(
      items.map((question) => question.id),
      true,
    );
    return {
      items: items.map((question) =>
        this.moderatedQuestion(question, answers.get(question.id) ?? []),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async setQuestionVisibility(
    id: string,
    dto: SetVisibilityDto,
  ): Promise<ModeratedQuestion> {
    const question = await this.questions.findOne({
      where: { id },
      relations: { user: true, product: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    question.isHidden = dto.isHidden;
    await this.questions.save(question);
    // The whole thread goes with the question, so `answer_count` is left alone:
    // the answers are still there, and restoring the question restores them.
    const answers = await this.answersFor([id], true);
    return this.moderatedQuestion(question, answers.get(id) ?? []);
  }

  /**
   * Hides or restores one answer and moves its question's counter by the same
   * transaction, because `answer_count` counts visible answers only. A no-op
   * call moves nothing rather than double-counting.
   */
  async setAnswerVisibility(
    id: string,
    dto: SetVisibilityDto,
  ): Promise<ModeratedAnswer> {
    await this.dataSource.transaction(async (manager) => {
      const answers = manager.getRepository(ProductAnswer);
      const answer = await answers.findOneBy({ id });
      if (!answer) throw new NotFoundException('Answer not found');
      const delta = visibleAnswerCountDelta(answer.isHidden, dto.isHidden);
      if (delta === 0) return;
      await answers.update({ id }, { isHidden: dto.isHidden });
      const questions = manager.getRepository(ProductQuestion);
      if (delta > 0)
        await questions.increment({ id: answer.questionId }, 'answerCount', 1);
      else
        await questions.decrement({ id: answer.questionId }, 'answerCount', 1);
    });
    const answer = await this.answerWithAuthor(id);
    return { ...this.serializeAnswer(answer), isHidden: answer.isHidden };
  }

  /**
   * The answers for a whole page of questions in one query — per question it
   * would be one round trip per row. Sorted once and then grouped, which leaves
   * every bucket in display order.
   */
  private async answersFor(
    questionIds: readonly string[],
    includeHidden: boolean,
  ): Promise<Map<string, ProductAnswer[]>> {
    // `IN ()` is a syntax error, and an empty page is the common case.
    if (questionIds.length === 0) return new Map<string, ProductAnswer[]>();
    const builder = this.answers
      .createQueryBuilder('answer')
      .leftJoinAndSelect('answer.user', 'user')
      .where('answer.question_id IN (:...questionIds)', { questionIds });
    if (!includeHidden)
      builder.andWhere('answer.is_hidden = :hidden', { hidden: false });
    const rows = await builder.getMany();
    return groupAnswersByQuestion(sortAnswersForDisplay(rows));
  }

  /** The id tiebreak keeps pages stable when several rows share a sort value. */
  private applyQuestionSort(
    builder: SelectQueryBuilder<ProductQuestion>,
    sort: QuestionSort,
  ): SelectQueryBuilder<ProductQuestion> {
    if (sort === QuestionSort.ANSWERED)
      builder
        .orderBy('question.answerCount', 'DESC')
        .addOrderBy('question.createdAt', 'DESC');
    else if (sort === QuestionSort.UNANSWERED)
      builder
        .orderBy('question.answerCount', 'ASC')
        .addOrderBy('question.createdAt', 'DESC');
    else builder.orderBy('question.createdAt', 'DESC');
    return builder.addOrderBy('question.id', 'ASC');
  }

  /**
   * MinLength counts blank characters, so a body of spaces reaches the service
   * intact; normalizing first is what makes the length limit mean anything.
   */
  private requireBody(raw: string): string {
    const body = normalizeBody(raw);
    if (!body) throw new BadRequestException('body must not be blank');
    return body;
  }

  private async assertProduct(productId: string): Promise<void> {
    if (!(await this.products.findOneBy({ id: productId })))
      throw new NotFoundException('Product not found');
  }

  private async questionWithAuthor(id: string): Promise<ProductQuestion> {
    const question = await this.questions.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  private async answerWithAuthor(id: string): Promise<ProductAnswer> {
    const answer = await this.answers.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!answer) throw new NotFoundException('Answer not found');
    return answer;
  }

  private moderatedQuestion(
    question: ProductQuestion,
    answers: readonly ProductAnswer[],
  ): ModeratedQuestion {
    return {
      ...this.serializeQuestion(question, []),
      isHidden: question.isHidden,
      productName: question.product?.name ?? null,
      answers: answers.map((answer) => ({
        ...this.serializeAnswer(answer),
        isHidden: answer.isHidden,
      })),
    };
  }

  /** Never exposes the asker's email — only the display name. */
  private serializeQuestion(
    question: ProductQuestion,
    answers: readonly ProductAnswer[],
  ): PublicQuestion {
    return {
      id: question.id,
      productId: question.productId,
      body: question.body,
      author: { id: question.userId, name: question.user.name },
      answerCount: question.answerCount,
      answers: answers.map((answer) => this.serializeAnswer(answer)),
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  /** Never exposes the answerer's email — only the display name. */
  private serializeAnswer(answer: ProductAnswer): PublicAnswer {
    return {
      id: answer.id,
      questionId: answer.questionId,
      body: answer.body,
      author: { id: answer.userId, name: answer.user.name },
      isOfficial: answer.isOfficial,
      helpfulCount: answer.helpfulCount,
      createdAt: answer.createdAt,
      updatedAt: answer.updatedAt,
    };
  }
}
