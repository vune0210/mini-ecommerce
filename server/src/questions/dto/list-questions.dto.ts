import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum QuestionSort {
  NEWEST = 'newest',
  /** Answered threads first — what a shopper looking for an answer wants. */
  ANSWERED = 'answered',
  /** Unanswered first — what someone willing to answer wants. */
  UNANSWERED = 'unanswered',
}

/** Query strings arrive as text, so `?isHidden=false` must not read as truthy. */
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

export class ListQuestionsDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  @ApiPropertyOptional({
    enum: QuestionSort,
    description:
      'Ordering, not a filter: answered and unanswered decide which end of the list the replied-to threads sit at, never which threads exist.',
  })
  @IsOptional()
  @IsEnum(QuestionSort)
  sort: QuestionSort = QuestionSort.NEWEST;
}

/** The moderation queue: hidden rows included, and searchable by product. */
export class ListAdminQuestionsDto extends ListQuestionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Filter by moderation state. Omit to see hidden and visible alike.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isHidden?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Keep only questions with no visible answer — the backlog worth working through.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unansweredOnly?: boolean;
}
