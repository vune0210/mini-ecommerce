# Mini E-commerce

Ứng dụng thương mại điện tử gồm hai phần:

```text
client/  React 18, Vite, TypeScript, Tailwind CSS
server/  NestJS, TypeORM, MySQL/TiDB, Swagger
```

## Yêu cầu

- Node.js 20+ và npm
- MySQL 8+ (hoặc TiDB Cloud tương thích MySQL)
- Docker Desktop nếu chạy toàn bộ hệ thống bằng Docker

## Chạy local

### 1. Database

Tạo secrets Docker và khởi động MySQL:

```powershell
cd server
npm run secrets:generate-local
cd ..
docker compose -f docker-compose.dev.yml up -d
```

Tạo file môi trường cho backend:

```powershell
Copy-Item server\.env.example server\.env
```

### 2. Backend

```powershell
cd server
npm install
npm run migration:run
npm run seed:catalog
npm run start:dev
```

- API: `http://localhost:3000/api`
- Health: `http://localhost:3000/api/health`
- Swagger: `http://localhost:3000/api/docs`

Tạo tài khoản admin (không có tài khoản mặc định):

```powershell
$env:ADMIN_EMAIL='owner@example.com'
$env:ADMIN_PASSWORD='<strong-password-at-least-12-characters>'
npm run seed:admin
```

### 3. Frontend

Mở terminal khác:

```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

Mở URL do Vite hiển thị (thường là `http://localhost:5173`). Nếu API không chạy tại cổng 3000, đặt `VITE_API_BASE_URL` trong `client/.env`.

## Docker

Chạy đầy đủ MySQL, API và frontend:

```bash
docker compose up --build
```

Mở `http://localhost:8082`.

## Biến môi trường quan trọng

Backend (`server/.env`):

```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=mini_ecommerce
DB_PASSWORD=your-database-password
DB_NAME=mini_ecommerce
DB_SSL=false
JWT_ACCESS_SECRET=long-random-secret
JWT_REFRESH_SECRET=another-long-random-secret
FRONTEND_URL=http://localhost:5173
```

Frontend (`client/.env`):

```env
VITE_API_BASE_URL=http://localhost:3000
```

Không commit file `.env` hoặc secrets thật.

## Deploy miễn phí

Repo có sẵn cấu hình:

- `render.yaml`: backend Docker trên Render
- `client/vercel.json`: frontend Vite trên Vercel

1. Tạo database TiDB Cloud và schema `mini_ecommerce`.
2. Trên Render, tạo **Blueprint** từ branch chứa `render.yaml` và nhập `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`.
3. Đặt `DB_PORT=4000` và `DB_SSL=true` cho TiDB Cloud.
4. Trên Vercel, import repo với **Root Directory** là `client`; thêm `VITE_API_BASE_URL=https://<render-service>.onrender.com/api`.
5. Cập nhật `FRONTEND_URL` và `CORS_ORIGINS` trên Render thành URL Vercel, sau đó deploy lại backend.

Render Free có thể sleep khi không có truy cập; request đầu tiên sau đó có thể chậm.

## Kiểm tra và lệnh hữu ích

```bash
cd server && npm run build && npm run test
cd client && npm run build && npm run lint
```

```bash
cd server
npm run migration:show
npm run migration:run
npm run seed:catalog
```

## Chức năng chính

- Đăng ký, đăng nhập, JWT và refresh-token rotation
- Sản phẩm, danh mục, tags, tìm kiếm và tồn kho
- Giỏ hàng, địa chỉ, đơn hàng, mã giảm giá và phí giao hàng
- Đánh giá, hỏi đáp, yêu thích, thông báo và cảnh báo hết hàng
- Quản trị sản phẩm, đơn hàng, coupon, người dùng và thống kê
- Health checks và Swagger API documentation
