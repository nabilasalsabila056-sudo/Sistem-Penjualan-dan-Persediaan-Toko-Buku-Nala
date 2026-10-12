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

Toko Buku Nala adalah aplikasi web berbasis dashboard untuk mengelola operasional harian toko buku. Sistem ini memungkinkan pemantauan penjualan, pengelolaan katalog buku, pencatatan pelanggan, serta pemesanan stok ke supplier secara terintegrasi.

Aplikasi dibangun menggunakan HTML5, CSS3, dan JavaScript untuk sisi frontend, serta Supabase (PostgreSQL) sebagai backend penyimpanan data. Sistem berjalan sepenuhnya di sisi klien dan terhubung langsung ke database Supabase melalui API.

**Demo Langsung:**  
https://nabilasalsabila056-sudo.github.io/Sistem-Penjualan-dan-Persediaan-Toko-Buku-Nala/

---

## Fitur Utama

1. **Dashboard Ringkasan:** Menampilkan penjualan hari ini, jumlah transaksi, judul di katalog, total persediaan, prioritas pemesanan ulang, evaluasi dead stock, dan rak yang menipis.
2. **Manajemen Pelanggan:** Menyimpan dan mengelola data pelanggan untuk dipilih saat transaksi.
3. **Katalog Buku:** Mengelola judul, penerbit, lokasi stok, kategori, harga, stok, dan status buku.
4. **Penjualan (Kasir):** Mencatat transaksi baru, menampilkan keranjang buku, total transaksi, kembalian, dan riwayat transaksi.
5. **Pemesanan Supplier:** Mencatat barang yang diterima dari supplier; stok katalog bertambah otomatis.
6. **Integrasi Database Real-time:** Sistem menampilkan status koneksi ke PostgreSQL Supabase secara langsung.

---

## Teknologi yang Digunakan

| Komponen   | Teknologi               |
|------------|-------------------------|
| Frontend   | HTML5, CSS3, JavaScript |
| Backend    | Supabase (PostgreSQL)   |
| Deployment | GitHub Pages            |
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
Menyimpan rincian item yang dibeli dalam satu transaksi.

| Kolom        | Tipe      | Keterangan              |
|--------------|-----------|-------------------------|
| id           | BIGSERIAL | Primary Key             |
| penjualan_id | BIGINT    | Foreign Key ke Penjualan|
| buku_id      | BIGINT    | Foreign Key ke Buku     |
| jumlah       | INTEGER   | Jumlah item             |
| subtotal     | NUMERIC   | Subtotal harga          |

### 5. Pemesanan Supplier
Mencatat pemesanan barang dari supplier.

| Kolom       | Tipe      | Keterangan            |
|-------------|-----------|-----------------------|
| id          | BIGSERIAL | Primary Key           |
| nomor       | VARCHAR   | Nomor pesanan         |
| supplier    | VARCHAR   | Nama supplier         |
| lokasi      | VARCHAR   | Lokasi pengiriman     |
| item        | TEXT      | Daftar item           |
| total_modal | NUMERIC   | Total biaya           |
| diterima    | BOOLEAN   | Status penerimaan     |
| status      | VARCHAR   | Status pesanan        |

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
npm install @supabase/supabase-js
```

### Langkah 3: Konfigurasi Environment Variables
Salin file contoh `.env.example` ke `.env`:
```bash
cp .env.example .env
```
Isi file `.env` dengan kredensial Supabase Anda:
```env
VITE_SUPABASE_URL=https://<project-anda>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-anda>
```
Cara mendapatkan kredensial:
1. Login ke Supabase Dashboard.
2. Pilih project Anda.
3. Buka Settings lalu API.
4. Salin Project URL dan anon/public key.

### Langkah 4: Setup Database Supabase
Jalankan perintah SQL yang terdapat pada file `database/schema.sql` di dalam SQL Editor Supabase untuk membuat tabel yang diperlukan.

### Langkah 5: Menjalankan Aplikasi
```bash
npm run dev
```
Buka browser dan akses `http://localhost:5173`.

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
6. **Update Stok:** Stok buku berkurang secara otomatis setelah transaksi berhasil.
7. **Riwayat Transaksi:** Transaksi yang tersimpan muncul di arsip riwayat penjualan.

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
