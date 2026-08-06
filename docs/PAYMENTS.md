# Payment provider integration contract

The repository now has a provider-neutral ledger:

- `payments`: one payment attempt tied to an order.
- `payment_refunds`: idempotent refund requests.
- `payment_webhook_events`: atomic `(provider, externalEventId)` claims, storing
  only a SHA-256 of the raw payload rather than the payload itself.

Checkout creates a `MANUAL/PENDING` ledger row in the same transaction as the
order. Moving an order to `PAID` marks it `SUCCEEDED`. Cancelling before payment
marks it `CANCELLED`; cancelling after payment creates one full
`PENDING` refund using `order-cancel:<orderId>` as its idempotency key.

No external money movement is claimed. A VNPay, MoMo or Stripe adapter must
implement `PaymentProviderAdapter`:

1. `createPayment` creates the provider session/redirect.
2. `verifyWebhook` validates the signature against the **raw** request body and
   returns a normalized event.
3. The handler calls `claimWebhook` before changing any local state. A null claim
   is a successful no-op duplicate.
4. Payment/order transitions run in one database transaction.
5. `refund` uses the persisted refund idempotency key. Provider calls happen
   outside an open database transaction; their result is then reconciled.
6. `finishWebhook` records processed or failed state without storing secrets or
   the raw payload.

Provider-specific credentials, signature algorithms, callback URLs and amount
units belong only in the adapter. Never accept a browser redirect as proof of
payment; only a verified webhook or an authenticated back-channel lookup may
mark a payment successful.
