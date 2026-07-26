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

## 3. Start the client

In a second terminal:

```bash
cd client
npm install
copy .env.example .env
npm run dev
```

Open the URL reported by Vite (normally `http://localhost:5173`). The root path redirects to the product catalogue at `/products`; the server health check moved to `/health` and is linked from the footer. Login and registration are at `/login` and `/register`; `/dashboard` is a protected route. Set `VITE_API_BASE_URL` in `client/.env` if the API uses another host or port.

## API surface

All routes are served under the `/api` prefix and documented in Swagger at `/api/docs`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | public | Create a CUSTOMER account |
| `POST` | `/api/auth/login` | public | Access token (15 min) + refresh token (7 days) |
| `POST` | `/api/auth/refresh` | public | Exchange a refresh token for a new access token |
| `GET` | `/api/auth/me` | JWT | Current user |
| `GET` | `/api/categories`, `/api/categories/:id` | public | Read categories |
| `POST`/`PATCH`/`DELETE` | `/api/categories`, `/api/categories/:id` | ADMIN | Category CRUD |
| `GET` | `/api/products` | public | `search`, `categoryId`, `minPrice`, `maxPrice`, `sort`, `page`, `limit` |
| `GET` | `/api/products/:id` | public | Product with `averageRating` and `reviewCount` |
| `POST`/`PATCH`/`DELETE` | `/api/products`, `/api/products/:id` | ADMIN | Product CRUD |
| `GET` | `/api/products/:id/reviews` | public | Paginated reviews plus a rating summary |
| `POST` | `/api/products/:id/reviews` | JWT | One review per customer per product |
| `PATCH`/`DELETE` | `/api/reviews/:id` | JWT | Author edits; author or ADMIN deletes |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/cart`, `/api/cart/items[/:itemId]` | JWT | Cart management |
| `POST` | `/api/orders/checkout` | JWT | Requires shipping details, returns the new order |
| `GET` | `/api/orders` | JWT | Own orders, paginated, `status` filter |
| `GET` | `/api/orders/:id` | JWT | Owner or ADMIN |
| `PATCH` | `/api/orders/:id/cancel` | JWT | Owner, PENDING orders only |
| `GET` | `/api/orders/admin/all` | ADMIN | All orders, paginated, `status` and `search` filters |
| `PATCH` | `/api/orders/:id/status` | ADMIN | Lifecycle transition |
| `GET` | `/api/admin/stats` | ADMIN | Revenue, status counts, best sellers, low stock |

### Product listing

`sort` accepts `newest` (default), `price_asc`, `price_desc`, and `rating_desc`; products without reviews sort last under `rating_desc`. `limit` defaults to 12 and caps at 100.

### Checkout

`POST /api/orders/checkout` takes the shipping details and copies them onto the order, so later edits to the account never rewrite delivery history:

```json
{
  "recipientName": "Nguyen Van A",
  "phone": "0901234567",
  "addressLine": "12 Nguyen Hue",
  "ward": "Phuong Ben Nghe",
  "district": "Quan 1",
  "city": "Ho Chi Minh",
  "note": "Giao trong gio hanh chinh."
}
```

`ward`, `district`, and `note` are optional; `phone` must match `0xxxxxxxxx` or `+84xxxxxxxxx`. Each order also receives a unique human-readable `orderNumber` in the form `ORD-YYMMDD-XXXXX`.

### Reviews

A review requires a **COMPLETED** order containing that product, and each customer may review a product once. Responses expose only the reviewer's display name, never their email. Ratings are whole numbers from 1 to 5; `GET /api/products/:id/reviews` returns a `summary` with the average, the total, and the per-star distribution.

### Order lifecycle

`PENDING → PAID → SHIPPED → COMPLETED`, with `PENDING` and `PAID` also able to move to `CANCELLED`. `COMPLETED` and `CANCELLED` are terminal. Cancelling an order restores the reserved stock.

## Checks

```bash
cd server && npm run build && npm run lint
cd client && npm run build && npm run lint
```

## Deployment

[![CI](https://github.com/<OWNER>/<REPOSITORY>/actions/workflows/ci.yml/badge.svg)](https://github.com/<OWNER>/<REPOSITORY>/actions/workflows/ci.yml)

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

`AddOrderShippingDetails` backfills existing rows before switching the new columns to `NOT NULL`: order numbers become `ORD-LEGACY-…`, the recipient name is copied from the ordering user, and the remaining address fields are set to `unknown`.
