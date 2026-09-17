# Pickleball API - NestJS

Backend NestJS thay thế REST API Laravel, dùng TypeORM với PostgreSQL/Supabase và cung cấp dữ liệu cho toàn bộ giao diện Next.js.

## Cấu hình

```bash
cp .env.example .env
npm install
```

NestJS chỉ đọc `backend-nestjs/.env` và biến môi trường hệ thống. Kết nối PostgreSQL chỉ dùng `DATABASE_URL`; không đọc `backend/.env` hoặc ghép URL từ `DB_*`. `.env.example` là file mẫu, không được ứng dụng tự nạp.

Các biến production bắt buộc:

```dotenv
DATABASE_URL=postgresql://user:password@host:5432/database
ADMIN_USERNAME=admin
ADMIN_PASSWORD=use-a-strong-password
CORS_ORIGINS=https://example.com
PORT=8001
```

TypeORM ánh xạ trực tiếp các bảng hiện hữu qua `src/database/entities.ts`. `synchronize`, `migrationsRun` và việc tự cài extension đều bị tắt; không cần generate client hoặc migrate lại database đã có.

### Supabase: DNS và SSL

Nếu host direct `db.{project-ref}.supabase.co` báo `ENOTFOUND`, kiểm tra kết nối IPv6. Trên mạng chỉ có IPv4, lấy URL **Session pooler** từ Supabase Dashboard > Connect, dùng port `5432` và username `postgres.{project-ref}`. Host pooler phải được sao chép từ Dashboard, không suy ra từ region.

Ứng dụng vẫn chỉ dùng `DATABASE_URL`:

```dotenv
DATABASE_URL=postgresql://postgres.your-project-ref:YOUR-ENCODED-PASSWORD@your-pooler-host.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt
```

`certs/supabase-ca.crt` chứa CA công khai Supabase Root 2021, tải qua HTTPS từ `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. Upload cả thư mục `certs` khi deploy và chạy Node với working directory `backend-nestjs`, hoặc dùng đường dẫn tuyệt đối trong tham số `sslrootcert`. Cấu hình giữ xác minh CA và hostname, không dùng `rejectUnauthorized: false`.

Nếu nhận mã PostgreSQL `28P01`, endpoint đã truy cập được nhưng tài khoản/mật khẩu bị từ chối. Cập nhật database password đúng vào URL, percent-encode các ký tự đặc biệt, rồi restart NestJS. Không dùng anon key hoặc service-role key làm database password.

Tham khảo [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres) và [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Chạy local

Chạy NestJS API ở cổng `8001`:

```bash
npm run start:dev
```

API base URL là `http://127.0.0.1:8001/api`. Cấu hình frontend khách hàng và admin:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001/api
STATIC_BUILD_API_URL=http://127.0.0.1:8001/api
```

## Deploy Vercel

Import repository GitHub vao Vercel, chon Root Directory `.` va Framework Preset
`NestJS`. Dung Node.js `22.x`, khong dat Output Directory va khong them rewrite
`/api` thu cong. Vercel nhan dien entrypoint `src/main.ts`.

Them Environment Variables cho Production (Preview neu can):

- `DATABASE_URL`: URL Session pooler tu Supabase Dashboard, port `5432`.
  Giu `sslmode=verify-full&sslrootcert=certs/supabase-ca.crt` trong URL.
- `ADMIN_USERNAME`: tai khoan quan tri.
- `ADMIN_PASSWORD`: mat khau manh, khong dung gia tri mau.
- `CORS_ORIGINS`: `https://oceangym.com.vn` (origin khong bao gom `/pickleball`).

Khong upload `.env` len GitHub. Vercel cung cap `PORT` va `NODE_ENV`; khong can
dat thu cong. Database hien huu phai co cac bang nghiep vu va `admin_sessions`.
Ung dung khong tu tao bang hay seed khi deploy.

`vercel.json` chon region Singapore `sin1` gan Supabase hien tai va dong goi CA
cong khai vao function. Pool TypeORM gioi han 2 ket noi moi instance tren Vercel.

Sau khi deploy, kiem tra `https://YOUR-PROJECT.vercel.app/api/public/home`.
Neu frontend goi API bi chan dang nhap Vercel, tat Deployment Protection cho
production public API theo chinh sach tai khoan cua ban.

Build lai Next static voi
`NEXT_PUBLIC_API_BASE_URL=https://YOUR-PROJECT.vercel.app/api` va upload ban build
moi len cPanel. Chi push backend khong tu thay doi URL API trong frontend da build.

Tham khao [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs).

## Endpoint

- Public: `/api/public/home`, `/api/public/players`, `/api/public/schedule`, `/api/public/tournaments/:slug`
- Auth: `/api/admin/login`, `/api/admin/status`, `/api/admin/logout`
- Vận động viên: `/api/players`, `/api/players/:id`
- Chấm trình: `/api/ratings/rules`, `/api/ratings/calculate`, `/api/players/:id/ratings`
- Giải đấu: `/api/tournaments`, `/api/tournaments/:id`
- Đội: `/api/tournaments/:id/teams`, `/api/teams/:id`, endpoint `teams/generate`
- Bảng: `/api/tournaments/:id/groups`, `/api/groups/:id`, endpoint `groups/randomize`
- Trận đấu: `/api/matches`, `/api/matches/:id`, endpoint `result` và `generate-round-robin`
- Nhánh đấu: `/api/tournaments/:id/brackets`, endpoint `brackets/generate`

Ngoại trừ các API `/api/public/*` và `admin/login`, tất cả endpoint đều yêu cầu header:

```http
Authorization: Bearer <token>
```

## Kiểm tra

```bash
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run smoke:api
```

`smoke:api` cần server NestJS đang chạy. Lệnh tạo một giải tạm, đi hết luồng nghiệp vụ rồi tự xóa dữ liệu kiểm tra.

`test:e2e` dùng PostgreSQL emulator `pg-mem` trong bộ nhớ, không truy cập Supabase. Bộ kiểm thử bao gồm API public/admin, phiên đăng nhập, CRUD, bộ lọc, JSON nullable, điểm trình, avatar, ghép đội, vòng bảng và nhánh đấu. Emulator không thay thế việc kiểm tra transaction rollback và kết nối trên PostgreSQL thật.

Tích hợp sử dụng `TypeOrmModule`, repository và `DataSource.transaction` theo [tài liệu NestJS](https://docs.nestjs.com/techniques/database).
