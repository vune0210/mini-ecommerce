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
import { CreateReviewDto } from './dto/create-review.dto';
import { ListAdminReviewsDto, ListReviewsDto } from './dto/list-reviews.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import {
  AdminReviewListResponse,
  ModeratedReview,
  PublicReview,
  ReviewListResponse,
  ReviewsService,
} from './reviews.service';

@ApiTags('reviews')
@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Visible reviews plus a rating summary. Moderated reviews are excluded from both the list and the average.',
  })
  list(
    @Param('productId') productId: string,
    @Query() query: ListReviewsDto,
  ): Promise<ReviewListResponse> {
    return this.reviews.list(productId, query);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'The caller own review, if any. Carries isHidden so an author can see their review was moderated rather than lost.',
  })
  mine(
    @Param('productId') productId: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<(PublicReview & { isHidden: boolean }) | null> {
    return this.reviews.findMine(request.user.id, productId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  create(
    @Param('productId') productId: string,
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: CreateReviewDto,
  ): Promise<PublicReview> {
    return this.reviews.create(request.user, productId, dto);
  }
}

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: UpdateReviewDto,
  ): Promise<PublicReview> {
    return this.reviews.update(id, request.user, dto);
  }

  @Post(':id/helpful')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Marks a review helpful. Idempotent — voting twice does not count twice. Authors cannot vote on their own review.',
  })
  vote(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<PublicReview> {
    return this.reviews.vote(id, request.user.id);
  }

  @Delete(':id/helpful')
  @HttpCode(HttpStatus.OK)
  unvote(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<PublicReview> {
    return this.reviews.unvote(id, request.user.id);
  }

  @Patch(':id/visibility')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({
    description:
      'Hides or restores a review. Hiding is reversible and keeps the row, so a wrong call costs nothing.',
  })
  moderate(
    @Param('id') id: string,
    @Body() dto: ModerateReviewDto,
  ): Promise<ModeratedReview> {
    return this.reviews.moderate(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<void> {
    await this.reviews.remove(id, request.user);
  }
}

@ApiTags('admin-reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Moderation queue across every product, hidden reviews included. Filter with ?isHidden=, ?rating=, ?productId=, ?withComment=.',
  })
  list(@Query() query: ListAdminReviewsDto): Promise<AdminReviewListResponse> {
    return this.reviews.findAllForAdmin(query);
  }
}
