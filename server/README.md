# mini-ecommerce-ts

NestJS/TypeScript API for a mini e-commerce app. It includes MySQL/TypeORM, Swagger, health checks, and JWT authentication with CUSTOMER/ADMIN roles. Product, Category, Cart, and Order modules are deliberately deferred.

## Structure

```text
src/
  database/                 TypeORM CLI data source and migrations
  health/                   GET /api/health
  users/entities/           User entity and roles
  auth/                     Registration, login, refresh, JWT and guards
  app.module.ts             Application and TypeORM module setup
  main.ts                   API prefix, validation, Swagger bootstrap
```

## Prerequisites

- Node.js 20+ and npm
- A running MySQL 8+ server
- A database created for this app, for example: `CREATE DATABASE mini_ecommerce;`

## Install and configure

```bash
npm install
copy .env.example .env
```

On macOS/Linux, use `cp .env.example .env`. Edit `.env` with your local MySQL values:

```dotenv
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=change-me
DB_NAME=mini_ecommerce
JWT_ACCESS_SECRET=replace-with-a-long-access-secret
JWT_REFRESH_SECRET=replace-with-a-long-refresh-secret
```

## Database migrations

Run the checked-in initial migration after configuring `.env`:

```bash
npm run migration:run
```

Useful related commands:

```bash
npm run migration:show
npm run migration:revert
npm run migration:generate -- src/database/migrations/AddSomething
```

## Start locally

```bash
npm run start:dev
```

The API health check is available at `http://localhost:3000/api/health` and returns:

```json
{ "status": "ok" }
```

Swagger UI is available at `http://localhost:3000/api/docs`.

## Authentication

- `POST /api/auth/register` creates a CUSTOMER account.
- `POST /api/auth/login` returns access and refresh tokens.
- `POST /api/auth/refresh` exchanges a refresh token for an access token.
- `GET /api/auth/me` requires an access token.

Create an admin account with explicit credentials:

```powershell
$env:ADMIN_EMAIL='owner@example.com'
$env:ADMIN_PASSWORD='<strong-password-at-least-12-characters>'
npm run seed:admin
```

The seed creates nothing when these variables are absent. There is no default
admin email or password.

## Quality commands

```bash
npm run lint
npm run format
npm run build
```
