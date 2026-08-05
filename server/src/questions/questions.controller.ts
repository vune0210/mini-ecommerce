import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import {
  ListAdminQuestionsDto,
  ListQuestionsDto,
} from './dto/list-questions.dto';
import { SetVisibilityDto } from './dto/set-visibility.dto';
import { UpdateBodyDto } from './dto/update-body.dto';
import {
  AdminQuestionListResponse,
  ModeratedAnswer,
  ModeratedQuestion,
  PublicAnswer,
  PublicQuestion,
  QuestionListResponse,
  QuestionsService,
} from './questions.service';

@ApiTags('questions')
@Controller('products/:productId/questions')
export class ProductQuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Visible questions, each with its visible answers embedded, official ones first. Moderated questions and answers appear in neither.',
  })
  list(
    @Param('productId') productId: string,
    @Query() query: ListQuestionsDto,
  ): Promise<QuestionListResponse> {
    return this.questions.list(productId, query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  create(
    @Param('productId') productId: string,
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: CreateQuestionDto,
  ): Promise<PublicQuestion> {
    return this.questions.create(request.user, productId, dto);
  }
}

@ApiTags('questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: UpdateBodyDto,
  ): Promise<PublicQuestion> {
    return this.questions.update(id, request.user, dto);
  }

  @Post(':id/answers')
  @ApiOkResponse({
    description:
      'Answers a question. The official badge comes from the caller role, never from the payload.',
  })
  answer(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: CreateAnswerDto,
  ): Promise<PublicAnswer> {
    return this.questions.answer(id, request.user, dto);
  }

  @Patch(':id/visibility')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({
    description:
      'Hides or restores a question together with its thread. Reversible — the rows are kept, so a wrong call costs nothing.',
  })
  setVisibility(
    @Param('id') id: string,
    @Body() dto: SetVisibilityDto,
  ): Promise<ModeratedQuestion> {
    return this.questions.setQuestionVisibility(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<void> {
    await this.questions.remove(id, request.user);
  }
}

@ApiTags('questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('answers')
export class AnswersController {
  constructor(private readonly questions: QuestionsService) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: UpdateBodyDto,
  ): Promise<PublicAnswer> {
    return this.questions.updateAnswer(id, request.user, dto);
  }

  @Post(':id/helpful')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Marks an answer helpful. Idempotent — voting twice does not count twice. Authors cannot vote on their own answer.',
  })
  vote(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<PublicAnswer> {
    return this.questions.vote(id, request.user.id);
  }

  @Delete(':id/helpful')
  @HttpCode(HttpStatus.OK)
  unvote(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<PublicAnswer> {
    return this.questions.unvote(id, request.user.id);
  }

  @Patch(':id/visibility')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({
    description:
      'Hides or restores one answer. Hiding also takes it out of its question answer count, so an emptied thread reads as unanswered again.',
  })
  setVisibility(
    @Param('id') id: string,
    @Body() dto: SetVisibilityDto,
  ): Promise<ModeratedAnswer> {
    return this.questions.setAnswerVisibility(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<void> {
    await this.questions.removeAnswer(id, request.user);
  }
}

@ApiTags('admin-questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/questions')
export class AdminQuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Moderation queue across every product, hidden questions and answers included. Filter with ?productId=, ?isHidden=, ?unansweredOnly=.',
  })
  list(
    @Query() query: ListAdminQuestionsDto,
  ): Promise<AdminQuestionListResponse> {
    return this.questions.findAllForAdmin(query);
  }
}
