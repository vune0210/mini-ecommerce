import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { AuthToken } from '../auth/entities/auth-token.entity';
import { RefreshSession } from '../auth/entities/refresh-session.entity';
import { Address } from '../addresses/entities/address.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Category } from '../categories/entities/category.entity';
import { IdempotencyKey } from '../common/idempotency/entities/idempotency-key.entity';
import { Product } from '../products/entities/product.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { ProductTag } from '../products/entities/product-tag.entity';
import { ProductTagLink } from '../products/entities/product-tag-link.entity';
import { Cart } from '../cart/entities/cart.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { CouponRedemption } from '../coupons/entities/coupon-redemption.entity';
import { StockAlert } from '../inventory/entities/stock-alert.entity';
import { StockMovement } from '../inventory/entities/stock-movement.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderStatusHistory } from '../orders/entities/order-status-history.entity';
import { ProductQuestion } from '../questions/entities/product-question.entity';
import { ProductAnswer } from '../questions/entities/product-answer.entity';
import { AnswerVote } from '../questions/entities/answer-vote.entity';
import { ReturnRequest } from '../returns/entities/return-request.entity';
import { ReturnRequestItem } from '../returns/entities/return-request-item.entity';
import { ReturnStatusHistory } from '../returns/entities/return-status-history.entity';
import { Review } from '../reviews/entities/review.entity';
import { ReviewVote } from '../reviews/entities/review-vote.entity';
import { WishlistItem } from '../wishlist/entities/wishlist-item.entity';

/**
 * The CLI data source. The running app uses `autoLoadEntities` instead, so this
 * list only matters to `migration:generate` — but it matters completely: an
 * entity missing here is invisible to the diff, and the generator happily
 * proposes creating its table a second time. Every new entity belongs in this
 * list on the day it is written.
 */
export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    User,
    AuthToken,
    RefreshSession,
    Address,
    AuditLog,
    Category,
    IdempotencyKey,
    Product,
    ProductImage,
    ProductTag,
    ProductTagLink,
    Cart,
    CartItem,
    Coupon,
    CouponRedemption,
    StockAlert,
    StockMovement,
    Notification,
    NotificationPreference,
    Order,
    OrderItem,
    OrderStatusHistory,
    ProductQuestion,
    ProductAnswer,
    AnswerVote,
    ReturnRequest,
    ReturnRequestItem,
    ReturnStatusHistory,
    Review,
    ReviewVote,
    WishlistItem,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
