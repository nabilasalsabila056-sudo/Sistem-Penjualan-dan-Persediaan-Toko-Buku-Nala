# SISTEM PENJUALAN DAN PERSEDIAAN TOKO BUKU NALA

**NABILA SALSABILA**  
**NIM: 12030124140240**  

**Mata Kuliah/Kelas:** Pengkodean dan Pemrograman / D  
**Dosen Pengampu:** Dr. Totok Dewayanto, S.E., M.Si., Akt., CA  

**PROGRAM STUDI S1 AKUNTANSI**  
**FAKULTAS EKONOMIKA DAN BISNIS**  
**UNIVERSITAS DIPONEGORO**  

---

## Deskripsi Proyek

Toko Buku Nala adalah aplikasi web berbasis dashboard untuk mengelola operasional harian toko buku. Sistem ini memungkinkan pemantauan penjualan, pengelolaan katalog buku dan persediaan, pencatatan pelanggan, serta pemantauan transaksi keuangan melalui jurnal umum.

Aplikasi dibangun menggunakan HTML5, CSS3, dan JavaScript untuk sisi frontend, serta Supabase (PostgreSQL) sebagai backend penyimpanan data. Sistem berjalan sepenuhnya di sisi klien dan terhubung langsung ke database Supabase melalui API.

**Demo Langsung:**  
https://nabilasalsabila056-sudo.github.io/Sistem-Penjualan-dan-Persediaan-Toko-Buku-Nala/ 

---

## Fitur Utama

1. **Dashboard Ringkasan:** Menampilkan penjualan hari ini, jumlah transaksi, judul aktif, total persediaan, prioritas restock, dead stock, dan rak yang menipis.
2. **Manajemen Pelanggan:** Menambah, mengubah, dan menghapus pelanggan. Penghapusan tetap mempertahankan nama pelanggan sebagai snapshot pada riwayat penjualan.
3. **Katalog Buku:** Mengelola judul, penulis, penerbit, lokasi stok, kategori, harga, batas minimum, dan stok tersedia.
4. **Update Stok:** Menambah stok melalui Pembelian Persediaan atau mengurangi stok karena Buku Rusak atau Buku Hilang. Nilai perolehan buku rusak/hilang otomatis mengikuti harga jual buku.
5. **Riwayat Buku Rusak/Hilang:** Menampilkan daftar penyesuaian fisik beserta jumlah, tanggal, dan catatan yang diisi saat Update Stok.
6. **Penjualan (Kasir):** Mencatat pelanggan, buku, jumlah, metode pembayaran, jumlah uang diterima, kembalian, serta riwayat transaksi dan struk 58/80 mm.
7. **Jurnal Umum:** Mencatat Penjualan, Pembelian Persediaan, Buku Rusak, dan Buku Hilang dengan pasangan debit-kredit. Jurnal dikelompokkan per bulan.
8. **Revisi dan Penghapusan Jurnal:** Nominal jurnal dapat dikoreksi beserta alasan revisi. Penghapusan jurnal juga membalik efek operasional yang sesuai, seperti mengembalikan atau mengurangi stok dan menghapus transaksi penjualan terkait.
9. **Penghapusan Pelanggan:** Menghapus master pelanggan dengan konfirmasi tanpa menghapus riwayat struk lama.
10. **Integrasi Supabase Real-time:** Menampilkan status koneksi PostgreSQL Supabase secara langsung.

---

## Teknologi yang Digunakan

| Komponen   | Teknologi               |
|------------|-------------------------|
| Frontend   | HTML5, CSS3, JavaScript |
| Backend    | Node.js dan Supabase (PostgreSQL) |
| Deployment | Server Node.js / GitHub Pages |
| Ikon       | Unicode / SVG           |

---

## Struktur Repository

```
TOKO-BUKU-NALA/
│
├── backend/
│   ├── app.js
│   └── config.js
│
├── database/
│   └── schema.sql
│
├── frontend/
│   ├── index.html
│   ├── script.js
│   ├── story-characters.svg
│   ├── style.css
│   └── supabase-config.js
│
└── README.md
```

---

## Database

Sistem ini menggunakan Supabase (PostgreSQL) dengan tabel-tabel berikut:

### 1. Pelanggan
Menyimpan data pelanggan toko.

| Kolom     | Tipe    | Keterangan            |
|-----------|---------|-----------------------|
| id        | BIGSERIAL | Primary Key         |
| nama      | VARCHAR | Nama pelanggan        |
| telepon   | VARCHAR | Nomor telepon         |
| terdaftar | TIMESTAMPTZ | Waktu pendaftaran |

### 2. Buku (Katalog)
Menyimpan data buku yang dijual.

| Kolom     | Tipe      | Keterangan            |
|-----------|-----------|-----------------------|
| id        | BIGSERIAL | Primary Key           |
| judul     | VARCHAR   | Judul buku            |
| penerbit  | VARCHAR   | Nama penerbit         |
| lokasi    | VARCHAR   | Lokasi rak            |
| kategori  | VARCHAR   | Kategori buku         |
| harga     | NUMERIC   | Harga satuan          |
| stok      | INTEGER   | Jumlah stok tersedia  |

### 3. Penjualan
Menyimpan header transaksi penjualan.

| Kolom     | Tipe      | Keterangan            |
|-----------|-----------|-----------------------|
| id        | BIGSERIAL | Primary Key           |
| tanggal   | TIMESTAMPTZ | Waktu transaksi     |
| total     | NUMERIC   | Total pembayaran      |
| pelanggan_id | BIGINT | Foreign Key ke Pelanggan |

### 4. Detail Penjualan
Rincian item penjualan disimpan sebagai JSONB pada header `sales.items` agar transaksi tetap ringkas.

| Kolom        | Tipe      | Keterangan              |
|--------------|-----------|-------------------------|
| book_id      | UUID      | ID buku                 |
| title        | TEXT      | Snapshot judul buku     |
| quantity     | INTEGER   | Jumlah item             |
| unit_price   | NUMERIC   | Harga satuan saat jual  |

### 5. Jurnal Umum
Mencatat transaksi Penjualan, Pembelian Persediaan, Buku Rusak, dan Buku Hilang. Setiap entri memiliki nilai debit dan kredit yang sama; detail item persediaan disimpan dalam JSONB.

| Kolom          | Tipe        | Keterangan                                  |
|----------------|-------------|---------------------------------------------|
| journal_entry_id | BIGSERIAL | Primary Key                                 |
| entry_number   | VARCHAR     | Nomor jurnal unik                           |
| entry_type     | VARCHAR     | Jenis transaksi atau mutasi                 |
| description    | TEXT        | Keterangan jurnal                           |
| debit_account  | VARCHAR     | Akun yang didebit                           |
| credit_account | VARCHAR     | Akun yang dikredit                          |
| amount         | NUMERIC     | Nilai transaksi                             |
| items          | JSONB       | Rincian item jika terkait dengan persediaan|
| original_amount | NUMERIC    | Nominal sebelum revisi                      |
| revision_count | INTEGER     | Jumlah revisi nominal                       |
| revision_note  | TEXT        | Alasan revisi                               |
| revised_at     | TIMESTAMPTZ | Waktu revisi terakhir                       |
| entry_date     | TIMESTAMPTZ  | Tanggal transaksi                           |

Penjualan dijurnal sebagai debit kas/bank dan kredit pendapatan penjualan. Pembelian Persediaan dijurnal sebagai debit persediaan dan kredit kas/utang supplier. Buku rusak atau hilang dijurnal sebagai debit kerugian dan kredit persediaan. Jurnal dikelompokkan berdasarkan bulan, dapat difilter berdasarkan jenis aktivitas, direvisi nominalnya, dan dihapus dengan konfirmasi.

### 6. Riwayat Buku Rusak dan Hilang
Katalog menyimpan riwayat pemisahan buku akibat rusak atau hilang beserta jumlah, waktu, dan catatan. Riwayat ini dapat dipantau pada bagian **Buku rusak & hilang** di bawah tabel katalog.

### 7. Update Stok
Gunakan tombol **Update stok** di sebelah **Tambah buku** pada Katalog Buku.

- **Pembelian Persediaan:** menambah stok, mengisi nama supplier, lokasi gudang, dan akun kredit Kas atau Utang Supplier.
- **Buku Rusak:** mengurangi stok dan mengisi nilai perolehan otomatis dari harga jual buku.
- **Buku Hilang:** mengurangi stok dan mengisi nilai perolehan otomatis dari harga jual buku.

Setiap penyesuaian juga membuat jurnal berpasangan dan tidak dapat hanya mengubah angka stok secara langsung pada formulir buku.

### 9. Penghapusan Data
Pelanggan dapat dihapus dengan konfirmasi. Nama pelanggan lama disimpan pada transaksi penjualan agar struk dan riwayat tetap aman.

Entri jurnal dapat dihapus dengan konfirmasi. Dampaknya bergantung jenis entri:
- Penjualan: mengembalikan stok dan menghapus transaksi penjualan terkait.
- Pembelian Persediaan: mengurangi stok.
- Buku Rusak/Hilang: mengembalikan stok.
- Jurnal keuangan lain: tidak mengubah stok atau transaksi penjualan.

---

## Cara Menjalankan Aplikasi

### Prasyarat
- Git
- Node.js v18 atau versi terbaru
- Akun Supabase
- Browser modern (Chrome, Firefox, Edge, atau Safari)

### Langkah 1: Clone Repository
```bash
git clone https://github.com/nabilasalsabila056-sudo/Sistem-Penjualan-dan-Persediaan-Toko-Buku-Nala.git
cd Sistem-Penjualan-dan-Persediaan-Toko-Buku-Nala
```

### Langkah 2: Install Dependencies
```bash
npm install
```
Frontend saat ini menggunakan Supabase REST langsung dari browser dan tidak memerlukan package Supabase tambahan.

### Langkah 3: Konfigurasi Environment Variables
Salin file contoh `.env.example` ke `.env`:
```bash
cp .env.example .env
```
Isi environment frontend/backend dengan konfigurasi berikut:
```env
# Frontend
VITE_SUPABASE_URL=https://<project-anda>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-anda>

# Backend Node.js
SUPABASE_URL=https://<project-anda>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-anda>

```
Cara mendapatkan kredensial Supabase:
1. Login ke Supabase Dashboard.
2. Pilih project Anda.
3. Buka Settings lalu API.
4. Salin Project URL dan anon/public key untuk frontend.
5. Salin service-role key hanya untuk backend/server; jangan ditempelkan ke frontend.

### Langkah 4: Setup Database Supabase
Jalankan perintah SQL yang terdapat pada file `database/schema.sql` di dalam SQL Editor Supabase untuk membuat tabel yang diperlukan.

### Langkah 5: Menjalankan Backend dan Frontend
Backend:
```bash
node backend/app.js
```
Buka aplikasi melalui `http://localhost:3000`.

Jika frontend dijalankan terpisah:
```bash
python -m http.server 5173 -d frontend
```
Buka `http://localhost:5173`.

Pastikan `frontend/supabase-config.js` memiliki URL dan anon/publishable key yang sama dengan project yang dijalankan oleh backend.

---

## Deployment ke GitHub Pages

1. Buka repository di GitHub.
2. Klik tab **Settings**.
3. Pada sidebar kiri, pilih **Pages**.
4. Di bawah **Build and deployment**, pilih Source: `Deploy from a branch`.
5. Pilih Branch: `main` dan Folder: `/ (root)`.
6. Klik **Save**.
7. Tunggu proses deployment selesai (1-5 menit).
8. Website dapat diakses di:
   `https://nabilasalsabila056-sudo.github.io/Sistem-Penjualan-dan-Persediaan-Toko-Buku-Nala/`

Catatan: Pastikan file `index.html` berada di root repository. Jika menggunakan build tool seperti Vite, pastikan konfigurasi `base` di `vite.config.js` sudah disesuaikan dengan nama repository.

---

## Alur Transaksi

1. **Pilih Pelanggan:** Kasir memilih pelanggan dari daftar yang tersedia (jika ada).
2. **Input Transaksi:** Kasir menambahkan buku ke keranjang dengan memilih judul dan jumlah.
3. **Validasi Stok:** Sistem memeriksa ketersediaan stok buku secara otomatis.
4. **Pemilihan Pembayaran:** Sistem menghitung total transaksi dan kembalian.
5. **Penyimpanan Data:** Sistem menyimpan data penjualan dan detail penjualan ke database.
6. **Update Stok:** Stok buku berkurang otomatis setelah transaksi berhasil.
7. **Pantauan Restock:** Jika stok mencapai batas minimum atau nol, Dashboard menandainya sebagai perlu restock.
8. **Riwayat Transaksi:** Transaksi yang tersimpan muncul di arsip riwayat penjualan beserta opsi cetak struk.

---

## Palet Warna Sistem

Berdasarkan tampilan sistem yang berjalan, aplikasi menggunakan palet warna berikut:

| Warna         | Kode Hex  | Penggunaan                |
|---------------|-----------|---------------------------|
| Kuning Kertas | `#ffee9d` | Latar belakang utama      |
| Hijau Zaitun  | `#606c38` | Warna teks & elemen utama |
| Hijau Sage    | `#adc178` | Garis & aksen             |
| Merah Coral   | `#d81159` | Tombol aksi & highlight   |
| Coral Muda    | `#ffa3a5` | Aksen sekunder            |

---

**Dibuat oleh Nabila Salsabila**  
© 2026 - Universitas Diponegoro
