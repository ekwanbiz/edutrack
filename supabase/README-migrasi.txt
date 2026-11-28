2026-11-28 notifikasi_kelas_buku_tp: fungsi buku_tak_hantar(p_kelas) & tp_rendah(p_kelas, p_had=2), security invoker, execute untuk authenticated sahaja.
2026-11-28 tak_hadir_berturut: bilangan tidak hadir berturut-turut terkini setiap murid (security invoker, authenticated sahaja).
2026-11-28 tindakan_notif: jadual rekod 'Dah tangani' (RLS: pemilik + lulus; with check kelas & murid milik guru). Diuji: pemilik 1, orang lain 0, tambah disekat, ubah 0.
2026-11-28 status_tugasan_ket: lajur ket ('lewat'|'kecuali', kosong untuk rekod lama); buku_tak_hantar & kr_tertunggak tidak kira 'kecuali'. Disahkan: 146 rekod, 0 berubah.
