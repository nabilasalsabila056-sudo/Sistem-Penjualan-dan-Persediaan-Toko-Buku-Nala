# Sistem Penjualan dan Persediaan Toko Buku Nala

Aplikasi web untuk membantu Toko Buku Nala mengelola katalog, pelanggan, penjualan, dan penerimaan stok dari supplier. Sistem menampilkan ringkasan aktivitas toko dan dapat mencetak struk thermal berukuran 58 mm atau 80 mm.

## Daftar Isi

- [Fitur](#fitur)
- [Teknologi dan Arsitektur](#teknologi-dan-arsitektur)
- [Struktur Proyek](#struktur-proyek)
- [Model Data](#model-data)
- [Persiapan](#persiapan)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Alur Bisnis](#alur-bisnis)
- [API Backend](#api-backend)
- [Keamanan](#keamanan)
- [Pemecahan Masalah](#pemecahan-masalah)

## Fitur

### Dashboard

- Ringkasan omzet dan jumlah transaksi hari ini.
- Jumlah buku di katalog, total persediaan, serta buku yang perlu di-restok.
- Buku dengan penjualan tercepat dan buku yang tidak terjual dalam 180 hari.
- Daftar stok rendah dan transaksi terbaru.

### Katalog Buku

- Menambah dan memperbarui data buku.
- Menyimpan judul, penulis, penerbit, kategori, harga, stok, batas minimum, dan lokasi gudang.
- Mencari buku berdasarkan judul atau penulis, serta memfilter berdasarkan kategori.

### Pelanggan

- Menambah dan memperbarui nama serta nomor telepon pelanggan.
- Memilih pelanggan saat membuat transaksi.

### Penjualan

- Menambahkan beberapa judul dan jumlah buku ke dalam satu transaksi.
- Memilih metode pembayaran Tunai, Debit, atau QRIS.
- Menghitung jumlah uang diterima dan kembalian untuk pembayaran tunai.
- Memvalidasi stok sebelum transaksi disimpan.
- Menyimpan transaksi dan mengurangi stok secara atomik melalui fungsi PostgreSQL.
- Mencetak struk dari dialog transaksi berhasil atau dari riwayat penjualan, dalam format 58 mm dan 80 mm.

### Penerimaan Supplier

- Mencatat supplier, kontak, lokasi gudang, catatan, jumlah buku, dan harga modal.
- Menambah stok buku serta menghitung total modal saat penerimaan disimpan.

## Teknologi dan Arsitektur

- **Frontend:** HTML, CSS, dan JavaScript tanpa framework.
- **Database:** PostgreSQL melalui Supabase REST API dan RPC.
- **Backend opsional:** server HTTP Node.js berbasis modul bawaan (`node:http` dan `fetch`); tidak memerlukan paket npm.

> **Jalur data saat ini:** frontend mengirim permintaan langsung ke Supabase menggunakan konfigurasi di `frontend/supabase-config.js`. `backend/app.js` menyediakan server statis dan endpoint `/api`, tetapi bukan proxy yang digunakan oleh frontend saat ini.

```text
Browser (frontend) ── Supabase REST/RPC ── PostgreSQL
        │
        └── backend/app.js (opsional: server statis dan endpoint /api)
```

## Struktur Proyek

```text
.
├── backend/
│   ├── app.js                 # Server statis dan API HTTP
│   └── config.js              # Konfigurasi Supabase dari environment
├── database/
│   └── schema.sql             # Skema, migrasi, fungsi, dan kebijakan akses
├── frontend/
│   ├── index.html             # Struktur halaman aplikasi
│   ├── script.js              # Interaksi UI dan integrasi Supabase
│   ├── style.css              # Gaya aplikasi dan struk cetak
│   ├── story-characters.svg   # Ilustrasi animasi dashboard
│   └── supabase-config.js     # URL dan publishable key untuk frontend
└── README.md
```

## Model Data

Skema menggunakan empat tabel utama. Detail item penjualan dan penerimaan supplier disimpan sebagai snapshot JSONB agar riwayat tetap memuat judul, jumlah, dan harga saat transaksi terjadi.

| Tabel | Kegunaan |
| --- | --- |
| `books` | Katalog dan jumlah persediaan buku. |
| `customers` | Data pelanggan, termasuk nama dan telepon. |
| `sales` | Nomor nota, pelanggan, metode pembayaran, total, uang diterima, waktu, dan item JSONB. |
| `supplier_orders` | Penerimaan supplier, lokasi, total modal, status, dan item JSONB. |

### Fungsi Database

- `record_sale(...)` memeriksa item dan stok, mengunci data buku selama transaksi, mengurangi stok, membuat nomor nota, serta menyimpan item dan pembayaran dalam satu transaksi database.
- `record_supplier_order(...)` memeriksa item, menambah stok, memperbarui lokasi gudang, dan menyimpan total modal secara atomik.

## Persiapan

1. Siapkan proyek Supabase dan catat URL proyek serta publishable key.
2. **Cadangkan database sebelum migrasi.** Jalankan `database/schema.sql` melalui SQL Editor Supabase. Skrip memigrasikan detail dari tabel legacy `sale_items` dan `supplier_order_items` ke JSONB, kemudian menghapus tabel legacy tersebut beserta tabel `suppliers` dan `warehouses` setelah data relasinya dipindahkan ke atribut yang dipertahankan.
3. Atur `frontend/supabase-config.js` dengan URL dan publishable key proyek Supabase yang sama:

   ```js
   window.NALA_SUPABASE_CONFIG = {
       url: "https://<project-ref>.supabase.co",
       publishableKey: "<publishable-key>"
   };
   ```

4. Pastikan nilai `SUPABASE_URL` backend menunjuk ke proyek Supabase yang sama dengan konfigurasi frontend.

> Jangan menaruh `service_role` key di frontend atau repository. Key tersebut memiliki hak akses tinggi dan hanya boleh disimpan sebagai environment variable backend.

## Menjalankan Aplikasi

Gunakan Node.js 18 atau yang lebih baru. Tidak ada langkah `npm install` karena backend hanya memakai modul bawaan Node.js.

Di PowerShell, dari direktori root proyek:

```powershell
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-secret>"
$env:PORT = "3000"
node backend/app.js
```

Buka [http://localhost:3000](http://localhost:3000). Port default adalah `3000`; ubah `PORT` jika port tersebut sudah digunakan.

Server dapat menyajikan halaman tanpa service-role key, tetapi endpoint backend yang mengakses database akan mengembalikan `503` sampai `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` tersedia. Frontend tetap menggunakan konfigurasi Supabase-nya sendiri.

## Alur Bisnis

### Penjualan

1. Kasir memilih pelanggan (opsional), buku, jumlah, dan metode pembayaran.
2. Frontend memvalidasi jumlah terhadap stok yang terlihat dan menghitung total serta kembalian.
3. RPC `record_sale` memvalidasi ulang stok di database, mengurangi stok, dan menyimpan snapshot item serta nominal pembayaran.
4. Transaksi muncul di riwayat. Struk dapat dicetak dari dialog sukses atau tombol pada baris riwayat.

### Penerimaan Supplier

1. Petugas mengisi data supplier, lokasi gudang, serta daftar buku dan harga modal.
2. RPC `record_supplier_order` mengunci baris buku terkait, menambah stok, dan mencatat penerimaan.
3. Persediaan dan riwayat penerimaan diperbarui setelah transaksi database berhasil.

## API Backend

`backend/app.js` menyediakan endpoint berikut ketika server Node.js berjalan:

| Metode | Endpoint | Kegunaan |
| --- | --- | --- |
| `GET` | `/api/health` | Status server dan konfigurasi Supabase. |
| `GET` | `/api/categories` | Daftar kategori dari katalog buku. |
| `GET` | `/api/books` | Daftar buku. |
| `POST` | `/api/books` | Menambah buku. |
| `PATCH` | `/api/books/:id` | Memperbarui buku. |
| `GET` | `/api/sales` | Mengambil riwayat penjualan. |
| `POST` | `/api/sales` | Menyimpan penjualan melalui RPC. |

Frontend saat ini tidak memakai endpoint tersebut untuk mengambil atau mengubah data. Endpoint API ini ditujukan untuk integrasi atau klien lain.

## Keamanan

- Frontend memakai publishable key; akses database tetap harus dibatasi dengan Row Level Security (RLS) yang sesuai.
- Schema saat ini membuat kebijakan akses untuk role `anon` dan `authenticated` pada beberapa operasi. Tinjau dan persempit kebijakan tersebut sebelum aplikasi digunakan secara publik.
- Batasi akses jaringan dan jangan mengekspos service-role key melalui browser, file frontend, log, atau Git.
- Validasi stok dilakukan kembali dalam transaksi PostgreSQL; jangan mengandalkan validasi frontend saja.

## Pemecahan Masalah

| Gejala | Yang perlu diperiksa |
| --- | --- |
| Label koneksi menunjukkan database terputus | Pastikan URL dan publishable key di `frontend/supabase-config.js` benar dan berasal dari proyek yang sama. Periksa juga kebijakan RLS. |
| Backend mengembalikan `503` | Atur `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` di environment sebelum menjalankan server. |
| Fungsi `record_sale` tidak ditemukan | Jalankan versi terbaru `database/schema.sql`; fungsi transaksi saat ini menerima enam argumen bernama `p_customer_id`, `p_customer_name`, `p_customer_phone`, `p_payment_method`, `p_amount_received`, dan `p_items`. |
| Penjualan gagal karena stok | Periksa stok buku; stok dapat berubah setelah halaman dimuat. RPC menolak transaksi yang melebihi stok aktual. |
| Warna struk tidak tercetak | Aktifkan pencetakan background/color pada dialog cetak browser. Hasil warna juga bergantung pada kemampuan printer; printer thermal monokrom akan mencetaknya dalam grayscale. |

> Catatan kompatibilitas: endpoint backend `GET /api/sales` masih meminta relasi legacy `sale_items`, sedangkan skema saat ini menyimpan detail sebagai JSONB di `sales.items`. Frontend tidak menggunakan endpoint tersebut; sesuaikan query backend sebelum mengandalkannya setelah migrasi.