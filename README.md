# Foster Center

Ứng dụng quản lý trung tâm dạy thêm — lớp học, học sinh, giáo viên, học phí, báo cáo.
Dữ liệu lưu trên **Supabase** (Postgres, miễn phí), đồng bộ **real-time** giữa mọi thiết bị.

## 🚀 Deploy miễn phí lên Vercel (5 phút)

### Bước 1 — Đẩy code lên GitHub

```bash
cd foster-app
git init
git add .
git commit -m "Foster Center - initial commit"
```

Vào [github.com/new](https://github.com/new) → tạo repo mới (ví dụ `foster-center`) → **không** tick "Add README" → sau đó chạy:

```bash
git remote add origin https://github.com/<username>/foster-center.git
git branch -M main
git push -u origin main
```

### Bước 2 — Deploy trên Vercel

1. Vào [vercel.com](https://vercel.com) → đăng nhập bằng GitHub
2. **Add New → Project** → chọn repo `foster-center`
3. Vercel tự nhận diện đây là dự án Vite — không cần chỉnh gì thêm
4. Nhấn **Deploy**

Sau ~1 phút, bạn sẽ có link dạng `https://foster-center-xxxx.vercel.app` — dùng được trên điện thoại, máy tính, mọi thiết bị, dữ liệu đồng bộ real-time qua Supabase.

> Mỗi lần bạn `git push` code mới, Vercel tự động build & deploy lại — không cần thao tác thủ công.

### (Tùy chọn) Đặt tên miền phụ dễ nhớ

Trong Vercel → Project Settings → Domains → đổi từ tên ngẫu nhiên thành ví dụ `foster-center.vercel.app` (miễn phí, không cần mua domain riêng).

---

## 🗄 Về phần dữ liệu (Supabase)

- Project Supabase đã được tạo sẵn và **đã có trong code** (`src/lib/supabase.js`) — không cần cấu hình gì thêm.
- Gói miễn phí Supabase: 500MB database, đủ dùng nhiều năm cho quy mô một trung tâm dạy thêm.
- File `supabase/migrations/001_init.sql` là bản sao cấu trúc database (đã áp dụng sẵn) — chỉ để tham khảo/backup, không cần chạy lại.
- Muốn xem/sửa dữ liệu trực tiếp: đăng nhập [supabase.com/dashboard](https://supabase.com/dashboard) → chọn project **Foster Center**.

## 💾 Backup dữ liệu

Trong app, ở cuối sidebar có 3 nút:
- **Xuất Excel toàn bộ** — tải file `.xlsx` gồm 5 sheet (Giáo viên, Lớp học, Học sinh, Đăng ký, Học phí)
- **Export / Import** — backup/khôi phục dạng JSON, dùng khi cần khôi phục toàn bộ dữ liệu

Nên xuất Excel hoặc JSON định kỳ (cuối tháng) và lưu vào Google Drive để an toàn.

## 🛠 Phát triển local (tùy chọn)

```bash
npm install
npm run dev
```

Mở `http://localhost:5173`.
