import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { cartTotals } from '../cart/cart-calculations';
import { Cart } from '../cart/entities/cart.entity';
import {
  couponDefinitionProblem,
  couponDiscount,
  couponRejection,
  normalizeCouponCode,
  PublicCoupon,
  serializeCoupon,
} from './coupon-rules';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ListCouponsDto } from './dto/list-coupons.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { CouponRedemption } from './entities/coupon-redemption.entity';
import { Coupon } from './entities/coupon.entity';

export type CouponPreview = {
  coupon: PublicCoupon;
  subtotal: string;
  discount: string;
  /** Subtotal minus discount; shipping is added at checkout, not here. */
  payable: string;
};

export type PaginatedCoupons = {
  items: Coupon[];
  total: number;
  page: number;
  limit: number;
};

/** A published coupon plus what it would actually save on this cart. */
export type CouponOffer = { coupon: PublicCoupon; discount: string };

/** A promo list longer than this is a wall, not an offer. */
const AVAILABLE_COUPON_LIMIT = 5;

/** What a checkout gets back once a code has actually been spent. */
export type RedeemedCoupon = {
  couponId: string;
  code: string;
  discount: string;
};

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon) private readonly coupons: Repository<Coupon>,
    @InjectRepository(CouponRedemption)
    private readonly redemptions: Repository<CouponRedemption>,
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
  ) {}

  /**
   * Dry-run against the caller's current cart. Nothing is reserved: the code
   * is re-validated and only then spent inside the checkout transaction, so a
   * preview that succeeded can still fail at the till if the last redemption
   * went to someone else in between.
   */
  async preview(userId: string, rawCode: string): Promise<CouponPreview> {
    const code = normalizeCouponCode(rawCode);
    const coupon = await this.coupons.findOneBy({ code });
    if (!coupon) throw new NotFoundException('Coupon not found');

    const cart = await this.carts.findOne({
      where: { user: { id: userId } },
      relations: { items: { product: true } },
    });
    if (!cart?.items.length) throw new BadRequestException('Cart is empty');
    const subtotal = cartTotals(cart.items).totalAmount;

    const userRedemptions = await this.redemptions.countBy({
      couponId: coupon.id,
      userId,
    });
    const rejection = couponRejection(coupon, {
      now: new Date(),
      subtotal,
      userRedemptions,
    });
    if (rejection) throw new BadRequestException(rejection);

    const discount = couponDiscount(coupon, subtotal);
    return {
      coupon: serializeCoupon(coupon),
      subtotal,
      discount,
      payable: (Number(subtotal) - Number(discount)).toFixed(2),
    };
  }

  /**
   * Spends a coupon inside the caller's checkout transaction.
   *
   * The row is locked FOR UPDATE first, which is what makes both counters
   * exact: a plain read-then-increment lets two simultaneous checkouts each see
   * `usage_count = 99` against a limit of 100 and both commit. Serializing
   * redemptions of one code is a cheap price for never over-issuing a discount.
   *
   * The redemption row is not written here — the order does not exist yet. The
   * caller records it with `recordRedemption` once the order id is known, in
   * the same transaction, so the counter and the ledger commit together.
   */
  async redeem(
    manager: EntityManager,
    userId: string,
    rawCode: string,
    subtotal: string,
  ): Promise<RedeemedCoupon> {
    const code = normalizeCouponCode(rawCode);
    const repository = manager.getRepository(Coupon);
    const coupon = await repository
      .createQueryBuilder('coupon')
      .setLock('pessimistic_write')
      .where('coupon.code = :code', { code })
      .getOne();
    if (!coupon) throw new BadRequestException('Coupon not found');

    const userRedemptions = await manager
      .getRepository(CouponRedemption)
      .countBy({ couponId: coupon.id, userId });
    const rejection = couponRejection(coupon, {
      now: new Date(),
      subtotal,
      userRedemptions,
    });
    if (rejection) throw new BadRequestException(rejection);

    const discount = couponDiscount(coupon, subtotal);
    coupon.usageCount += 1;
    await repository.save(coupon);
    return { couponId: coupon.id, code: coupon.code, discount };
  }

  async recordRedemption(
    manager: EntityManager,
    redemption: {
      couponId: string;
      userId: string;
      orderId: string;
      discountAmount: string;
    },
  ): Promise<void> {
    const repository = manager.getRepository(CouponRedemption);
    await repository.save(repository.create(redemption));
  }

  /**
   * Gives the budget back when an order is cancelled. Keyed on the unique
   * order id and guarded by the delete's own affected count, so a double
   * cancel cannot credit the same order twice.
   */
  async release(manager: EntityManager, orderId: string): Promise<void> {
    const repository = manager.getRepository(CouponRedemption);
    const redemption = await repository.findOneBy({ orderId });
    if (!redemption) return;
    const removed = await repository.delete({ id: redemption.id });
    if (!removed.affected) return;
    // GREATEST guards the floor: a counter reset by an admin edit must not be
    // driven negative by a later cancellation of an older order.
    await manager
      .getRepository(Coupon)
      .createQueryBuilder()
      .update(Coupon)
      .set({ usageCount: () => 'GREATEST(`usage_count` - 1, 0)' })
      .where('id = :id', { id: redemption.couponId })
      .execute();
  }

  /**
   * The published coupons the caller's current cart actually qualifies for,
   * best discount first.
   *
   * Only `isPublic` rows are considered. A targeted code the customer was
   * mailed is theirs to type; advertising every active coupon here would hand
   * every account the whole promo list, which is the same as having no
   * targeting at all.
   *
   * Each candidate is run through the same `couponRejection` the till uses, so
   * nothing is offered that would then be refused — the only gap left is the
   * genuine race where the last redemption goes to someone else mid-page.
   */
  async availableFor(
    userId: string,
    limit = AVAILABLE_COUPON_LIMIT,
  ): Promise<CouponOffer[]> {
    const cart = await this.carts.findOne({
      where: { user: { id: userId } },
      relations: { items: { product: true } },
    });
    if (!cart?.items.length) return [];
    const subtotal = cartTotals(cart.items).totalAmount;

    const candidates = await this.coupons.find({
      where: { isPublic: true, isActive: true },
      order: { createdAt: 'DESC' },
    });
    if (!candidates.length) return [];

    // One grouped query rather than one count per coupon: the per-user limit
    // needs a number for each candidate, and N round trips on a checkout page
    // is exactly the kind of loop that only hurts once the promo list grows.
    const rows = await this.redemptions
      .createQueryBuilder('redemption')
      .select('redemption.coupon_id', 'couponId')
      .addSelect('COUNT(*)', 'count')
      .where('redemption.user_id = :userId', { userId })
      .andWhere('redemption.coupon_id IN (:...ids)', {
        ids: candidates.map((coupon) => coupon.id),
      })
      .groupBy('redemption.coupon_id')
      .getRawMany<{ couponId: string; count: string }>();
    const usedByCoupon = new Map(
      rows.map((row) => [row.couponId, Number(row.count)]),
    );

    const now = new Date();
    return candidates
      .filter(
        (coupon) =>
          couponRejection(coupon, {
            now,
            subtotal,
            userRedemptions: usedByCoupon.get(coupon.id) ?? 0,
          }) === null,
      )
      .map((coupon) => ({
        coupon: serializeCoupon(coupon),
        discount: couponDiscount(coupon, subtotal),
      }))
      .sort((left, right) => Number(right.discount) - Number(left.discount))
      .slice(0, limit);
  }

  async findAll(query: ListCouponsDto): Promise<PaginatedCoupons> {
    const builder = this.coupons.createQueryBuilder('coupon');
    const search = query.search?.trim();
    if (search)
      builder.andWhere(
        '(coupon.code LIKE :search OR coupon.description LIKE :search)',
        { search: `%${search}%` },
      );
    if (query.type)
      builder.andWhere('coupon.type = :type', { type: query.type });
    if (query.isActive !== undefined)
      builder.andWhere('coupon.isActive = :isActive', {
        isActive: query.isActive,
      });
    const total = await builder.getCount();
    const items = await builder
      .orderBy('coupon.createdAt', 'DESC')
      .addOrderBy('coupon.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string): Promise<Coupon> {
    const coupon = await this.coupons.findOneBy({ id });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }

  async create(dto: CreateCouponDto): Promise<Coupon> {
    const problem = couponDefinitionProblem(dto);
    if (problem) throw new BadRequestException(problem);
    const code = normalizeCouponCode(dto.code);
    if (await this.coupons.findOneBy({ code }))
      throw new ConflictException('Coupon code already exists');
    return this.coupons.save(
      this.coupons.create({
        code,
        description: dto.description?.trim() || null,
        type: dto.type,
        value: dto.value.toFixed(2),
        minSubtotal: dto.minSubtotal?.toFixed(2) ?? null,
        maxDiscount: dto.maxDiscount?.toFixed(2) ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        isActive: dto.isActive ?? true,
        // Private unless explicitly published; see the entity comment.
        isPublic: dto.isPublic ?? false,
      }),
    );
  }

  async update(id: string, dto: UpdateCouponDto): Promise<Coupon> {
    const coupon = await this.findOne(id);
    // Partial updates are validated against the merged definition, not the
    // patch: raising `value` past 100 on a stored PERCENT coupon must fail
    // even when the request never mentions `type`.
    const problem = couponDefinitionProblem({
      type: dto.type ?? coupon.type,
      value: dto.value ?? Number(coupon.value),
      // `?? undefined` deliberately: an explicit null clears the bound, and a
      // cleared bound cannot conflict with the other one.
      startsAt:
        (dto.startsAt === undefined
          ? coupon.startsAt?.toISOString()
          : dto.startsAt) ?? undefined,
      endsAt:
        (dto.endsAt === undefined
          ? coupon.endsAt?.toISOString()
          : dto.endsAt) ?? undefined,
    });
    if (problem) throw new BadRequestException(problem);

    // Every optional constraint has three cases, not two: absent leaves the
    // stored value alone, an explicit null clears it, a value replaces it.
    // Treating null as "present" is what turned a reasonable "remove the
    // minimum spend" into `null.toFixed(2)` and a 500.
    Object.assign(
      coupon,
      dto.type !== undefined ? { type: dto.type } : {},
      dto.value !== undefined && dto.value !== null
        ? { value: dto.value.toFixed(2) }
        : {},
      dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {},
      dto.minSubtotal !== undefined
        ? { minSubtotal: dto.minSubtotal?.toFixed(2) ?? null }
        : {},
      dto.maxDiscount !== undefined
        ? { maxDiscount: dto.maxDiscount?.toFixed(2) ?? null }
        : {},
      dto.startsAt !== undefined
        ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }
        : {},
      dto.endsAt !== undefined
        ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }
        : {},
      dto.usageLimit !== undefined
        ? { usageLimit: dto.usageLimit ?? null }
        : {},
      dto.perUserLimit !== undefined
        ? { perUserLimit: dto.perUserLimit ?? null }
        : {},
      dto.isActive !== undefined ? { isActive: dto.isActive } : {},
      dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {},
    );
    return this.coupons.save(coupon);
  }

  /**
   * Deactivates rather than deletes once a coupon has been redeemed: the
   * redemption ledger is accounting history, and cascading it away would make
   * past orders unexplainable.
   */
  async remove(id: string): Promise<void> {
    const coupon = await this.findOne(id);
    const redeemed = await this.redemptions.countBy({ couponId: coupon.id });
    if (redeemed > 0)
      throw new ConflictException(
        'Coupon has been redeemed and can only be deactivated',
      );
    await this.coupons.remove(coupon);
  }
}
