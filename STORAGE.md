# Supabase Storage cho anh VDV va giai dau

Anh duoc upload qua API NestJS co Bearer token admin. Backend kiem tra noi dung
anh bang sharp, tu dong xoay EXIF, resize (VDV toi da 800px, anh giai 1920px),
bo metadata va chuyen WebP truoc khi luu vao Storage. Database chi luu URL.
Khong can thay doi DATABASE_URL hoac chay migration cho tinh nang nay.

## Cau hinh Supabase

1. Dashboard > Storage > New bucket: ten `pickleball-images`, bat **Public**.
2. Bucket gioi han file 3 MB va MIME `image/webp` (backend luon xuat WebP).
3. Khong tao policy INSERT/UPDATE/DELETE cho anon. Khach chi duoc xem anh;
   upload chi qua backend dung key server.
4. Project Settings > API Keys: lay secret key server `sb_secret_...`.
   Van ho tro `service_role` cu. Khong dung anon/publishable key hay mat khau
   database. Lay Project URL tu Dashboard > Connect/Data API.

## Cau hinh backend local va Vercel

Trong backend-nestjs/.env (local) va Vercel > Settings > Environment Variables:

```dotenv
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_YOUR-SERVER-KEY
SUPABASE_STORAGE_BUCKET=pickleball-images
```

Redeploy Vercel sau khi dat/cap nhat Environment Variables. Khong dat key vao
NEXT_PUBLIC_*, Next.js, GitHub, file upload cPanel hoac gui trong tin nhan.
DATABASE_URL chi phuc vu PostgreSQL, khong the dung thay key Storage.
Neu dang dung legacy service_role JWT, dat SUPABASE_SERVICE_ROLE_KEY thay cho
SUPABASE_SECRET_KEY. Neu ca hai co gia tri, SUPABASE_SECRET_KEY duoc uu tien.

Neu dung ten bucket khac, dat cung ten trong SUPABASE_STORAGE_BUCKET. Bucket
phai public de URL hien thi duoc tren website ma khong can Supabase Auth.
Public bucket chi cong khai anh, **khong** cho phep upload vo danh neu khong
co write policy. Anh nhay cam khong nen dua vao bucket nay.

## Su dung

- Admin > Ho so VDV: Chon anh khi tao profile; trang sua co Thay anh/Go anh.
- Admin > Giai dau > Thong tin & dieu le: Chon anh bia giai.
- Anh upload xong co xem truoc; bam Tao ho so/Luu thay doi de luu URL vao DB.
- JPG, PNG, WebP tinh, toi da 3 MB, toi da 24 megapixel. Khong nhan SVG, GIF,
  anh dong hoac file gia anh. 3 MB de request multipart nam duoi gioi han
  payload 4.5 MB cua Vercel Functions.
- Moi lan upload co UUID moi de khong bi CDN giu anh cu. Folder `players/`
  va `tournaments/` nam trong bucket chung.
- Go anh chi go URL khoi form/ho so; khong xoa object Storage de tranh anh
  dang duoc noi khac su dung. Anh upload nhung chua luu ho so, upload bi huy
  hoac anh cu duoc thay co the thanh object khong con tham chieu; don thu cong
  trong Dashboard sau khi doi chieu URL, khong tu dong xoa file.

## API

POST `/api/uploads/images`, `Authorization: Bearer <admin-token>`.
Multipart fields: `file` va `purpose` (`players` hoac `tournaments`).
Khong dat Content-Type JSON; trinh duyet tu sinh multipart boundary.

Response: `{ url, path, bucket, content_type: 'image/webp', size }`.
URL nay luu vao `avatar_url` hoac `cover_url` qua API CRUD hien huu.
401 neu chua dang nhap, 422 neu file/danh muc khong hop le, 413 neu qua 3 MB,
503 neu thieu cau hinh, bucket private/thieu bucket hoac Storage loi.

Nguon chinh thuc:
- [Supabase buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets)
- [Supabase uploads va CDN](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [NestJS file uploads](https://docs.nestjs.com/techniques/file-upload)
- [Sharp safety limits](https://sharp.pixelplumbing.com/api-constructor/)
- [Vercel payload limits](https://vercel.com/docs/functions/limitations)
