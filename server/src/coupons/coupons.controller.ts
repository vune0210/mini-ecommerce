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
import { RateLimit } from '../common/throttle/rate-limit.decorator';
import { UserRole } from '../users/entities/user.entity';
import {
  CouponOffer,
  CouponPreview,
  CouponsService,
  PaginatedCoupons,
} from './coupons.service';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ListCouponsDto } from './dto/list-coupons.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { Coupon } from './entities/coupon.entity';

@ApiTags('coupons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get('available')
  @ApiOkResponse({
    description:
      'Published coupons the caller current cart already qualifies for, best discount first. Targeted (non-public) codes are never listed — advertising them would defeat the targeting.',
  })
  available(
    @Request() request: { user: AuthenticatedUser },
  ): Promise<CouponOffer[]> {
    return this.coupons.availableFor(request.user.id);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  // A coupon field is a guessing game for anyone with an account; without a
  // rail the whole code space is enumerable from one session.
  @RateLimit({ limit: 20, windowMs: 60_000 })
  @ApiOkResponse({
    description:
      'Validates a code against the caller cart and returns the discount it would produce. Reserves nothing — checkout re-validates and can still refuse.',
  })
  preview(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: ApplyCouponDto,
  ): Promise<CouponPreview> {
    return this.coupons.preview(request.user.id, dto.code);
  }
}

@ApiTags('admin-coupons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Paginated coupons with their usage counters. Admin-only: the customer projection deliberately hides how much budget is left.',
  })
  list(@Query() query: ListCouponsDto): Promise<PaginatedCoupons> {
    return this.coupons.findAll(query);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<Coupon> {
    return this.coupons.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCouponDto): Promise<Coupon> {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<Coupon> {
    return this.coupons.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOkResponse({
    description:
      'Deletes an unused coupon. A coupon with redemptions returns 409 — deactivate it instead so the ledger stays explainable.',
  })
  async remove(@Param('id') id: string): Promise<void> {
    await this.coupons.remove(id);
  }
}
