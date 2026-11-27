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

## Akan datang
AttendX, TaskTrack, Assessment, Student Profile, Analisis, Scan QR dan Kutip Buku.

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
| `icons/` | Logo dan ikon app |
