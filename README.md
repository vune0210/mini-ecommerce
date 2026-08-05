# mini-ecommerce-ts

This repository contains two plain applications:

```text
server/  NestJS, TypeORM, MySQL, Swagger API
client/  React 18, Vite, TypeScript, Tailwind CSS
```

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop (for local MySQL)

## 1. Start MySQL

```bash
docker compose -f docker-compose.dev.yml up -d
```

The compose credentials match `server/.env.example`. Create the server environment file:

```bash
copy server\.env.example server\.env
```

Use `cp server/.env.example server/.env` on macOS/Linux.

## 2. Start the server

```bash
cd server
npm install
npm run migration:run
npm run start:dev
```

The health endpoint is `http://localhost:3000/api/health`; Swagger is at `http://localhost:3000/api/docs`.

## Authentication development account

The server requires `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`; local values are included in `server/.env.example` and must be replaced outside development.

Create the local ADMIN test account after migrations:

```bash
cd server
npm run seed:admin
```

The development credentials are `admin@mini-ecommerce.local` / `Admin123!`.

`npm run seed:catalog` fills a demo catalogue (with SKUs and one nested category) and two demo discount codes, `WELCOME10` and `FREESHIP50K`, so the coupon flow is exercisable straight away. The seed is idempotent: an existing code is left exactly as an admin last edited it.

## 3. Start the client

In a second terminal:

```bash
cd client
npm install
copy .env.example .env
npm run dev
```

Open the URL reported by Vite (normally `http://localhost:5173`). The root path redirects to the product catalogue at `/products`; the server health check moved to `/health` and is linked from the footer. Set `VITE_API_BASE_URL` in `client/.env` if the API uses another host or port.

| Area | Routes |
| --- | --- |
| Public | `/products`, `/products/:id`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/health` |
| Customer | `/cart`, `/checkout`, `/orders`, `/orders/:id`, `/wishlist`, `/notifications`, `/account/{profile,password,sessions,addresses}`, `/dashboard` |
| Admin | `/admin`, `/admin/products`, `/admin/inventory`, `/admin/categories`, `/admin/orders`, `/admin/orders/:id`, `/admin/coupons`, `/admin/reviews`, `/admin/questions`, `/admin/users` |

The SPA stores both halves of the token pair and replaces them on every refresh, because the API rotates refresh tokens — see *Sessions and refresh-token rotation*. Concurrent 401s share one in-flight refresh so two tabs never present the same token and trip the replay guard.

## API surface

All routes are served under the `/api` prefix and documented in Swagger at `/api/docs`.

### Authentication and sessions

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | public | Create a CUSTOMER account |
| `POST` | `/api/auth/login` | public | Access token (15 min) + rotating refresh token (7 days) |
| `POST` | `/api/auth/refresh` | public | Rotate the session; returns a **new pair** |
| `GET` | `/api/auth/me` | JWT | Current user |
| `PATCH` | `/api/auth/profile` | JWT | Change the display name |
| `PATCH` | `/api/auth/password` | JWT | Change password, revoke all sessions, return a fresh pair |
| `POST` | `/api/auth/logout` | JWT | Revoke the named refresh token, or the caller's own session |
| `POST` | `/api/auth/logout-all` | JWT | Revoke every session of the caller |
| `GET` | `/api/auth/sessions` | JWT | Live sessions, with `current: true` on the one in use |
| `DELETE` | `/api/auth/sessions/:id` | JWT | End one session |
| `POST` | `/api/auth/forgot-password` | public | Always 202 with the same body — see below |
| `POST` | `/api/auth/reset-password` | public | Consume the token, set the password, revoke every session |
| `POST` | `/api/auth/verify-email/request` | JWT | Mint a 24-hour verification token |
| `POST` | `/api/auth/verify-email/confirm` | public | Consume it and stamp `email_verified_at` |

### Catalogue

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/categories` | public | Flat list, each row carrying `productCount` |
| `GET` | `/api/categories/tree` | public | The same categories nested by `parentId` |
| `GET` | `/api/categories/:id` | public | One category |
| `POST`/`PATCH`/`DELETE` | `/api/categories[/:id]` | ADMIN | Category CRUD, `parentId` supported |
| `GET` | `/api/products` | public | Published products; filters below |
| `GET` | `/api/products/:id` | public | Product with `averageRating` and `reviewCount` |
| `GET` | `/api/products/slug/:slug` | public | Look a product up by its URL slug |
| `GET` | `/api/products/:id/related` | public | In-stock siblings from the same category, best rated first |
| `GET` | `/api/products/:id/images` | public | The gallery |
| `POST`/`PATCH`/`DELETE` | `/api/products/:id/images[/:imageId]` | ADMIN | Gallery CRUD |
| `PUT` | `/api/products/:id/images/order` | ADMIN | Reorder in one call |
| `GET` | `/api/tags` | public | Tags with published-product counts |
| `POST`/`PATCH`/`DELETE` | `/api/tags[/:id]` | ADMIN | Tag CRUD |
| `PUT` | `/api/products/:id/tags` | ADMIN | Replace a product's tag set |
| `POST`/`PATCH`/`DELETE` | `/api/products[/:id]` | ADMIN | Product CRUD |
| `PATCH` | `/api/products/:id/stock` | ADMIN | Absolute stock set that writes a ledger entry |
| `GET` | `/api/products/suggest` | public | Typeahead, `?q=` 2-64 chars, max 8 results |
| `GET` | `/api/admin/products[/:id]` | ADMIN | Catalogue including unpublished products |
| `PATCH` | `/api/admin/products/bulk/{visibility,category,price}` | ADMIN | Act on up to 200 products at once |

### Shopping

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/cart`, `/api/cart/items[/:itemId]` | JWT | Cart management |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/addresses[/:id]` | JWT | Saved delivery destinations |
| `PATCH` | `/api/addresses/:id/default` | JWT | Promote one address to default |
| `GET`/`POST`/`DELETE` | `/api/wishlist[/:productId]` | JWT | Saved products |
| `POST` | `/api/wishlist/:productId/move-to-cart` | JWT | Add to cart and unsave |
| `POST` | `/api/coupons/preview` | JWT | Validate a code against the caller's cart |
| `GET` | `/api/coupons/available` | JWT | Published codes this cart qualifies for, best first |
| `GET` | `/api/me/overview` | JWT | Everything the account landing page needs, in one request |
| `GET` | `/api/stock-alerts` | JWT | Sold-out products the caller is waiting on |
| `POST`/`DELETE` | `/api/products/:id/stock-alert` | JWT | Watch / unwatch a sold-out product |
| `GET` | `/api/notifications` | JWT | Inbox, paginated, `unreadOnly` and `type` filters |
| `GET` | `/api/notifications/unread-count` | JWT | Cheap badge count |
| `PATCH` | `/api/notifications/:id/read` | JWT | Idempotent; keeps the first `readAt` |
| `POST` | `/api/notifications/read-all` | JWT | Clear the badge |
| `DELETE` | `/api/notifications/:id` | JWT | Remove one |
| `GET`/`PATCH` | `/api/notifications/preferences` | JWT | Per-category mute switches |
| `GET`/`POST` | `/api/products/:id/questions` | public / JWT | Ask and read |
| `PATCH`/`DELETE` | `/api/questions/:id` | JWT | Author edits; author or ADMIN deletes |
| `POST` | `/api/questions/:id/answers` | JWT | Answer; `isOfficial` derived from the role |
| `PATCH`/`DELETE` | `/api/answers/:id` | JWT | Author edits; author or ADMIN deletes |
| `POST`/`DELETE` | `/api/answers/:id/helpful` | JWT | Idempotent vote, never on your own |
| `POST` | `/api/returns` | JWT | File a return against a COMPLETED order |
| `GET` | `/api/returns[/:id]` | JWT | Own requests; detail is owner or ADMIN |
| `GET` | `/api/returns/:id/history` | JWT | Status timeline, actor redacted for owners |
| `PATCH` | `/api/returns/:id/cancel` | JWT | Owner, only while REQUESTED |
| `POST` | `/api/orders/checkout` | JWT | Returns the new order |
| `GET` | `/api/orders` | JWT | Own orders, paginated, `status` filter |
| `GET` | `/api/orders/:id` | JWT | Owner or ADMIN |
| `GET` | `/api/orders/:id/history` | JWT | Status timeline, owner or ADMIN |
| `PATCH` | `/api/orders/:id/cancel` | JWT | Owner, PENDING orders only |

### Reviews

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/products/:id/reviews` | public | Visible reviews plus a rating summary |
| `GET` | `/api/products/:id/reviews/mine` | JWT | The caller's own review, `isHidden` included |
| `POST` | `/api/products/:id/reviews` | JWT | One review per customer per product |
| `PATCH`/`DELETE` | `/api/reviews/:id` | JWT | Author edits; author or ADMIN deletes |
| `POST`/`DELETE` | `/api/reviews/:id/helpful` | JWT | Cast or withdraw a helpful vote |
| `PATCH` | `/api/reviews/:id/visibility` | ADMIN | Hide or restore a review |
| `GET` | `/api/admin/reviews` | ADMIN | Moderation queue, hidden reviews included |

### Administration

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/orders/admin/all` | ADMIN | All orders, `status` and `search` filters |
| `PATCH` | `/api/orders/:id/status` | ADMIN | Lifecycle transition |
| `GET` | `/api/admin/users` | ADMIN | Paginated accounts, `search`/`role`/`isActive` |
| `PATCH` | `/api/admin/users/:id/role`, `/status` | ADMIN | Change role or deactivate |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/admin/coupons[/:id]` | ADMIN | Coupon CRUD with usage counters |
| `GET` | `/api/admin/stock-movements` | ADMIN | Stock ledger, `productId`/`reason`/`from`/`to` |
| `GET` | `/api/admin/questions` | ADMIN | Q&A moderation queue, hidden rows included |
| `PATCH` | `/api/questions/:id/visibility`, `/api/answers/:id/visibility` | ADMIN | Hide or restore |
| `GET` | `/api/admin/returns` | ADMIN | Return queue, `status` + `search` |
| `PATCH` | `/api/admin/returns/:id/status` | ADMIN | Lifecycle transition |
| `GET` | `/api/admin/audit-log` | ADMIN | Who did what, `actorUserId`/`action`/`resourceType`/`from`/`to` |
| `GET` | `/api/admin/audit-log/actions` | ADMIN | Distinct action strings, for populating a filter |
| `GET` | `/api/admin/stats` | ADMIN | Revenue, customers, best sellers, category split, coupon spend |
| `GET` | `/api/admin/exports/{orders,products,customers}.csv` | ADMIN | Streamed CSV downloads |

### Product listing

`sort` accepts `newest` (default), `price_asc`, `price_desc`, `rating_desc`, and `name_asc`; products without reviews sort last under `rating_desc`. Filters: `search` (name, slug or SKU), `categoryId`, `includeDescendants`, `minPrice`, `maxPrice`, `inStock`, `minRating`. `limit` defaults to 12 and caps at 100.

Products carry an optional unique `sku` and an `isActive` publication flag. Unpublished products are hidden from listings, 404 on public detail, refused at add-to-cart, and rejected at checkout — that is the intended alternative to deleting a product that has order history. `GET /api/admin/products` is the only surface that shows them.

Categories nest through `parentId`. `GET /api/categories/tree` returns the nested shape, and `?categoryId=…&includeDescendants=true` widens a product filter to the whole subtree. Deleting a category that still has subcategories or products returns 409, and a category cannot be moved inside its own subtree.

### Search suggestions

`GET /api/products/suggest?q=` powers the storefront typeahead. It matches name
or SKU across published products only, and ranks a name *starting* with the term
above one merely containing it — typing "tai" should surface "Tai nghe" before
"Bàn phím tai thỏ", which a plain `LIKE` cannot express. It returns a narrow
projection (id, name, slug, price, image, stock), because shipping eight full
product descriptions on every keystroke is the difference between a snappy box
and a sluggish one. A term under two characters returns an empty list rather
than the catalogue.

### Bulk catalogue operations

`PATCH /api/admin/products/bulk/{visibility,category,price}` act on up to 200
ids at a time — an unbounded list turns one request into an unbounded
transaction holding row locks across the whole catalogue.

Every response reports `updated` **and** `skipped[]` with a reason per id.
Partial success is never hidden: "updated: 47" alone leaves an admin believing
the catalogue is in a state it is not. Price adjustment (`PERCENT`, `AMOUNT` or
`SET`, negatives discount) computes each product's new price from its own
current price and *refuses* a result outside `decimal(10,2)` rather than
clamping — a "-99%" typo across a catalogue would otherwise set hundreds of
products to one cent and report complete success. One out-of-range product
skips itself; it does not abort the run.

### Checkout

`POST /api/orders/checkout` takes either a saved `addressId` or the shipping details inline, and copies them onto the order, so later edits to the address book never rewrite delivery history:

```json
{
  "recipientName": "Nguyen Van A",
  "phone": "0901234567",
  "addressLine": "12 Nguyen Hue",
  "ward": "Phuong Ben Nghe",
  "district": "Quan 1",
  "city": "Ho Chi Minh",
  "note": "Giao trong gio hanh chinh.",
  "couponCode": "WELCOME10",
  "paymentMethod": "COD"
}
```

`ward`, `district`, `note`, `couponCode`, and `paymentMethod` are optional; `phone` must match `0xxxxxxxxx` or `+84xxxxxxxxx`. Each order receives a unique human-readable `orderNumber` in the form `ORD-YYMMDD-XXXXX`.

Every order stores its full money breakdown, and the invariant `totalAmount = subtotalAmount - discountAmount + shippingFee` always holds. `paymentMethod` is `COD` or `BANK_TRANSFER`, and `paidAt` is stamped once, the first time the order reaches `PAID`.

A checkout that cannot be fulfilled answers 409 with the offending lines, each carrying a `reason` of `insufficient-stock` or `unavailable` — "only 2 left" and "no longer sold" send the customer to different next actions.

### Coupons

Codes are case-insensitive and stored upper-cased. A coupon is `PERCENT` or `FIXED`, and may carry `minSubtotal`, `maxDiscount` (caps a percentage), `startsAt`/`endsAt` (end bound exclusive), `usageLimit`, and `perUserLimit`.

`POST /api/coupons/preview` returns the discount a code would produce against the caller's current cart but reserves nothing — checkout re-validates and can still refuse if the last redemption went to someone else in between. The customer projection deliberately withholds usage counters.

A coupon also carries `isPublic`, defaulting to **false**. `GET /api/coupons/available` lists only published codes, already filtered through the same `couponRejection` the till uses, so nothing is advertised that would then be refused. Targeted codes never appear there — that is what makes them targeted, and it is why the flag defaults to private for every coupon that existed before the column did.

Redemption is spent inside the checkout transaction under a row lock, so a limited coupon can never be over-issued. Cancelling an order releases the redemption, returning both the budget and the customer's per-user allowance. A coupon that has been redeemed cannot be deleted, only deactivated.

### Shipping fees

`SHIPPING_FLAT_FEE` and `FREE_SHIPPING_THRESHOLD` are optional. Unset, every order ships free and totals match a deployment that predates shipping fees, so enabling the charge is an explicit decision. The threshold compares against the subtotal **after** the discount: a coupon that drops a cart under the free-delivery bar drops the free delivery with it.

### Reviews

A review requires a **COMPLETED** order containing that product, and each customer may review a product once. Responses expose only the reviewer's display name, never their email. Ratings are whole numbers from 1 to 5; `GET /api/products/:id/reviews` returns a `summary` with the average, the total, and the per-star distribution, and accepts `sort` (`newest`, `helpful`, `rating_desc`, `rating_asc`), `rating`, and `withComment`.

Hiding a review removes it from the list, the summary, and the product's average — a moderated review must not keep moving the score. It is reversible, and the author still sees `isHidden: true` on `/reviews/mine` rather than believing the review vanished. Helpful votes are one per customer per review and cannot be cast on your own review.

### Order lifecycle

`PENDING → PAID → SHIPPED → COMPLETED`, with `PENDING` and `PAID` also able to move to `CANCELLED`. `COMPLETED` and `CANCELLED` are terminal. Cancelling an order restores the reserved stock and releases any coupon redemption.

### Inventory ledger

Every stock change appends to `stock_movements` with a signed `delta`, the resulting `balanceAfter`, and a reason of `SALE`, `CANCELLATION`, `ADJUSTMENT`, or `RESTOCK`. `products.stock` answers "how many now"; the ledger is the only thing that answers "where did they go".

`PATCH /api/products/:id/stock` sets an absolute level rather than applying a delta, so a retried request converges on the intended count instead of counting twice. `PATCH /api/products/:id` can still write `stock` directly for backwards compatibility, but only the dedicated route leaves an audit trail.

### Password reset and email verification

There is no SMTP transport in this project, and none was invented. Every mint
builds the payload a mail transport would receive and hands it to one private
`deliver` method — the single seam to replace when a mailer arrives. Outside
production that payload is logged; in production only a masked audit line is,
because a log aggregator is a second store readable by more people than the
database, which is the whole reason only the SHA-256 of a token is persisted.

`POST /api/auth/forgot-password` always answers 202 with a byte-identical body
whether or not the address is registered — a different answer is an
account-existence oracle. Tokens are single-use and time-boxed (reset 1 hour,
verification 24 hours), consumption is a compare-and-set so a mail scanner's
prefetch cannot burn the link, and requesting a new one retires the outstanding
ones so a leaked older email dies the moment the customer asks again. A
successful reset revokes every refresh session and issues no tokens: handing
out a live session off an emailed secret is a login without the new password
ever being typed.

`emailVerified` appears on `GET /api/auth/me`, read from the row on every
request rather than carried in the JWT, so it flips the instant the link is
clicked. **Nothing is gated on it** — the flag is exposed, not enforced.

### Notifications

A durable per-user inbox. Other modules emit through
`NotificationsService.notify(manager, draft)`, which takes the caller's
`EntityManager` so the notification commits or rolls back with the event it
describes — "your order was placed" surviving a checkout that rolled back is
worse than no notification at all.

Emitted today: order placed and order status changed (silent when the customer
moved their own order — an inbox full of "you did the thing you just did" is
what teaches people to stop reading it), review moderated, a new answer on your
question, a watched product back in stock, and a password change. Muting is
enforced *before* the insert, so a muted category produces no rows at all. The
account-security category has no mute switch by design: an alert about takeover
would be silenced first by whoever took the account over.

### Product Q&A

Public questions with answers, where an answer written by staff is flagged
`isOfficial` from the author's role at write time — snapshotted, so a later role
change does not rewrite history. `answer_count` counts *visible* answers, so
moderating one away honestly returns a question to "unanswered". Helpful votes
are one per customer per answer and never on your own.

### Returns and refunds

A customer files a return against a **COMPLETED** order within
`RETURN_WINDOW_DAYS` (30) measured from the completion event in the status
history, not from `updated_at`. A line cannot be claimed for more than was
bought minus quantities already claimed by other open requests, checked under a
row lock so two concurrent filings cannot both see the full quantity free.

`REQUESTED → APPROVED → RECEIVED → REFUNDED`, with `REQUESTED`/`APPROVED` →
`REJECTED` and `REQUESTED` → `CANCELLED` by the customer. Only **RECEIVED**
moves stock: it restocks inside a transaction and appends a `stock_movements`
row under its own `RETURN` reason. That reason exists rather than reusing
`CANCELLATION`, which would assert in the audit trail that delivered, completed
orders had been cancelled. Refunds are computed from the order's snapshotted
line prices, never from the current catalogue price.

### Account overview

`GET /api/me/overview` answers the account landing page in one round trip:
order counts by status, lifetime spend, saved-item counts, review progress, and
a short list of things the customer can act on now.

Spend counts **countable** orders only, reusing the same `COUNTABLE` map the
admin revenue report uses. A customer reading "you have spent X across N
orders" and an admin reading the revenue report have to be counting the same
orders, or one of the two numbers is wrong. The "review invited" count mirrors
exactly what `ReviewsService.create` will accept, so the page can never invite a
review the API would then refuse. Every figure is scoped by user id inside the
query — no id comes from the client, so there is no ownership check to forget.

### Back-in-stock alerts

`POST /api/products/:id/stock-alert` watches a sold-out product. The sweep hangs
off `StockMovementsService.record` — the one place every stock change in the
system already passes through — so no future code path that moves stock can
forget to fire it. It triggers on the *crossing* into stock, not on the level,
so restocking something that never ran out mails nobody. A fired subscription is
deleted rather than flagged, which is what lets the same customer subscribe
again next time.

### Admin audit log

Every successful mutating request made by an ADMIN is recorded with the actor's
email and role snapshotted (so the row survives the staff account being
deleted), the derived action, the target resource, the status code and the
request id that correlates it with the access log. Request bodies are never
stored wholesale — only an allow-list of primitives, filtered again through the
same redaction policy the access log uses. The write is fire-and-forget: an
unavailable audit table can never delay or fail the admin's request. The trail
begins the day the feature shipped; no history was fabricated.

### Idempotent checkout

`POST /api/orders/checkout` accepts an optional `Idempotency-Key` header (8-128
chars of `[A-Za-z0-9._:-]`). Claiming a key is an INSERT against a unique index,
never a read-then-write, so a double-tapped "place order" cannot create two
orders even when both requests are in flight. Retrying with the same key and
body replays the stored response; reusing it with a *different* body is a 409,
because replaying would silently discard the second order. A failed attempt
releases the key so the customer can fix their cart and retry. Omitting the
header runs exactly as before, so clients can adopt it one at a time.

### Health probes

`/api/health` is unchanged. `/api/health/live` never touches the database on
purpose: a liveness probe that fails during a MySQL outage makes the
orchestrator restart every replica in a loop without bringing MySQL back.
`/api/health/ready` is where dependency health belongs — it also fails when the
container started ahead of its migration step, and the correct response there is
to drain traffic, not to kill the container. `/api/health/info` reports version,
short commit, environment and Node version from deploy variables.

### Sessions and refresh-token rotation

Refresh tokens are server-side sessions. Only the SHA-256 of each token is stored, so a database dump is not replayable, and every call to `/api/auth/refresh` retires the presented token and returns a replacement — **clients must store both halves of the response.**

Replaying a retired token is the signature of a stolen credential being used alongside the legitimate one, so it revokes the entire rotation chain, not just the presented leaf. A 30-second grace window keeps two tabs refreshing at the same instant from tripping that: a client race is not a theft. Deactivating an account, or changing its password, revokes its sessions immediately.

### Rate limiting

`@RateLimit()` marks the credential and coupon-guessing endpoints; everything else, including the catalogue reads that make up most traffic, passes straight through. Blocked callers get 429 with `Retry-After` and `X-RateLimit-*` headers.

| Route | Budget |
| --- | --- |
| `POST /api/auth/register` | 20 per hour |
| `POST /api/auth/login` | 10 per 15 minutes |
| `POST /api/auth/refresh` | 30 per 15 minutes |
| `PATCH /api/auth/password` | 5 per 15 minutes |
| `POST /api/coupons/preview` | 20 per minute |

Authenticated callers are charged per account, anonymous ones per IP (first `X-Forwarded-For` hop). Counters are **per process**: behind several API replicas each enforces its own share. That is adequate for the brute-force and spam rails it protects, but it is not a distributed quota — moving to one means swapping the store for Redis, not rewriting the rules.

### Admin statistics

`GET /api/admin/stats` reports the revenue breakdown (net, merchandise, discounts, shipping, completed, cancelled), order counts by status, average order value, customers (total, new in range, repeat), products (total, out of stock, unpublished), best sellers, top customers, revenue by category, coupon spend, low stock, and a daily series. Revenue and the series count only `PAID`/`SHIPPED`/`COMPLETED` orders. Coupon spend is read from the redemption ledger, so a cancelled order stops counting against the discount budget.

## Checks

```bash
cd server && npm run build && npm run lint
cd client && npm run build && npm run lint
```

## Deployment

[![CI](https://github.com/vune0210/minishop/actions/workflows/ci.yml/badge.svg)](https://github.com/vune0210/minishop/actions/workflows/ci.yml)

Production architecture: the Vite frontend is deployed to Vercel; the NestJS API and MySQL database are deployed as separate Railway services. Vercel calls the Railway API through `VITE_API_BASE_URL`; the API permits only that Vercel origin through `FRONTEND_URL`.

### Local Docker

This starts the complete application: MySQL, the NestJS API, and the Vite
frontend served by Nginx. The frontend proxies `/api` requests to the backend,
so no client environment file is needed.

```bash
docker compose up --build
```

Open `http://localhost:8082`. The API health check remains available at
`http://localhost:3000/api/health` and Swagger at `http://localhost:3000/api/docs`.
The backend container waits for MySQL, runs compiled TypeORM migrations, seeds
the development catalogue and admin account, then starts the API. The local
admin credentials are `admin@mini-ecommerce.local` / `Admin123!`.

Stop the stack with `docker compose down`. Add `-v` to also remove the local
MySQL data volume.

### Railway backend and MySQL

1. Create a Railway project and add a **MySQL** service in the Railway dashboard.
2. Create a service from this repository. Set its **Root Directory** to `server`, so Railway uses `server/Dockerfile`.
3. In the backend service Variables tab, set the following. Copy the MySQL host, port, user, password, and database values from the Railway MySQL service's Variables tab.

```text
DB_HOST=<Railway MySQL host>
DB_PORT=<Railway MySQL port>
DB_USERNAME=<Railway MySQL user>
DB_PASSWORD=<Railway MySQL password>
DB_NAME=<Railway MySQL database>
DB_SSL=false
JWT_ACCESS_SECRET=<long random secret>
JWT_REFRESH_SECRET=<different long random secret>
FRONTEND_URL=https://<your-vercel-project>.vercel.app
```

`PORT` is supplied by Railway; do not hard-code it. Deploy from a terminal with Railway CLI after linking the project:

```bash
railway login
railway link
cd server
railway up
```

The container command runs migrations before starting the Nest process. Set `FRONTEND_URL` after the Vercel URL is known, then redeploy the backend.

### Vercel frontend

Import the repository in Vercel and set the project **Root Directory** to `client`. Vercel detects Vite; use `npm run build` and `dist` if it asks for explicit values. In Vercel Project Settings → Environment Variables, add:

```text
VITE_API_BASE_URL=https://<your-railway-backend>.up.railway.app
```

Deploy with the CLI if preferred:

```bash
cd client
vercel
vercel --prod
```

After Vercel returns its production URL, set that exact origin as Railway's `FRONTEND_URL` and redeploy Railway. Do not use `*` for CORS or commit real credentials.

## Running tests

Backend unit tests do not need MySQL:

```bash
cd server
npm run test
```

E2E tests use a separate MySQL database. Set `DB_NAME_TEST` to a name other than `DB_NAME`; the test bootstrap runs migrations before Jest starts and refuses to run when the names match. Create the schema once with a MySQL account that has `CREATE DATABASE` privileges if the application account does not.

`test/setup-env.ts` sets `RATE_LIMIT_DISABLED=true` for the suite — it registers and logs in dozens of accounts from one address, which is exactly what the limits exist to stop. `test/rate-limit.e2e-spec.ts` is the one spec that re-enables them, so the guard itself stays covered rather than assumed.

```bash
cd server
$env:DB_NAME_TEST='mini_ecommerce_test' # PowerShell
npm run test:e2e
```

On macOS/Linux: `DB_NAME_TEST=mini_ecommerce_test npm run test:e2e`.

## Database migrations

Migrations run in timestamp order and build the whole schema; `synchronize` is off everywhere.

| Migration | Adds |
| --- | --- |
| `InitialSchema` | Baseline schema |
| `AddUserAuthentication` | `users` |
| `AddCategoriesAndProducts` | `categories`, `products` |
| `AddCart` | `carts`, `cart_items` |
| `AddOrders` | `orders`, `order_items` |
| `AddOrderShippingDetails` | Order number and shipping columns on `orders`, plus a `(status, created_at)` index |
| `AddProductReviews` | `reviews` |
| `AddUserActiveFlag` | `users.is_active` |
| `AddOrderStatusHistory` | `order_status_history` |
| `AddRefreshSessions` | `refresh_sessions` |
| `AddAddressesAndWishlist` | `addresses`, `wishlist_items` |
| `AddCouponsAndOrderMoney` | `coupons`, `coupon_redemptions`, money-breakdown and payment columns on `orders` |
| `AddStockMovements` | `stock_movements` |
| `AddCatalogHierarchyAndSku` | `products.sku`, `products.is_active`, `categories.parent_id` |
| `AddReviewModeration` | `reviews.is_hidden`, `reviews.helpful_count`, `review_votes` |
| `AddProductMediaAndTags` | `product_images`, `product_tags`, `product_tag_links` |
| `AddProductQuestions` | `product_questions`, `product_answers`, `answer_votes` |
| `AddNotifications` | `notifications`, `notification_preferences` |
| `AddAuthTokens` | `auth_tokens`, `users.email_verified_at` |
| `AddReturnRequests` | `return_requests`, `return_request_items`, `return_status_history` |
| `AddAuditLog` | `audit_log` |
| `AddIdempotencyKeys` | `idempotency_keys` |
| `AddReturnStockMovementReason` | `RETURN` appended to the `stock_movements.reason` enum |
| `AddStockAlerts` | `stock_alerts` |
| `AddPublicCoupons` | `coupons.is_public` |

`AddOrderShippingDetails` backfills existing rows before switching the new columns to `NOT NULL`: order numbers become `ORD-LEGACY-…`, the recipient name is copied from the ordering user, and the remaining address fields are set to `unknown`.

`AddCouponsAndOrderMoney` backfills so the money invariant holds for history too: a pre-coupon order had no discount and no delivery charge, so its `subtotal_amount` is exactly its `total_amount`. `paid_at` is recovered from `order_status_history` rather than guessed from `updated_at`, which would date a payment to the last time anything on the order changed.

`AddCatalogHierarchyAndSku` and `AddReviewModeration` default `is_active` to 1 and `is_hidden` to 0, so an upgrade never unpublishes a live catalogue or silently re-scores it. `sku` stays NULL for existing products — inventing one would put a fake identifier on a real shelf label.

`AddRefreshSessions` backfills nothing. Refresh tokens handed out before it ran carry no `jti`, cannot name a session row, and are rejected at the next refresh: one forced re-login, once.

`AddProductMediaAndTags` backfills one primary gallery row per product that already had an `image_url`, so no product's gallery is emptier than its legacy field. `AddAuthTokens` backfills `email_verified_at` for every existing account — an upgrade must not lock out the entire user base. `AddAuditLog`, `AddStockAlerts` and `AddIdempotencyKeys` backfill nothing on purpose: they record intent that only exists from the moment the feature shipped, and a fabricated audit trail is worse than one that honestly starts today.

`AddReturnStockMovementReason` appends to an enum rather than inserting into it, and its `down` relabels `RETURN` rows to `ADJUSTMENT` before narrowing the column so no row is left holding a value the type no longer has.

Every new entity is registered in `src/database/data-source.ts`. That list only matters to `migration:generate`, but it matters completely: an entity missing from it is invisible to the diff, and the generator will happily propose creating its table a second time.
