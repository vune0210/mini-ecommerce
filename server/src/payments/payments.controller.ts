import { Controller, Headers, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';

type UserRequest = Request & { user: AuthenticatedUser };

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:orderId/stripe-session')
  @UseGuards(JwtAuthGuard)
  createStripeSession(@Param('orderId') orderId: string, @Req() request: UserRequest) {
    return this.payments.createStripeSession(orderId, request.user);
  }

  @Post('webhooks/stripe')
  stripeWebhook(@Req() request: RawBodyRequest<Request>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.payments.processStripeWebhook(request.rawBody ?? Buffer.alloc(0), headers);
  }
}
