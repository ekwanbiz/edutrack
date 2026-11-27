# EduTrack

App pengurusan kelas untuk guru (PWA). Dibina dengan HTML, CSS dan JavaScript biasa, dihoskan di GitHub Pages, dan menggunakan Supabase untuk pangkalan data serta log masuk.

## Fasa 1 (sudah ada)
- Daftar akaun guru dengan **kod pendaftaran**, kemudian tunggu kelulusan admin
- Akaun pertama yang mendaftar menjadi **admin**
- Halaman utama: ucapan, kata semangat, carian murid/kelas, senarai kelas dengan pin
- Halaman kelas: banner kelas, 6 modul, senarai murid
- **Urus**: tambah/ubah/padam kelas, tampal senarai murid, salin murid dari kelas lain, ubah/buang murid
- **Admin**: lihat & tukar kod pendaftaran, lulus/tolak guru
- Mod cerah/gelap dan 4 tema
- Boleh dipasang di skrin utama telefon (PWA) dan dibuka tanpa internet
- **Cetak sticker QR** (label A4 3 × 8), **Scan QR** dengan kamera, dan **Student Profile** asas
- **Analisis**: ringkasan kelas (30 hari / tahun ini / semua), carta kehadiran, KR, taburan TP, purata penilaian, senarai "Perlu perhatian" (had boleh ditetapkan), laporan kelas & individu (PDF A4 melalui cetak)
- **Assessment**: PBD ikut subjek (tulis/tampal Bab, pilih TP lalu tekan nama, "Semua → TP"), kuiz & peperiksaan (markah, purata, tertinggi, terendah)
- **TaskTrack + Kutip Buku**: tugasan (tajuk sahaja), Siap / Tidak siap, scan buku tanpa henti, kotak "KR tak siap" (tertunggak)
- **AttendX**: kehadiran harian (hadir / tidak hadir + sebab pilihan), sejarah, kotak "Lama tak hadir" (3 kali berturut-turut)

## Status
Semua 6 modul siap (27 Nov 2026).

## Fail
| Fail | Fungsi |
|---|---|
| `index.html` | Halaman app |
| `styles.css` | Rekaan dan tema |
| `app.js` | Logik app |
| `config.js` | Alamat dan kunci awam Supabase |
| `sw.js` | Service worker (luar talian) |
| `manifest.webmanifest` | Tetapan PWA |
| `vendor/supabase.js` | Pustaka Supabase (v2.119.2) |
| `vendor/qrcode.js` | Penjana QR (qrcode-generator 2.0.4, MIT) |
| `vendor/qr-scanner*.js` | Pembaca QR (qr-scanner 1.4.2, MIT) |
| `icons/` | Logo dan ikon app |
