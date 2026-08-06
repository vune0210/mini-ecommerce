import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  PAYMENT_PROVIDER_ADAPTERS,
  PaymentProviderAdapter,
} from './payment-provider';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<string, PaymentProviderAdapter>;

  constructor(
    @Optional()
    @Inject(PAYMENT_PROVIDER_ADAPTERS)
    adapters: PaymentProviderAdapter[] | undefined,
  ) {
    this.providers = new Map(
      (adapters ?? []).map((adapter) => [adapter.name.toUpperCase(), adapter]),
    );
  }

  get(name: string): PaymentProviderAdapter {
    const adapter = this.providers.get(name.toUpperCase());
    if (!adapter)
      throw new NotFoundException(`Payment provider ${name} is not configured`);
    return adapter;
  }
}
