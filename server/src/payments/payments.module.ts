import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentRefund } from './entities/payment-refund.entity';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { Payment } from './entities/payment.entity';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { StripePaymentAdapter } from './stripe-payment.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentRefund, PaymentWebhookEvent]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProviderRegistry, StripePaymentAdapter],
  exports: [PaymentsService, PaymentProviderRegistry],
})
export class PaymentsModule {}
