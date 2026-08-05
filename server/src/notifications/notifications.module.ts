import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationPreference])],
  controllers: [NotificationsController],
  // Exported so orders, reviews and coupons can inject the emit API. They pass
  // their own EntityManager, so importing this module does not mean importing a
  // second transaction boundary.
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
