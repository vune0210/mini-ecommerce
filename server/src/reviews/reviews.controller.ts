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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import {
  PublicReview,
  ReviewListResponse,
  ReviewsService,
} from './reviews.service';

@ApiTags('reviews')
@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(
    @Param('productId') productId: string,
    @Query() query: ListReviewsDto,
  ): Promise<ReviewListResponse> {
    return this.reviews.list(productId, query);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  mine(
    @Param('productId') productId: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<PublicReview | null> {
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<void> {
    await this.reviews.remove(id, request.user);
  }
}
