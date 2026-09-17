# Quy trinh van hanh giai pickleball

## Pham vi va nguon tham khao

Ho tro dau don, doi nam, doi nu, doi nam nu va mo rong. Moi giai tuong ung mot
noi dung thi dau: vong bang round-robin mot luot, sau do single elimination.
Chua trien khai double elimination, Swiss, giai dong doi, thanh toan online,
dong bo DUPR hay nhieu noi dung trong cung mot giai.

Nguon chinh thuc da doi chieu ngay 2026-09-17:

- [USA Pickleball official rules](https://usapickleball.org/rules/).
- [Golden Ticket Glendale](https://usapickleball.org/tournaments/usap-golden-ticket-glendale/):
  dang ky tung VDV tach biet viec hoan thanh cap; round-robin roi playoff;
  vi du game 15 diem va tran huy chuong best-of-three 11 diem, cach biet 2.
- [brackets-manager](https://github.com/Drarig29/brackets-manager.js/): engine
  round-robin, single elimination, BYE, ket qua va truyen suat sang vong sau.

Khong mac dinh moi giai deu dung cung mot the thuc. Quy tac xep hang va diem
trinh ben duoi la dieu le noi bo cua Ocean Gym, khong khang dinh day la toan bo
dieu le cua giai duoc USA Pickleball sanction hoac diem DUPR chinh thuc.

## Cac buoc trong admin

1. Tao giai tai `/admin/tournaments/`; mo trang chi tiet cua giai.
2. Thong tin & dieu le: chon don/doi, suc chua, ngay gio, san, gioi tinh,
   khoang diem trinh, tong diem cap; chon 11/15/21 diem va best-of 1/3/5 game.
3. VDV tham gia: chon ho so, dang ky, xac nhan/rut dang ky. Co xac nhan hang
   loat; tat ca phai du dieu kien. Chot danh sach truoc khi tao suat.
4. Suat thi dau: don tao mot VDV/suat; doi ghep thu cong hoac can bang diem.
   Doi nam nu bat buoc mot nam va mot nu. Chi VDV da xac nhan moi duoc chon.
   Cho phep sua thanh vien, ten, hat giong va xoa suat truoc khi chia bang.
5. Bang dau: chia ngau nhien hoac serpentine theo hat giong. Co chuyen bang
   thu cong truoc khi tao lich. Moi bang can it nhat hai suat de xep lich.
6. Lich & ty so: xep toan bo bang cung luc, cau hinh san, phut/tran va nghi
   toi thieu. Dieu chinh gio/san co kiem tra trung; loc va xuat CSV.
7. Nhap ty so tung game. Moi game phai dat diem dich, cach biet 2 va ket thuc
   ngay khi du dieu kien thang. Tran best-of tinh theo so game thang, khong
   dua vao tong diem rally. Ho tro vang mat/bo cuoc voi ben thang va ly do;
   cac ket qua nay tinh mot tran thang, khong cong hieu so rally.
8. Xep hang bang: so tran thang, so tran thang doi dau trong nhom cung so
   tran thang, hieu so rally, tong diem rally. Thang = 3 diem bang xep hang.
   Neu van hoa o ranh gioi di tiep, can luu thu tu xu ly dong hang va bien ban.
   Quyet dinh thu cong chi pha hoa, khong ghi de cac tieu chi thanh tich.
9. Nhanh & ket qua: chon so suat di tiep/bang va tranh hang ba tuy chon.
   Hai bang, hai suat/bang: A1-B2 va B1-A2. Nhieu bang: hat giong theo vi tri
   trong bang, bracket inner-outer; BYE cho kich thuoc khong la luy thua cua 2.
   Khong cam ket tranh tai dau cung bang voi moi kich thuoc/so suat.
   Thang/thua tu dong sang vong sau; ho tro tu ket, ban ket, chung ket va BYE.
10. Chot giai sau khi tat ca tran knockout xong. Tuy chon cap nhat diem trinh
    noi bo: vo dich +0.05, a quan +0.03, hang ba +0.02, loai vong bang -0.02,
    loai knockout khac 0. Khong tranh hang ba: hai doi thua ban ket +0.02.
    Diem gioi han 1-6, co lich su danh gia va co chot chi ap dung mot lan.

Moi tab la trang static rieng, giu `?tournament_id=UUID` tren URL. Reload van
mo dung giai va buoc. Public hien du lieu tu API va khong can dang nhap.

## Khoa an toan

- Tao lai suat/bang/lich phai xac nhan `replace:true` va chi khi chua co ket qua.
- Khong tu xoa ket qua de doi danh sach hay tao lai nhanh.
- Sau khi tao nhanh, khoa ket qua bang. Co the go nhanh **chua thi dau** bang
  DELETE playoff, sua ty so bang, sau do tao nhanh lai; giu ket qua bang.
- Sua ket qua can ly do; khoa neu ket qua vong sau phu thuoc da duoc nhap.
- Chot giai khoa ket qua, thong tin giai va diem thuong. Goi lai finalize khong
  cong diem lan nua. Diem trinh/gioi tinh VDV khong duoc doi giua giai da chot
  danh sach va chua ket thuc. Khong xoa VDV co lich su tham gia giai.
- Transaction khoa dong tournament de tranh tao lai/nhap ket qua dong thoi.
- Lich chi kiem tra trong mot giai, chua giai quyet chia san/VDV giua nhieu
  giai doc lap. Admin phai dieu phoi chung neu cac giai dung cung san.

## Migration production

Chay tu local voi DATABASE_URL dung database production, **truoc deploy code**:

```bash
npm ci
npm run build
npm run db:migrate
```

Migration `1789616000000` them registrations va JSON metadata cua tran; khong
reset, khong xoa/sua ty so. Backfill chi VDV nam trong teams cu, chot roster cu
neu chua co co roster_locked. Theo doi lich su trong `nestjs_migrations`.
Khong bat synchronize tren production. Khong rollback migration nay sau khi
da nhap du lieu moi vi down se xoa registrations/metadata.

## API moi (deu yeu cau Bearer token)

| Method | Path sau /api | Tac dung |
| --- | --- | --- |
| GET | /tournaments/:id/workspace | Du lieu day du cho van hanh |
| POST | /tournaments/:id/registrations | Dang ky/xac nhan hang loat |
| PATCH | /tournaments/:id/registrations/:playerId | Trang thai, ghi chu |
| POST | /tournaments/:id/roster-lock | Chot/mo roster |
| PATCH | /tournaments/:id/competition-settings | Cau hinh dieu le |
| POST | /tournaments/:id/entries/generate | Tao suat don/ghep doi |
| POST | /tournaments/:id/draw | Chia bang |
| POST | /tournaments/:id/group-assignment | Chuyen suat sang bang |
| POST | /tournaments/:id/tie-break | Luu quyet dinh dong hang |
| POST | /tournaments/:id/schedule | Xep lich toan giai |
| POST | /tournaments/:id/playoff | Tao knockout |
| DELETE | /tournaments/:id/playoff | Go knockout chua thi dau |
| POST | /matches/:id/score | Games, walkover, retirement, correction |
| POST | /tournaments/:id/finalize | Chot giai, diem trinh tuy chon |

API CRUD cu van hoat dong, nhung cung tuan theo cac khoa nghiep vu moi.

## Kiem thu

`npm test -- --runInBand`, `npm run test:e2e -- --runInBand` dung du lieu trong
bo nho, khong ghi Supabase. `smoke:api` ghi lich su that: chi dung disposable
database voi `ALLOW_SMOKE_MUTATIONS=1`; ket qua hoan tat khong duoc tu xoa.
