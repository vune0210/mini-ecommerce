import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './common/config/env.validation';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { LoggingInterceptor } from './common/http/logging.interceptor';
import { RateLimitGuard } from './common/throttle/rate-limit.guard';
import { HealthModule } from './health/health.module';
import { UserModule } from './users/user.module';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { AddressesModule } from './addresses/addresses.module';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { CouponsModule } from './coupons/coupons.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { QuestionsModule } from './questions/questions.module';
import { ReturnsModule } from './returns/returns.module';
import { ReviewsModule } from './reviews/reviews.module';
import { StatsModule } from './stats/stats.module';
import { WishlistModule } from './wishlist/wishlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql' as const,
        host: configService.getOrThrow<string>('DB_HOST'),
        port: Number(configService.getOrThrow<string>('DB_PORT')),
        username: configService.getOrThrow<string>('DB_USERNAME'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    HealthModule,
    UserModule,
    AuthModule,
    AccountModule,
    AddressesModule,
    // Imported at the root because the global AuditInterceptor is built in the
    // root injector and cannot resolve AuditService otherwise.
    AuditModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    CouponsModule,
    InventoryModule,
    NotificationsModule,
    WishlistModule,
    OrdersModule,
    QuestionsModule,
    ReturnsModule,
    ReviewsModule,
    StatsModule,
  ],
  // Globals that need DI cannot be registered from main.ts, and registering
  // them here means the e2e suite — which boots AppModule directly — gets the
  // same error envelope and access log as production.
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Records successful mutating requests made by admins. Ordering against
    // LoggingInterceptor does not matter: ensureRequestId is idempotent, so
    // both stamp the same id and the audit row correlates with the access log.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // Global so that any handler carrying @RateLimit() is covered; handlers
    // without the decorator pass straight through untouched.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
