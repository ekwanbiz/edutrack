/* EduTrack — app guru (PWA). Fasa 1: akaun, kelas, murid, tema. */
(function () {
  'use strict';

  var cfg = window.EDUTRACK_CONFIG;
  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var $app = document.getElementById('app');
  var $sheet = document.getElementById('sheet-root');
  var $toast = document.getElementById('toast');

  /* Nombor versi app. Naikkan SERENTAK dengan version.json dan CACHE dalam sw.js. */
  var VERSI = '10';

  var S = { session: null, profil: null, kelas: [], murid: [], loaded: false, q: '', authTab: 'masuk', recovery: false, scanner: null };

  /* ---------- Simpanan pilihan (tema, mod) ---------- */
  var pref = {
    get: function (k, d) { try { var v = localStorage.getItem('et_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('et_' + k, JSON.stringify(v)); } catch (e) { /* abaikan */ } }
  };

  var THEMES = [
    { id: 'teal', nama: 'Teal Segar', grad: 'linear-gradient(135deg,#2DD4BF,#0F766E)', color: '#0F766E' },
    { id: 'ungu', nama: 'Ungu Ceria', grad: 'linear-gradient(135deg,#A78BFA,#6D28D9)', color: '#6D28D9' },
    { id: 'oren', nama: 'Oren Mentari', grad: 'linear-gradient(135deg,#FDBA74,#C2410C)', color: '#C2410C' },
    { id: 'biru', nama: 'Biru Laut', grad: 'linear-gradient(135deg,#7DD3FC,#1D4ED8)', color: '#1D4ED8' }
  ];
  var WARNA = [
    { g: 'linear-gradient(135deg,#2DD4BF,#0F766E)', dot: '#FACC15', d2: '#F472B6' },
    { g: 'linear-gradient(135deg,#A78BFA,#5B4BE0)', dot: '#F472B6', d2: '#FACC15' },
    { g: 'linear-gradient(135deg,#FDBA74,#EA580C)', dot: '#38BDF8', d2: '#FDE68A' },
    { g: 'linear-gradient(135deg,#F9A8D4,#DB2777)', dot: '#FDE68A', d2: '#38BDF8' },
    { g: 'linear-gradient(135deg,#7DD3FC,#2563EB)', dot: '#86EFAC', d2: '#F472B6' },
    { g: 'linear-gradient(135deg,#86EFAC,#15803D)', dot: '#F472B6', d2: '#FDE68A' }
  ];
  function warna(i) { return WARNA[((i || 0) % WARNA.length + WARNA.length) % WARNA.length]; }

  function applyTheme() {
    var root = document.documentElement;
    var tema = pref.get('tema', 'teal');
    var sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mod = pref.get('mod', sysDark ? 'dark' : 'light');
    root.dataset.theme = tema;
    root.dataset.mode = mod;
    var t = THEMES.filter(function (x) { return x.id === tema; })[0] || THEMES[0];
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mod === 'dark' ? '#0B1220' : t.color);
  }

  /* ---------- Pembantu ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function inisial(n) {
    return String(n || '').trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase() || '?';
  }
  function kodKelas(nama) {
    var p = String(nama || '').trim().split(/\s+/);
    if (p.length > 1 && /^\d/.test(p[0])) return (p[0].replace(/\D/g, '').slice(0, 1) + p[1].charAt(0)).toUpperCase();
    return String(nama || '?').replace(/\s/g, '').slice(0, 2).toUpperCase();
  }
  function isMod(m) { return document.documentElement.dataset.mode === m; }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  /* QR: pautan yang dicetak pada sticker. Hanya kod rawak, tiada nama murid. */
  function qrUrl(token) { return location.origin + location.pathname + '#/m/' + token; }
  function qrSvg(text) {
    var q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ scalable: true, margin: 0 });
  }
  function tokenBaru() {
    var a = new Uint8Array(9);
    window.crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function ambilToken(teks) {
    var t = String(teks || '').trim();
    var m = t.match(/#\/m\/([a-f0-9]{8,64})/i);
    if (m) return m[1].toLowerCase();
    if (/^[a-f0-9]{8,64}$/i.test(t)) return t.toLowerCase();
    return null;
  }
  /* Tarikh ikut waktu telefon (bukan UTC), format YYYY-MM-DD. */
  function isoTarikh(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function hariIni() { return isoTarikh(new Date()); }
  function tambahHari(iso, n) {
    var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return isoTarikh(d);
  }
  var NAMA_HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
  var NAMA_BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
  function labelTarikh(iso, panjang) {
    var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var t = NAMA_HARI[d.getDay()] + ', ' + d.getDate() + ' ' + NAMA_BULAN[d.getMonth()];
    if (panjang && d.getFullYear() !== new Date().getFullYear()) t += ' ' + d.getFullYear();
    if (iso === hariIni()) t = 'Hari ini · ' + t;
    return t;
  }
  function namaPendek(n) { return String(n || '').split(/\s+/).slice(0, 2).join(' '); }

  /* Pelayar mini dalam WhatsApp/Telegram/Facebook/Instagram sering menyekat kamera. */
  function pelayarMini() {
    var ua = navigator.userAgent || '';
    var nama = /FBAN|FBAV|FB_IAB|FBIOS/.test(ua) ? 'Facebook' : /Instagram/.test(ua) ? 'Instagram' : /WhatsApp/i.test(ua) ? 'WhatsApp' : /Telegram/i.test(ua) ? 'Telegram' : /Line\//.test(ua) ? 'LINE' : /TikTok|musical_ly|Bytedance/i.test(ua) ? 'TikTok' : /Twitter/i.test(ua) ? 'X' : '';
    if (nama) return nama;
    if (/Android/.test(ua) && /; wv\)/.test(ua)) return 'aplikasi lain';
    if (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua) && !navigator.standalone && !window.matchMedia('(display-mode: standalone)').matches) return 'aplikasi lain';
    return '';
  }
  function iPhone() { return /iPhone|iPad|iPod/.test(navigator.userAgent || ''); }
  function mesejKamera(e) {
    var m = String(e && (e.name || e.message || e)), mini = pelayarMini(), pelayar = iPhone() ? 'Safari' : 'Chrome';
    var bukaLuar = 'Tekan ⋮ atau ⋯ di penjuru atas, kemudian pilih "Buka dalam ' + pelayar + '". Atau tekan Salin pautan dan tampal dalam ' + pelayar + '.';
    if (mini) return { teks: 'EduTrack sedang dibuka dalam ' + mini + ', yang menyekat kamera. ' + bukaLuar, salin: true };
    if (/NotAllowed|Permission|denied/i.test(m)) return { teks: iPhone()
      ? 'Kebenaran kamera ditolak. Buka Tetapan → Safari → Kamera → pilih Tanya atau Benarkan, kemudian cuba lagi.'
      : 'Kebenaran kamera ditolak. Tekan ikon di sebelah kiri alamat laman → Kebenaran → Kamera → Benarkan, kemudian cuba lagi.' };
    if (/NotReadable|TrackStart|Could not start/i.test(m)) return { teks: 'Kamera sedang digunakan oleh aplikasi lain (contohnya panggilan video). Tutup aplikasi itu, kemudian cuba lagi.' };
    if (/NotFound|no camera|Camera not found|DevicesNotFound/i.test(m)) return { teks: /Android|iPhone|iPad/.test(navigator.userAgent || '')
      ? 'Kamera tidak dijumpai. Tutup aplikasi lain yang menggunakan kamera, atau buka EduTrack dalam ' + pelayar + ', kemudian cuba lagi.'
      : 'Peranti ini tiada kamera. Gunakan telefon untuk scan QR.' };
    if (!navigator.mediaDevices || /secure|insecure|not supported|NotSupported/i.test(m)) return { teks: 'Pelayar ini tidak membenarkan kamera. Buka EduTrack dalam ' + pelayar + '.', salin: true };
    return { teks: 'Kamera tidak dapat dibuka (' + m + '). Cuba tutup dan buka semula app.' };
  }
  function tunjukRalatKamera(el, e, kelas) {
    var r = mesejKamera(e);
    el.className = kelas + ' err';
    el.innerHTML = esc(r.teks) + (r.salin ? '<br><button class="btn secondary" style="margin-top:10px;min-height:40px" data-act="salin-pautan">Salin pautan</button>' : '');
  }

  /* Skrin tidak malap semasa kamera dibuka (jika telefon menyokong). */
  function kunciSkrin() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (l) { S.wake = l; }).catch(function () { /* tidak disokong: abaikan */ });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.scanner && !S.wake) kunciSkrin(); });

  function hentiScanner() {
    if (S.wake) { try { S.wake.release(); } catch (e) { /* abaikan */ } S.wake = null; }
    if (S.scanner) { try { S.scanner.stop(); S.scanner.destroy(); } catch (e) { /* abaikan */ } S.scanner = null; }
  }

  var toastTimer = null;
  function toast(msg, undoFn) {
    clearTimeout(toastTimer);
    $toast.innerHTML = '<span>' + esc(msg) + '</span>' + (undoFn ? '<button type="button" data-toast-undo>Undo</button>' : '');
    $toast.classList.add('show');
    var b = $toast.querySelector('[data-toast-undo]');
    if (b) b.onclick = function () { $toast.classList.remove('show'); undoFn(); };
    toastTimer = setTimeout(function () { $toast.classList.remove('show'); }, undoFn ? 6000 : 3200);
  }

  function errMsg(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/KOD_TIDAK_SAH|Database error saving new user/i.test(m)) return 'Kod pendaftaran tidak sah.';
    if (/Invalid login credentials/i.test(m)) return 'Emel atau kata laluan salah.';
    if (/Email not confirmed/i.test(m)) return 'Emel belum disahkan. Semak peti masuk emel anda.';
    if (/User already registered/i.test(m)) return 'Emel ini sudah didaftarkan. Sila log masuk.';
    if (/Password should be at least/i.test(m)) return 'Kata laluan mesti sekurang-kurangnya 6 aksara.';
    if (/rate limit|too many/i.test(m)) return 'Terlalu banyak cubaan. Cuba lagi sebentar.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Tiada sambungan internet.';
    if (/BUKAN_ADMIN/.test(m)) return 'Hanya admin boleh buat ini.';
    return m || 'Ralat tidak diketahui.';
  }

  /* ---------- Ikon ---------- */
  var I = {
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></svg>',
    moon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    palette: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.4-1.2-1.8-1.2-3 0-1.1.9-2 2-2H17a4 4 0 0 0 4-4c0-4-4-7-9-7z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/></svg>',
    star: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M12 3l2.4 5.6L20 9l-4.3 3.8L17 18.5 12 15.5 7 18.5l1.3-5.7L4 9l5.6-.4z"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    download: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    print: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
    gear: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    pin: function (on) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (on ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z"/><path d="M12 14v7"/></svg>'; },
    mark: '<svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><rect x="16" y="15" width="8" height="34" rx="4" fill="#fff"/><rect x="16" y="15" width="31" height="8" rx="4" fill="#fff"/><rect x="16" y="28" width="22" height="8" rx="4" fill="#FACC15"/><rect x="16" y="41" width="31" height="8" rx="4" fill="#fff"/><circle cx="45.5" cy="32" r="4.5" fill="#F472B6"/></svg>',
    qr: '<svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22D3EE"/><stop offset="1" stop-color="#6366F1"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#gq)"/><rect x="13" y="13" width="15" height="15" rx="4" fill="none" stroke="#fff" stroke-width="3.5"/><rect x="18.5" y="18.5" width="4" height="4" rx="1" fill="#fff"/><rect x="36" y="13" width="15" height="15" rx="4" fill="none" stroke="#fff" stroke-width="3.5"/><rect x="41.5" y="18.5" width="4" height="4" rx="1" fill="#fff"/><rect x="13" y="36" width="15" height="15" rx="4" fill="none" stroke="#fff" stroke-width="3.5"/><rect x="18.5" y="41.5" width="4" height="4" rx="1" fill="#fff"/><rect x="36" y="36" width="6" height="6" rx="1.5" fill="#FACC15"/><rect x="45" y="45" width="6" height="6" rx="1.5" fill="#fff"/><rect x="45" y="36" width="6" height="6" rx="1.5" fill="#fff"/><rect x="36" y="45" width="6" height="6" rx="1.5" fill="#F472B6"/></svg>'
  };

  function logo(id, size) {
    var s = size || 64;
    var g = {
      attendx: ['#34D399', '#059669', '<circle cx="27" cy="23" r="8" fill="#fff"/><path d="M12 49c0-8.6 6.7-14.5 15-14.5S42 40.4 42 49z" fill="#fff"/><circle cx="45" cy="42" r="11" fill="#FACC15"/><path d="M40 42.5l3.5 3.5 6.5-7" fill="none" stroke="#065F46" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'],
      tasktrack: ['#FDBA74', '#EA580C', '<rect x="15" y="12" width="30" height="39" rx="6" fill="#fff"/><rect x="15" y="12" width="8" height="39" rx="4" fill="#FED7AA"/><path d="M35 12h7v15l-3.5-3-3.5 3z" fill="#38BDF8"/><circle cx="44" cy="44" r="10.5" fill="#22C55E"/><path d="M39.5 44.2l3.2 3.2 5.8-6.2" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'],
      assessment: ['#A78BFA', '#5B4BE0', '<path d="M24 34l-5 18 7-3 4 6 4-15z" fill="#F472B6"/><path d="M40 34l5 18-7-3-4 6-4-15z" fill="#EC4899"/><circle cx="32" cy="27" r="14" fill="#FBBF24"/><circle cx="32" cy="27" r="10" fill="#F59E0B"/><path d="M32 20.5l1.7 4.2 4.5.3-3.5 2.9 1.1 4.4-3.8-2.4-3.8 2.4 1.1-4.4-3.5-2.9 4.5-.3z" fill="#fff"/>'],
      profil: ['#F9A8D4', '#DB2777', '<rect x="26" y="11" width="12" height="9" rx="3" fill="#FCE7F3"/><rect x="10" y="17" width="44" height="31" rx="7" fill="#fff"/><circle cx="23" cy="32" r="8" fill="#FDE68A"/><circle cx="23" cy="29.5" r="3.2" fill="#F59E0B"/><path d="M17 37.5a6 6 0 0 1 12 0z" fill="#F59E0B"/><rect x="34" y="26" width="14" height="4.5" rx="2.25" fill="#93C5FD"/><rect x="34" y="34" width="10" height="4.5" rx="2.25" fill="#C4B5FD"/>'],
      analisis: ['#7DD3FC', '#2563EB', '<rect x="12" y="36" width="8" height="15" rx="3" fill="#fff"/><rect x="23" y="29" width="8" height="22" rx="3" fill="#FDE68A"/><rect x="34" y="33" width="8" height="18" rx="3" fill="#fff"/><rect x="45" y="22" width="8" height="29" rx="3" fill="#86EFAC"/><path d="M12 27l11-8 11 5 13-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48" cy="14" r="3.8" fill="#F472B6"/>'],
      urus: ['#475569', '#0F172A', '<path d="M14 20h36M14 32h36M14 44h36" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="20" r="6" fill="#F472B6" stroke="#fff" stroke-width="2"/><circle cx="24" cy="32" r="6" fill="#FACC15" stroke="#fff" stroke-width="2"/><circle cx="36" cy="44" r="6" fill="#34D399" stroke="#fff" stroke-width="2"/>']
    }[id];
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg-' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + g[0] + '"/><stop offset="1" stop-color="' + g[1] + '"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#lg-' + id + ')"/>' + g[2] + '</svg>';
  }

  var MODUL = [
    { id: 'attendx', nama: 'AttendX', desc: 'Rekod kehadiran', },
    { id: 'tasktrack', nama: 'TaskTrack', desc: 'Kerja rumah · kutip buku', },
    { id: 'assessment', nama: 'Assessment', desc: 'PBD · kuiz · peperiksaan', },
    { id: 'profil', nama: 'Student Profile', desc: 'Profil murid · QR' },
    { id: 'analisis', nama: 'Analysis', desc: 'Statistik · laporan', },
    { id: 'urus', nama: 'Manage', desc: 'Murid · kelas · QR' }
  ];

  /* ---------- Sheet ---------- */
  function openSheet(html, opts) {
    opts = opts || {};
    $sheet.innerHTML = '<div class="overlay" data-act="sheet-close-bg"><div class="sheet' + (opts.tall ? ' tall' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.label || 'Panel') + '"><div class="grab"></div>' + html + '</div></div>';
    var first = $sheet.querySelector(opts.focus || 'input, button:not([data-act="sheet-close-bg"])');
    if (first && opts.focus) setTimeout(function () { first.focus(); }, 60);
  }
  function closeSheet() { $sheet.innerHTML = ''; }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $sheet.innerHTML) closeSheet(); });

  /* ---------- Data ---------- */
  async function ensureProfil(force) {
    if (!S.session) return null;
    if (S.profil && !force) return S.profil;
    var r = await sb.from('profil').select('*').eq('id', S.session.user.id).maybeSingle();
    if (r.error) {
      var c = rangkaianGagal(r.error) && bacaCache();
      if (c && c.profil) { S.profil = c.profil; S.luarTalian = true; return S.profil; }
      throw r.error;
    }
    S.profil = r.data;
    return r.data;
  }

  async function loadData(force) {
    if (S.loaded && !force) return;
    var res = await Promise.all([
      sb.from('kelas').select('id,nama,subjek,warna,disemat,dicipta').order('dicipta'),
      sb.from('murid').select('id,nama,qr_token,kelas_murid(kelas_id,no_giliran)').order('nama')
    ]);
    var e = res[0].error || res[1].error;
    if (e) {
      var c = rangkaianGagal(e) && bacaCache();
      if (!c) throw e;
      S.kelas = c.kelas || []; S.murid = c.murid || []; S.loaded = true; S.luarTalian = true;
      return;
    }
    S.kelas = res[0].data || [];
    S.murid = res[1].data || [];
    S.loaded = true; S.luarTalian = false;
    simpanCache();
  }

  function muridKelas(kelasId) {
    return S.murid
      .map(function (m) {
        var l = (m.kelas_murid || []).filter(function (x) { return x.kelas_id === kelasId; })[0];
        return l ? { id: m.id, nama: m.nama, no: l.no_giliran } : null;
      })
      .filter(Boolean)
      .sort(function (a, b) { return (a.no - b.no) || a.nama.localeCompare(b.nama); });
  }
  function bilMurid(kelasId) { return muridKelas(kelasId).length; }
  function muridAktif() { return S.murid.filter(function (m) { return (m.kelas_murid || []).length > 0; }); }
  function cariKelas(id) { return S.kelas.filter(function (k) { return k.id === id; })[0]; }

  /* ---------- Rekod tanpa internet ----------
     Peti keluar (outbox) dalam telefon: rekod AttendX & TaskTrack yang gagal dihantar kerana tiada internet
     disimpan dahulu, kemudian dihantar automatik bila ada isyarat. Satu kunci = satu baris (murid + tarikh /
     murid + tugasan), jadi hantar dua kali tidak mencipta rekod berganda. Rekod yang ditolak pelayan TIDAK
     dipadam senyap: ia ditanda "gagal" dan guru yang memutuskan. */
  var JADUAL_LUAR = { kehadiran: 'kelas_id,murid_id,tarikh', status_tugasan: 'tugasan_id,murid_id' };
  function uid() { return S.session ? S.session.user.id : 'x'; }
  function simpanLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function bacaLS(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function bacaOutbox() { return bacaLS('et_outbox_' + uid(), []); }
  function tulisOutbox(a) { return simpanLS('et_outbox_' + uid(), a); }
  function kunciBaris(t, r) { return t + '|' + JADUAL_LUAR[t].split(',').map(function (c) { return r[c]; }).join('|'); }
  function rangkaianGagal(e) {
    if (navigator.onLine === false) return true;
    var m = String((e && (e.message || e.code)) || e || '');
    return /Failed to fetch|Load failed|NetworkError|network|fetch|timeout|JWT|PGRST301/i.test(m);
  }
  function masukOutbox(t, rows) {
    var ob = bacaOutbox(), idx = {}, now = Date.now();
    ob.forEach(function (x, i) { idx[x.k] = i; });
    rows.forEach(function (r) {
      var k = kunciBaris(t, r), item = { k: k, t: t, r: r, w: now };
      if (idx[k] !== undefined) ob[idx[k]] = item; else { idx[k] = ob.length; ob.push(item); }
    });
    var ok = tulisOutbox(ob);
    kemasPetunjukOutbox();
    return ok;
  }
  function keluarkanOutbox(dihantar) { // dihantar: { kunci: masa_tulis }
    var ob = bacaOutbox();
    var baki = ob.filter(function (x) { return !(dihantar[x.k] !== undefined && x.w <= dihantar[x.k]); });
    if (baki.length !== ob.length) tulisOutbox(baki);
  }
  var maklumLuar = false;
  async function simpanRekod(t, rows) {
    var mula = Date.now();
    if (navigator.onLine === false) return masukOutbox(t, rows) ? { luar: true } : { error: { message: 'Storan telefon penuh. Rekod tidak disimpan.' } };
    var r = await sb.from(t).upsert(rows, { onConflict: JADUAL_LUAR[t] });
    if (r.error && rangkaianGagal(r.error)) return masukOutbox(t, rows) ? { luar: true } : { error: r.error };
    if (r.error) return { error: r.error };
    var d = {}; rows.forEach(function (x) { d[kunciBaris(t, x)] = mula; });
    keluarkanOutbox(d); // rekod lama dalam peti untuk murid yang sama sudah tidak relevan
    kemasPetunjukOutbox();
    return { ok: true };
  }
  function maklumLuarTalian(res) {
    if (res && res.luar && !maklumLuar) { maklumLuar = true; toast('Tiada internet. Rekod disimpan dalam telefon dan akan dihantar automatik.'); }
  }
  function rekodLuar(t, tapis) {
    var o = {};
    bacaOutbox().forEach(function (x) { if (x.t === t && tapis(x.r)) o[x.k] = x.r; });
    return Object.keys(o).map(function (k) { return o[k]; });
  }

  var hantarSibuk = false;
  async function hantarOutbox(tunjuk) {
    if (hantarSibuk || !S.session) return;
    var ob = bacaOutbox().filter(function (x) { return !x.gagal; });
    if (!ob.length) { if (tunjuk) toast('Tiada rekod untuk dihantar.'); kemasPetunjukOutbox(); return; }
    if (navigator.onLine === false) { if (tunjuk) toast('Masih tiada internet.'); return; }
    hantarSibuk = true;
    var terhenti = false, berjaya = 0, gagal = 0;
    try {
      for (var t in JADUAL_LUAR) {
        var items = ob.filter(function (x) { return x.t === t; });
        for (var i = 0; i < items.length && !terhenti; i += 300) {
          var cebis = items.slice(i, i + 300);
          var r = await sb.from(t).upsert(cebis.map(function (x) { return x.r; }), { onConflict: JADUAL_LUAR[t] });
          if (!r.error) { var d = {}; cebis.forEach(function (x) { d[x.k] = x.w; }); keluarkanOutbox(d); berjaya += cebis.length; continue; }
          if (rangkaianGagal(r.error)) { terhenti = true; break; }
          // Ralat lain: hantar satu-satu untuk kenal pasti rekod yang ditolak.
          for (var j = 0; j < cebis.length; j++) {
            var x = cebis[j], r1 = await sb.from(t).upsert([x.r], { onConflict: JADUAL_LUAR[t] });
            if (!r1.error) { var d1 = {}; d1[x.k] = x.w; keluarkanOutbox(d1); berjaya++; }
            else if (rangkaianGagal(r1.error)) { terhenti = true; break; }
            else { tandaGagal(x, errMsg(r1.error)); gagal++; }
          }
        }
        if (terhenti) break;
      }
    } finally { hantarSibuk = false; kemasPetunjukOutbox(); if (S.ax && $app.querySelector('[data-ax-status]')) segarAttendX(); }
    if (berjaya && !terhenti) maklumLuar = false;
    if (tunjuk || berjaya || gagal) toast(terhenti ? 'Sambungan terputus. Akan cuba lagi.' : gagal ? berjaya + ' rekod dihantar, ' + gagal + ' ditolak. Tekan petunjuk untuk butiran.' : berjaya + ' rekod tertangguh telah dihantar.');
  }
  function tandaGagal(x, sebab) {
    var ob = bacaOutbox();
    ob.forEach(function (y) { if (y.k === x.k && y.w === x.w) { y.gagal = true; y.sebab = sebab; } });
    tulisOutbox(ob);
  }
  function kiraOutbox() {
    var ob = bacaOutbox();
    return { tunggu: ob.filter(function (x) { return !x.gagal; }).length, gagal: ob.filter(function (x) { return x.gagal; }).length };
  }
  function htmlOutbox() {
    var c = kiraOutbox();
    if (!c.tunggu && !c.gagal) return '';
    return '<button class="outbox-bar' + (c.gagal && !c.tunggu ? ' gagal' : '') + '" data-act="outbox">' +
      (c.tunggu ? '⏳ ' + c.tunggu + ' rekod belum dihantar' : '') + (c.tunggu && c.gagal ? ' · ' : '') + (c.gagal ? '⚠ ' + c.gagal + ' ditolak' : '') + '<b>' + (c.tunggu ? 'Hantar' : 'Lihat') + '</b></button>';
  }
  function kemasPetunjukOutbox() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-outbox]'), function (el) { el.innerHTML = htmlOutbox(); });
    var sc = $app.querySelector('[data-saved]'); if (sc) sc.outerHTML = savedChip();
  }
  function sheetOutbox() {
    var ob = bacaOutbox(), c = kiraOutbox();
    var nama = {}; S.murid.forEach(function (m) { nama[m.id] = m.nama; });
    var gagal = ob.filter(function (x) { return x.gagal; });
    openSheet('<div class="between"><h2>Rekod dalam telefon</h2><button class="icon-sm" data-act="sheet-close" aria-label="Tutup">' + I.close + '</button></div>' +
      '<p class="sub" style="margin:0">' + (c.tunggu ? '<b>' + c.tunggu + ' rekod</b> disimpan dalam telefon kerana tiada internet. Ia akan dihantar automatik bila ada isyarat. <b>Jangan log keluar</b> sebelum ia dihantar.' : 'Tiada rekod menunggu.') + '</p>' +
      (c.tunggu ? '<button class="btn block" data-act="outbox-hantar">Hantar sekarang</button>' : '') +
      (gagal.length ? '<span class="section-title" style="margin-top:6px">Ditolak oleh pelayan (' + gagal.length + ')</span><p class="sub" style="margin:0">Biasanya kerana murid sudah dibuang dari kelas atau tugasan sudah dipadam. Rekod ini tidak dipadam sendiri.</p>' +
        '<div class="sheet-scroll">' + gagal.slice(0, 50).map(function (x) {
          var r = x.r, apa = x.t === 'kehadiran' ? 'Kehadiran ' + tarikhDMY(r.tarikh) + ': ' + (r.hadir ? 'Hadir' : 'Tidak hadir') : 'Kerja rumah: ' + (r.siap ? 'Siap' : 'Tidak siap');
          return '<div class="list-row"><span class="grow"><b style="display:block;font-size:14px">' + esc(nama[r.murid_id] || 'Murid tidak dijumpai') + '</b><span class="sub">' + esc(apa) + ' · ' + esc(x.sebab || '') + '</span></span></div>';
        }).join('') + '</div><button class="btn danger block" data-act="outbox-buang">Buang ' + gagal.length + ' rekod yang ditolak</button>' : ''),
      { label: 'Rekod dalam telefon' });
  }

  /* Salinan kecil dalam telefon supaya app boleh dibuka tanpa internet. Dipadam semasa log keluar. */
  function simpanCache() { simpanLS('et_cache_' + uid(), { profil: S.profil, kelas: S.kelas, murid: S.murid, t: Date.now() }); }
  function bacaCache() { return bacaLS('et_cache_' + uid(), null); }
  function padamCacheTelefon() {
    var buang = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^et_(cache|outbox)_/.test(k)) buang.push(k); }
    buang.forEach(function (k) { localStorage.removeItem(k); });
  }
  window.addEventListener('online', function () { hantarOutbox(false); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && navigator.onLine !== false) hantarOutbox(false); });
  setInterval(function () { if (navigator.onLine !== false && kiraOutbox().tunggu) hantarOutbox(false); }, 30000);

  /* ---------- Router ---------- */
  async function route() {
    closeSheet();
    hentiScanner();
    try {
      if (S.recovery) return renderSetPassword();
      if (!S.session) return renderAuth();
      var p = await ensureProfil();
      if (!p) return renderTiadaProfil();
      if (p.status === 'menunggu') return renderStatus('menunggu');
      if (p.status === 'ditolak') return renderStatus('ditolak');
      await loadData();
      var h = location.hash.replace(/^#\/?/, '').split('/');
      if (h[0] === 'kelas' && h[1]) return renderKelas(h[1]);
      if (h[0] === 'urus' && h[1] === 'kelas' && h[2]) return renderUrusKelas(h[2]);
      if (h[0] === 'urus') return renderUrus();
      if (h[0] === 'modul' && h[1] === 'attendx' && h[2]) return renderAttendX(h[2], h[3]);
      if (h[0] === 'modul' && h[1] === 'tasktrack' && h[2] && h[3]) return renderTugasan(h[2], h[3]);
      if (h[0] === 'modul' && h[1] === 'tasktrack' && h[2]) return renderTaskTrack(h[2]);
      if (h[0] === 'kutip' && h[1] && h[2]) return renderKutip(h[1], h[2]);
      if (h[0] === 'modul' && h[1] === 'assessment' && h[2]) return renderAssessment(h[2], h[3]);
      if (h[0] === 'pbd' && h[1] && h[2]) return renderPbdItem(h[1], h[2]);
      if (h[0] === 'nilai' && h[1] && h[2]) return renderPenilaian(h[1], h[2]);
      if (h[0] === 'modul' && h[1] === 'analisis' && h[2]) return renderAnalisis(h[2], h[3]);
      if (h[0] === 'laporan' && h[1] && h[2]) return renderLaporan(h[1], h[2], h[3], h[4]);
      if (h[0] === 'modul' && h[1]) return renderModul(h[1], h[2]);
      if (h[0] === 'cetak' && h[1]) return renderCetak(h[1]);
      if (h[0] === 'scan') return renderScan();
      if (h[0] === 'm' && h[1]) return bukaToken(h[1]);
      if (h[0] === 'murid' && h[1]) return renderMurid(h[1]);
      return renderHome();
    } catch (e) {
      renderRalat(e);
    }
  }

  function renderRalat(e) {
    $app.innerHTML = '<div class="page"><div class="empty" style="margin:auto"><h2>Tidak dapat memuatkan</h2><p class="sub">' + esc(errMsg(e)) + '</p><button class="btn" data-act="reload">Cuba lagi</button></div></div>';
  }

  /* ---------- Log masuk / daftar ---------- */
  function renderAuth(msg) {
    var daftar = S.authTab === 'daftar';
    $app.innerHTML =
      '<div class="auth">' +
        '<div class="stack" style="gap:14px"><div class="auth-logo" role="img" aria-label="Logo EduTrack"></div>' +
        '<div><h1>Edu<span style="color:var(--acc)">Track</span></h1><p class="sub" style="margin:4px 0 0">Pengurusan kelas untuk guru</p></div></div>' +
        '<div class="tabs" role="tablist">' +
          '<button role="tab" aria-selected="' + !daftar + '" data-act="auth-tab" data-tab="masuk">Log masuk</button>' +
          '<button role="tab" aria-selected="' + daftar + '" data-act="auth-tab" data-tab="daftar">Daftar</button>' +
        '</div>' +
        '<form class="stack" style="gap:14px" data-form="' + (daftar ? 'daftar' : 'masuk') + '" novalidate>' +
          (daftar ? '<label class="field"><span>Nama</span><input class="input" name="nama" autocomplete="name" placeholder="Cikgu Aina binti Ali" required></label>' : '') +
          '<label class="field"><span>Emel</span><input class="input" name="emel" type="email" autocomplete="email" inputmode="email" placeholder="nama@moe-dl.edu.my" required></label>' +
          '<label class="field"><span>Kata laluan</span><input class="input" name="laluan" type="password" autocomplete="' + (daftar ? 'new-password' : 'current-password') + '" placeholder="Sekurang-kurangnya 6 aksara" required></label>' +
          (daftar ? '<label class="field"><span>Kod pendaftaran</span><input class="input" name="kod" autocapitalize="characters" placeholder="Kod daripada admin" required></label>' : '') +
          '<p class="error" data-err>' + esc(msg || '') + '</p>' +
          '<button class="btn block" type="submit">' + (daftar ? 'Daftar akaun' : 'Log masuk') + '</button>' +
          (!daftar ? '<button class="btn ghost" type="button" data-act="lupa">Lupa kata laluan?</button>' : '<p class="sub" style="margin:0">Selepas daftar, akaun perlu diluluskan oleh admin sebelum boleh digunakan.</p>') +
        '</form>' +
      '</div>';
  }

  async function submitMasuk(form) {
    var f = new FormData(form), err = form.querySelector('[data-err]'), btn = form.querySelector('[type=submit]');
    var emel = String(f.get('emel') || '').trim(), laluan = String(f.get('laluan') || '');
    if (!emel || !laluan) { err.textContent = 'Isi emel dan kata laluan.'; return; }
    btn.disabled = true; err.textContent = '';
    var r = await sb.auth.signInWithPassword({ email: emel, password: laluan });
    btn.disabled = false;
    if (r.error) { err.textContent = errMsg(r.error); return; }
  }

  async function submitDaftar(form) {
    var f = new FormData(form), err = form.querySelector('[data-err]'), btn = form.querySelector('[type=submit]');
    var nama = String(f.get('nama') || '').trim(), emel = String(f.get('emel') || '').trim();
    var laluan = String(f.get('laluan') || ''), kod = String(f.get('kod') || '').trim();
    if (!nama || !emel || !laluan || !kod) { err.textContent = 'Isi semua maklumat.'; return; }
    if (laluan.length < 6) { err.textContent = 'Kata laluan mesti sekurang-kurangnya 6 aksara.'; return; }
    btn.disabled = true; err.textContent = '';
    var c = await sb.rpc('semak_kod', { kod: kod });
    if (c.error) { btn.disabled = false; err.textContent = errMsg(c.error); return; }
    if (!c.data) { btn.disabled = false; err.textContent = 'Kod pendaftaran tidak sah.'; return; }
    var r = await sb.auth.signUp({
      email: emel, password: laluan,
      options: { data: { nama: nama, kod: kod }, emailRedirectTo: location.origin + location.pathname }
    });
    btn.disabled = false;
    if (r.error) { err.textContent = errMsg(r.error); return; }
    if (!r.data.session) {
      $app.innerHTML = '<div class="auth"><div class="auth-logo" role="img" aria-label="Logo EduTrack"></div><h1>Semak emel anda</h1><p class="sub">Kami hantar pautan pengesahan ke <b>' + esc(emel) + '</b>. Tekan pautan tersebut, kemudian log masuk.</p><button class="btn block" data-act="ke-masuk">Ke log masuk</button></div>';
    }
  }

  async function lupaLaluan() {
    var input = $app.querySelector('input[name=emel]');
    var emel = input ? input.value.trim() : '';
    var err = $app.querySelector('[data-err]');
    if (!emel) { if (err) err.textContent = 'Taip emel anda dahulu, kemudian tekan "Lupa kata laluan?".'; return; }
    var r = await sb.auth.resetPasswordForEmail(emel, { redirectTo: location.origin + location.pathname });
    if (r.error) { if (err) err.textContent = errMsg(r.error); return; }
    toast('Pautan tetapan semula dihantar ke emel anda.');
  }

  function renderSetPassword() {
    $app.innerHTML = '<div class="auth"><div class="auth-logo" role="img" aria-label="Logo EduTrack"></div><h1>Kata laluan baharu</h1>' +
      '<form class="stack" data-form="laluan-baru" novalidate><label class="field"><span>Kata laluan baharu</span><input class="input" type="password" name="laluan" autocomplete="new-password" required></label><p class="error" data-err></p><button class="btn block" type="submit">Simpan</button></form></div>';
  }

  function renderStatus(st) {
    var tunggu = st === 'menunggu';
    $app.innerHTML = '<div class="auth">' +
      '<div class="auth-logo" role="img" aria-label="Logo EduTrack"></div>' +
      '<h1>' + (tunggu ? 'Menunggu kelulusan' : 'Akaun tidak diluluskan') + '</h1>' +
      '<p class="sub">' + (tunggu
        ? 'Terima kasih, ' + esc(S.profil.nama || 'Cikgu') + '. Akaun anda sudah didaftarkan dan sedang menunggu kelulusan admin. Sila cuba semula kemudian.'
        : 'Admin tidak meluluskan akaun ini. Hubungi admin EduTrack sekolah anda.') + '</p>' +
      (tunggu ? '<button class="btn block" data-act="semak-status">Semak semula</button>' : '') +
      '<button class="btn secondary block" data-act="keluar">Log keluar</button></div>';
  }

  function renderTiadaProfil() {
    $app.innerHTML = '<div class="auth"><h1>Akaun tidak lengkap</h1><p class="sub">Profil akaun ini tidak dijumpai. Cuba log keluar dan daftar semula.</p><button class="btn block" data-act="keluar">Log keluar</button></div>';
  }

  /* ---------- Halaman utama ---------- */
  var KATA = [
    'Setiap murid berkembang pada masanya sendiri.',
    'Langkah kecil hari ini, kejayaan besar esok.',
    'Guru yang sabar melahirkan murid yang yakin.',
    'Satu kata semangat boleh mengubah hari seorang murid.',
    'Kemajuan lebih penting daripada kesempurnaan.',
    'Hari ini peluang baharu untuk setiap murid.',
    'Didik dengan hati, murid akan ingat sampai bila-bila.'
  ];

  function headerUtama() {
    return '<div class="between">' +
      '<div class="brand"><span class="brand-mark">' + I.mark + '</span><span class="brand-name">Edu<b>Track</b></span></div>' +
      '<div class="row" style="gap:8px">' +
        '<button class="icon-btn" data-act="mod" aria-label="' + (isMod('dark') ? 'Tukar ke mod cerah' : 'Tukar ke mod gelap') + '">' + (isMod('dark') ? I.sun : I.moon) + '</button>' +
        '<button class="icon-btn" data-act="tema" aria-label="Pilih tema">' + I.palette + '</button>' +
        '<a class="avatar-btn" href="#/urus" aria-label="Akaun dan Manage">' + esc(inisial(S.profil.nama)) + '</a>' +
      '</div></div>';
  }

  function renderHome() {
    var now = new Date(), h = now.getHours();
    var ucapan = h < 12 ? 'Selamat pagi' : h < 14 ? 'Selamat tengah hari' : h < 19 ? 'Selamat petang' : 'Selamat malam';
    var hari = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'][now.getDay()];
    var bulan = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'][now.getMonth()];
    var nama = (S.profil.nama || '').replace(/^\s*(cikgu|cg\.?|teacher)\s+/i, '').split(/\s+/)[0] || '';
    $app.innerHTML = '<div class="page">' +
      headerUtama() +
      '<div><p class="sub" style="margin:0">' + hari + ', ' + now.getDate() + ' ' + bulan + '</p><h1>' + ucapan + (nama ? ', Cikgu ' + esc(nama) : '') + '</h1></div>' +
      '<div class="quote">' + I.star + '<span>' + esc(KATA[now.getDate() % KATA.length]) + '</span></div>' +
      '<label class="search">' + I.search + '<span class="sr">Cari murid atau kelas</span><input type="search" data-input="cari" placeholder="Cari murid atau kelas" value="' + esc(S.q) + '" autocomplete="off"></label>' +
      '<div class="between"><span class="sub">' + S.kelas.length + ' kelas · ' + muridAktif().length + ' murid</span>' + savedChip() + '</div>' +
      '<div class="stack" data-home-list>' + homeList() + '</div>' +
      '<div class="scan-wrap"><button class="scan-btn" data-act="scan">' + I.qr + 'Scan QR murid</button></div>' +
    '</div>';
  }

  function savedChip() {
    var on = navigator.onLine !== false, c = kiraOutbox();
    if (c.tunggu || c.gagal) return '<button class="saved off" data-saved data-act="outbox">' + (c.tunggu ? '⏳ ' + c.tunggu + ' rekod belum dihantar' : '⚠ ' + c.gagal + ' rekod ditolak') + '</button>';
    return '<span class="saved' + (on ? '' : ' off') + '" data-saved>' + (on ? I.check + 'Semua rekod disimpan' : 'Luar talian') + '</span>';
  }

  function homeList() {
    var q = S.q.trim().toLowerCase(), out = '';
    if (q) {
      var mm = muridAktif().filter(function (m) { return m.nama.toLowerCase().indexOf(q) >= 0; }).slice(0, 5);
      if (mm.length) {
        out += '<span class="section-title">Murid</span>';
        out += mm.map(function (m) {
          var k = cariKelas((m.kelas_murid[0] || {}).kelas_id);
          return '<a class="card murid-row" href="' + (k ? '#/kelas/' + k.id : '#/') + '"><span class="murid-av">' + esc(inisial(m.nama)) + '</span><span class="grow"><span style="display:block;font-weight:700">' + esc(m.nama) + '</span><span class="sub">' + esc(k ? k.nama + (k.subjek ? ' · ' + k.subjek : '') : '') + '</span></span></a>';
        }).join('');
      }
    }
    var ks = S.kelas.slice()
      .sort(function (a, b) { return (b.disemat - a.disemat) || (new Date(a.dicipta) - new Date(b.dicipta)); })
      .filter(function (k) { return !q || (k.nama + ' ' + k.subjek).toLowerCase().indexOf(q) >= 0; });
    out += '<div class="between"><span class="section-title">Kelas saya</span><button class="btn ghost" data-act="tambah-kelas">+ Tambah</button></div>';
    if (!S.kelas.length) {
      out += '<div class="card empty"><span style="font-size:0">' + logo('urus', 56) + '</span><h2>Mula dengan kelas pertama</h2><p class="sub">Tambah kelas dan subjek yang cikgu ajar, kemudian masukkan senarai murid.</p><button class="btn" data-act="tambah-kelas">Tambah kelas</button></div>';
    } else if (!ks.length && !out.match(/murid-row/)) {
      out += '<p class="sub">Tiada kelas atau murid sepadan.</p>';
    }
    out += ks.map(function (k) {
      var w = warna(k.warna);
      return '<div class="card kelas-card"><a class="kelas-link" href="#/kelas/' + k.id + '">' +
        '<span class="kelas-av" style="background:' + w.g + ';--dot:' + w.dot + '"><span>' + esc(kodKelas(k.nama)) + '</span></span>' +
        '<span class="grow"><span class="kelas-name" style="display:block">' + esc(k.nama) + '</span><span class="sub">' + esc((k.subjek ? k.subjek + ' · ' : '') + bilMurid(k.id) + ' murid') + '</span></span></a>' +
        '<button class="pin' + (k.disemat ? ' on' : '') + '" data-act="pin" data-id="' + k.id + '" aria-pressed="' + !!k.disemat + '" aria-label="' + (k.disemat ? 'Nyahsemat kelas' : 'Semat kelas di atas') + '">' + I.pin(k.disemat) + '</button></div>';
    }).join('');
    return out;
  }

  function sheetTema() {
    var tema = pref.get('tema', 'teal');
    openSheet('<h2>Tampilan</h2>' +
      '<div class="stack" style="gap:8px"><span class="section-title">Mod</span><div class="seg">' +
        '<button data-act="set-mod" data-mod="light" aria-pressed="' + isMod('light') + '">Cerah</button>' +
        '<button data-act="set-mod" data-mod="dark" aria-pressed="' + isMod('dark') + '">Gelap</button></div></div>' +
      '<div class="stack" style="gap:8px"><span class="section-title">Tema</span><div class="theme-grid">' +
        THEMES.map(function (t) { return '<button class="theme-opt" data-act="set-tema" data-tema="' + t.id + '" aria-pressed="' + (t.id === tema) + '"><i style="background:' + t.grad + '"></i>' + t.nama + '</button>'; }).join('') +
      '</div></div>' +
      '<button class="btn block" data-act="sheet-close">Siap</button>', { label: 'Tampilan' });
  }

  function sheetKelasBaru() {
    openSheet('<h2>Tambah kelas</h2>' +
      '<form class="stack" style="gap:14px" data-form="kelas-baru" novalidate>' +
        '<label class="field"><span>Nama kelas</span><input class="input" name="nama" placeholder="4 Bestari" required></label>' +
        '<label class="field"><span>Subjek</span><input class="input" name="subjek" placeholder="Matematik"></label>' +
        '<div class="field"><span>Warna</span><div class="swatches">' + swatches(S.kelas.length % WARNA.length) + '</div><input type="hidden" name="warna" value="' + (S.kelas.length % WARNA.length) + '"></div>' +
        '<p class="error" data-err></p>' +
        '<button class="btn block" type="submit">Tambah kelas</button>' +
      '</form>', { label: 'Tambah kelas', focus: 'input[name=nama]' });
  }
  function swatches(sel) {
    return WARNA.map(function (w, i) { return '<button type="button" class="swatch" data-act="pilih-warna" data-warna="' + i + '" aria-pressed="' + (i === sel) + '" aria-label="Warna ' + (i + 1) + '" style="background:' + w.g + '"></button>'; }).join('');
  }

  /* ---------- Halaman kelas ---------- */
  function renderKelas(id) {
    var k = cariKelas(id);
    if (!k) return go('#/');
    var w = warna(k.warna), bil = bilMurid(k.id);
    $app.innerHTML = '<div class="page">' +
      '<div class="banner" style="background:' + w.g + '">' +
        '<span class="deco" style="right:-26px;top:-30px;width:120px;height:120px;background:' + w.dot + ';opacity:.9"></span>' +
        '<span class="deco" style="right:58px;bottom:-34px;width:74px;height:74px;background:' + w.d2 + ';opacity:.85"></span>' +
        '<div class="row" style="gap:12px;align-items:flex-start">' +
          '<a class="banner-btn" href="#/" aria-label="Kembali ke senarai kelas">' + I.back + '</a>' +
          '<div class="grow stack" style="gap:6px"><h1>' + esc(k.nama) + '</h1><div class="row" style="gap:6px;flex-wrap:wrap">' +
            (k.subjek ? '<span class="chip pill">' + esc(k.subjek) + '</span>' : '') +
            '<button class="chip pill-btn" data-act="senarai-murid" data-id="' + k.id + '">' + bil + ' murid ' + I.chev.replace('width="18" height="18"', 'width="12" height="12"') + '</button></div></div>' +
          '<button class="banner-btn" data-act="senarai-murid" data-id="' + k.id + '" data-cari="1" aria-label="Cari murid dalam kelas ini">' + I.search + '</button>' +
        '</div>' +
        '<div class="alert-grid dua">' +
          '<button class="alert" data-act="alert-lama" data-id="' + k.id + '"><b style="color:#DC2626" data-lama>…</b><span>Lama tak hadir</span></button>' +
          '<button class="alert" data-act="alert-kr" data-id="' + k.id + '"><b style="color:#EA580C" data-kr>…</b><span>KR tak siap</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="modul-grid">' + MODUL.map(function (m) {
        var inner = logo(m.id, 64) + '<strong>' + m.nama + '</strong><small>' + m.desc + '</small>';
        if (m.id === 'urus') return '<a class="modul" href="#/urus/kelas/' + k.id + '">' + inner + '</a>';
        if (m.id === 'profil') return '<button class="modul" data-act="senarai-murid" data-id="' + k.id + '">' + inner + '</button>';
        return '<a class="modul" href="#/modul/' + m.id + '/' + k.id + '">' + inner + '</a>';
      }).join('') + '</div>' +
      '<div class="scan-wrap"><button class="scan-btn" data-act="scan">' + I.qr + 'Scan QR murid</button></div>' +
    '</div>';
    muatLamaTakHadir(k.id);
    muatKrTertunggak(k.id);
  }

  /* Kotak "Lama tak hadir": murid tidak hadir 3 rekod terakhir berturut-turut. */
  var LAMA_N = 3;
  async function muatLamaTakHadir(kelasId) {
    var r = await sb.rpc('lama_tak_hadir', { p_kelas: kelasId, p_n: LAMA_N });
    var el = $app.querySelector('[data-lama]');
    if (!el) return;
    if (r.error) { el.textContent = '–'; return; }
    S.lamaTakHadir = { kelasId: kelasId, ids: (r.data || []).map(function (x) { return x.murid_id; }) };
    el.textContent = String(S.lamaTakHadir.ids.length);
  }

  function sheetLamaTakHadir(kelasId) {
    var k = cariKelas(kelasId);
    var ids = (S.lamaTakHadir && S.lamaTakHadir.kelasId === kelasId) ? S.lamaTakHadir.ids : [];
    var list = muridKelas(kelasId).filter(function (m) { return ids.indexOf(m.id) >= 0; });
    openSheet('<div class="between"><h2>Lama tak hadir</h2><button class="icon-sm" data-act="sheet-close" aria-label="Tutup">' + I.close + '</button></div>' +
      '<p class="sub" style="margin:0">Murid yang tidak hadir dalam ' + LAMA_N + ' rekod kehadiran terakhir ' + esc(k ? k.nama : '') + ' secara berturut-turut.</p>' +
      '<div class="sheet-scroll">' + (list.length ? list.map(function (m) {
        return '<button class="list-row" data-act="profil-murid" data-id="' + m.id + '"><span class="murid-av" style="width:36px;height:36px;font-size:13px;background:#FEE2E2;color:#B91C1C">' + esc(inisial(m.nama)) + '</span><span class="grow" style="font-size:15px;font-weight:600">' + esc(m.nama) + '</span><span class="muted">' + I.chev + '</span></button>';
      }).join('') : '<p class="sub" style="padding:12px 2px">Tiada murid. Bagus!</p>') + '</div>',
      { label: 'Lama tak hadir' });
  }

  function sheetMurid(kelasId, fokusCari) {
    var k = cariKelas(kelasId);
    if (!k) return;
    openSheet(
      '<div class="between"><h2>Murid ' + esc(k.nama) + ' <span style="color:var(--acc)" data-bil>(' + bilMurid(k.id) + ')</span></h2><button class="icon-sm" data-act="sheet-close" aria-label="Tutup senarai">' + I.close + '</button></div>' +
      '<label class="search" style="box-shadow:none;background:var(--soft)">' + I.search + '<span class="sr">Cari nama murid</span><input type="search" data-input="cari-murid" data-id="' + k.id + '" placeholder="Cari nama murid" autocomplete="off"></label>' +
      '<div class="sheet-scroll" data-murid-list>' + senaraiMuridHtml(k.id, '') + '</div>' +
      '<a class="btn secondary block" href="#/urus/kelas/' + k.id + '">Manage murid kelas ini</a>',
      { tall: true, label: 'Senarai murid', focus: fokusCari ? 'input[data-input=cari-murid]' : null });
  }
  function senaraiMuridHtml(kelasId, q) {
    var list = muridKelas(kelasId).filter(function (m) { return !q || m.nama.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    if (!list.length) return '<p class="sub" style="padding:12px 2px">' + (q ? 'Tiada murid sepadan.' : 'Belum ada murid. Tambah murid melalui Manage.') + '</p>';
    return list.map(function (m, i) {
      return '<button class="list-row" data-act="profil-murid" data-id="' + m.id + '"><span style="width:24px;font-size:12px;font-weight:700;color:var(--muted)">' + (m.no || i + 1) + '</span><span class="murid-av" style="width:36px;height:36px;font-size:13px">' + esc(inisial(m.nama)) + '</span><span class="grow" style="font-size:15px;font-weight:600">' + esc(m.nama) + '</span><span class="muted">' + I.chev + '</span></button>';
    }).join('');
  }

  /* ---------- AttendX ---------- */
  var SEBAB = ['MC', 'Ponteng', 'Aktiviti sekolah', 'Cuti', 'Lain-lain'];

  async function renderAttendX(kelasId, tarikh) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/');
    var hari = hariIni();
    var t = /^\d{4}-\d{2}-\d{2}$/.test(tarikh || '') ? tarikh : hari;
    if (t > hari) t = hari;
    $app.innerHTML = '<div class="page"><div class="row"><a class="icon-btn" href="#/kelas/' + k.id + '" aria-label="Kembali">' + I.back + '</a><div class="row" style="gap:10px">' + logo('attendx', 40) + '<div><h2>AttendX</h2><span class="sub">' + esc(k.nama + (k.subjek ? ' · ' + k.subjek : '')) + '</span></div></div></div><p class="sub">Memuatkan…</p></div>';
    var res = await Promise.all([
      sb.from('kehadiran').select('murid_id,hadir,sebab').eq('kelas_id', k.id).eq('tarikh', t),
      sb.rpc('ringkasan_kehadiran', { p_kelas: k.id, p_had: 30 })
    ]);
    var luar = !!(res[0].error && rangkaianGagal(res[0].error));
    if (res[0].error && !luar) throw res[0].error;
    if (location.hash.indexOf('#/modul/attendx/' + k.id) !== 0) return;
    var cKey = 'et_cache_ax_' + uid() + '_' + k.id, rows = {}, tahu = !luar;
    if (!luar) {
      (res[0].data || []).forEach(function (r) { rows[r.murid_id] = { hadir: r.hadir, sebab: r.sebab }; });
      simpanLS(cKey, { tarikh: t, rows: rows });
    } else {
      var c = bacaLS(cKey, null);
      if (c && c.tarikh === t) { rows = c.rows || {}; tahu = true; }
    }
    rekodLuar('kehadiran', function (r) { return r.kelas_id === k.id && r.tarikh === t; }).forEach(function (r) { rows[r.murid_id] = { hadir: r.hadir, sebab: r.sebab }; });
    var ada = Object.keys(rows).length > 0;
    S.ax = { kelasId: k.id, tarikh: t, rows: rows, ada: ada, sejarah: res[1].error ? ((S.ax && S.ax.kelasId === k.id && S.ax.sejarah) || []) : (res[1].data || []), luar: luar, tahu: tahu || ada };
    lukisAttendX();
  }

  function lukisAttendX() {
    var ax = S.ax, k = cariKelas(ax.kelasId), hari = hariIni();
    var murid = muridKelas(k.id);
    var tak = murid.filter(function (m) { return ax.rows[m.id] && ax.rows[m.id].hadir === false; }).length;
    var lepas = tambahHari(ax.tarikh, -1), depan = tambahHari(ax.tarikh, 1);
    $app.innerHTML = '<div class="page">' +
      '<div class="row"><a class="icon-btn" href="#/kelas/' + k.id + '" aria-label="Kembali">' + I.back + '</a><div class="row" style="gap:10px">' + logo('attendx', 40) + '<div><h2>AttendX</h2><span class="sub">' + esc(k.nama + (k.subjek ? ' · ' + k.subjek : '')) + '</span></div></div></div>' +
      '<div data-outbox>' + htmlOutbox() + '</div>' +
      (ax.luar ? '<div class="card luar-nota">' + (ax.tahu ? 'Tiada internet. Rekod disimpan dalam telefon dan dihantar automatik bila ada isyarat.' : '<b>Tiada internet</b> dan rekod tarikh ini belum pernah dibuka di telefon ini. Jika kehadiran hari ini sudah direkod sebelum ini (di telefon lain), tunggu ada internet supaya rekod itu tidak tertindih.') + '</div>' : '') +

      '<div class="card between" style="padding:8px">' +
        '<a class="icon-sm" href="#/modul/attendx/' + k.id + '/' + lepas + '" aria-label="Hari sebelumnya">' + I.back + '</a>' +
        '<b style="font-size:15px;text-align:center">' + esc(labelTarikh(ax.tarikh, true)) + '</b>' +
        (ax.tarikh < hari ? '<a class="icon-sm" href="#/modul/attendx/' + k.id + '/' + depan + '" aria-label="Hari seterusnya">' + I.chev + '</a>' : '<span style="width:40px"></span>') +
      '</div>' +

      '<div class="card between" style="padding:14px 16px">' +
        '<div class="row" style="align-items:baseline;gap:6px"><span style="font-size:30px;font-weight:800;color:var(--acc)" data-ax-hadir>' + (ax.ada ? murid.length - tak : '–') + '</span><span class="sub">/ ' + murid.length + ' hadir</span></div>' +
        (ax.ada
          ? (rekodLuar('kehadiran', function (r) { return r.kelas_id === ax.kelasId && r.tarikh === ax.tarikh; }).length
            ? '<span class="chip" style="background:#FEF3C7;color:#92400E" data-ax-status>⏳ Dalam telefon</span>'
            : '<span class="chip" style="background:var(--tint-now);color:var(--ok)" data-ax-status>' + I.check + ' Disimpan</span>')
          : '<span class="chip" style="background:#FEF3C7;color:#92400E" data-ax-status>Belum direkod</span>') +
      '</div>' +

      (murid.length
        ? (!ax.ada
            ? '<button class="btn block" data-act="ax-semua" data-ax-semua>' + I.check + ' Semua hadir</button>' +
              '<p class="sub" style="margin:0">Tekan <b>Semua hadir</b> dahulu, kemudian tekan nama murid yang tidak hadir.</p>'
            : '<p class="sub" style="margin:0">Tekan nama murid yang <b>tidak hadir</b>. Tekan lama untuk pilih sebab.</p>') +
          '<div class="ax-grid' + (ax.ada ? '' : ' belum') + '" data-ax-grid>' + gridAttendX(murid) + '</div>'
        : '<div class="card empty"><p class="sub">Belum ada murid dalam kelas ini.</p><a class="btn" href="#/urus/kelas/' + k.id + '">Tambah murid</a></div>') +

      '<span class="section-title" style="margin-top:6px">Sejarah</span>' +
      (ax.sejarah.length ? '<div class="card list-card">' + ax.sejarah.map(function (s) {
        var on = s.tarikh === ax.tarikh;
        return '<a class="list-item" href="#/modul/attendx/' + k.id + '/' + s.tarikh + '"' + (on ? ' style="background:var(--tint-now)"' : '') + '><span class="grow"><b style="display:block;font-size:14px">' + esc(labelTarikh(s.tarikh, true)) + '</b><span class="sub">' + (s.jumlah - s.tidak_hadir) + '/' + s.jumlah + ' hadir' + (s.tidak_hadir ? ' · ' + s.tidak_hadir + ' tidak hadir' : '') + '</span></span><span class="muted">' + I.chev + '</span></a>';
      }).join('') + '</div>' : '<p class="sub">Belum ada rekod kehadiran untuk kelas ini.</p>') +
    '</div>';
  }

  function gridAttendX(murid) {
    var ax = S.ax;
    return murid.map(function (m, i) {
      var r = ax.rows[m.id], off = r && r.hadir === false, on = ax.ada && !off;
      return '<button class="ax-kad' + (off ? ' off' : on ? ' on' : '') + '" data-ax-murid="' + m.id + '" aria-pressed="' + !!off + '" aria-label="' + esc(m.nama) + (off ? ', tidak hadir' : on ? ', hadir' : ', belum ditanda') + '">' +
        '<span class="ax-nama">' + (m.no || i + 1) + '. ' + esc(namaPendek(m.nama)) + '</span>' +
        '<span class="ax-st">' + (off ? '✗ ' + esc(r.sebab || 'Tidak hadir') : on ? '✓ Hadir' : '') + '</span></button>';
    }).join('');
  }

  function segarAttendX() {
    var ax = S.ax, k = cariKelas(ax.kelasId), murid = muridKelas(k.id);
    var tak = murid.filter(function (m) { return ax.rows[m.id] && ax.rows[m.id].hadir === false; }).length;
    var g = $app.querySelector('[data-ax-grid]'); if (g) g.innerHTML = gridAttendX(murid);
    var h = $app.querySelector('[data-ax-hadir]'); if (h) h.textContent = ax.ada ? String(murid.length - tak) : '–';
    var stc = $app.querySelector('[data-ax-status]');
    if (stc && ax.ada) { var dlm = rekodLuar('kehadiran', function (r) { return r.kelas_id === ax.kelasId && r.tarikh === ax.tarikh; }).length; stc.outerHTML = dlm ? '<span class="chip" style="background:#FEF3C7;color:#92400E" data-ax-status>⏳ Dalam telefon</span>' : '<span class="chip" style="background:var(--tint-now);color:var(--ok)" data-ax-status>' + I.check + ' Disimpan</span>'; }
  }

  /* Simpan satu murid. Jika hari ini belum direkod, cipta rekod untuk SEMUA murid sekali gus. */
  async function setHadir(muridId, hadir, sebab) {
    hadir = hadir === true;
    var ax = S.ax, k = cariKelas(ax.kelasId);
    var sebelum = JSON.parse(JSON.stringify(ax.rows)), adaSebelum = ax.ada;
    var payload;
    if (!ax.ada) {
      payload = muridKelas(k.id).map(function (m) {
        var me = m.id === muridId;
        return { kelas_id: k.id, murid_id: m.id, tarikh: ax.tarikh, hadir: me ? hadir : true, sebab: me && !hadir ? (sebab || null) : null };
      });
      payload.forEach(function (p) { ax.rows[p.murid_id] = { hadir: p.hadir, sebab: p.sebab }; });
    } else {
      payload = [{ kelas_id: k.id, murid_id: muridId, tarikh: ax.tarikh, hadir: hadir, sebab: hadir ? null : (sebab || null) }];
      ax.rows[muridId] = { hadir: hadir, sebab: payload[0].sebab };
    }
    segarAttendX();
    var r = await simpanRekod('kehadiran', payload);
    if (r.error) {
      ax.rows = sebelum; ax.ada = adaSebelum; segarAttendX();
      toast('Tidak disimpan: ' + errMsg(r.error));
      return;
    }
    maklumLuarTalian(r);
    if (!adaSebelum) { ax.ada = true; if (r.luar) lukisAttendX(); else await muatSejarah(); }
    else kemasSejarahSetempat();
  }

  async function simpanSemuaHadir() {
    var ax = S.ax, k = cariKelas(ax.kelasId);
    var payload = muridKelas(k.id).map(function (m) { return { kelas_id: k.id, murid_id: m.id, tarikh: ax.tarikh, hadir: true, sebab: null }; });
    var r = await simpanRekod('kehadiran', payload);
    if (r.error) { toast('Tidak disimpan: ' + errMsg(r.error)); return; }
    payload.forEach(function (p) { ax.rows[p.murid_id] = { hadir: true, sebab: null }; });
    ax.ada = true;
    if (r.luar) { lukisAttendX(); maklumLuarTalian(r); return; }
    await muatSejarah();
    toast('Semua hadir. Tekan nama murid yang tidak hadir.');
  }

  async function muatSejarah() {
    var r = await sb.rpc('ringkasan_kehadiran', { p_kelas: S.ax.kelasId, p_had: 30 });
    if (!r.error) S.ax.sejarah = r.data || [];
    lukisAttendX();
  }
  function kemasSejarahSetempat() {
    var ax = S.ax, murid = muridKelas(ax.kelasId);
    var tak = murid.filter(function (m) { return ax.rows[m.id] && ax.rows[m.id].hadir === false; }).length;
    ax.sejarah.forEach(function (s) { if (s.tarikh === ax.tarikh) { s.jumlah = murid.length; s.tidak_hadir = tak; } });
    var items = $app.querySelectorAll('.list-card .list-item');
    ax.sejarah.forEach(function (s, i) {
      if (s.tarikh === ax.tarikh && items[i]) {
        var sub = items[i].querySelector('.sub');
        if (sub) sub.textContent = (s.jumlah - s.tidak_hadir) + '/' + s.jumlah + ' hadir' + (s.tidak_hadir ? ' · ' + s.tidak_hadir + ' tidak hadir' : '');
      }
    });
  }

  function sheetSebab(muridId) {
    var m = muridKelas(S.ax.kelasId).filter(function (x) { return x.id === muridId; })[0];
    if (!m) return;
    var r = S.ax.rows[muridId];
    openSheet('<h2>' + esc(m.nama) + '</h2><p class="sub" style="margin:0">' + esc(labelTarikh(S.ax.tarikh, true)) + '</p>' +
      '<div class="stack" style="gap:8px">' +
        '<button class="btn secondary block" data-act="ax-pilih" data-id="' + m.id + '" data-hadir="1">Hadir</button>' +
        '<button class="btn block" style="background:#EA580C" data-act="ax-pilih" data-id="' + m.id + '" data-hadir="0">Tidak hadir (tiada sebab)</button>' +
        '<span class="section-title" style="margin-top:6px">Tidak hadir kerana</span>' +
        '<div class="theme-grid">' + SEBAB.map(function (s) {
          var on = r && r.hadir === false && r.sebab === s;
          return '<button class="theme-opt" style="align-items:center;min-height:48px" aria-pressed="' + on + '" data-act="ax-pilih" data-id="' + m.id + '" data-hadir="0" data-sebab="' + esc(s) + '">' + esc(s) + '</button>';
        }).join('') + '</div>' +
      '</div>', { label: 'Sebab tidak hadir' });
  }

  /* Tekan = tukar hadir/tidak hadir. Tekan lama (0.5 saat) = pilih sebab. */
  var tekanLama = { timer: null, fired: false };
  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('[data-ax-murid]');
    if (!el) return;
    tekanLama.fired = false;
    clearTimeout(tekanLama.timer);
    if (!S.ax || !S.ax.ada) return;
    tekanLama.timer = setTimeout(function () {
      tekanLama.fired = true;
      if (navigator.vibrate) navigator.vibrate(30);
      sheetSebab(el.dataset.axMurid);
    }, 500);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    document.addEventListener(ev, function () { clearTimeout(tekanLama.timer); }, true);
  });
  document.addEventListener('contextmenu', function (e) { if (e.target.closest('[data-ax-murid]')) e.preventDefault(); });
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-ax-murid]');
    if (!el) return;
    if (tekanLama.fired) { tekanLama.fired = false; return; }
    if (!S.ax.ada) {
      toast('Tekan "Semua hadir" dahulu.');
      var b = $app.querySelector('[data-ax-semua]');
      if (b) { b.classList.remove('goyang'); void b.offsetWidth; b.classList.add('goyang'); }
      return;
    }
    var id = el.dataset.axMurid, r = S.ax.rows[id];
    var kiniTak = !!(r && r.hadir === false);
    setHadir(id, kiniTak, null); // tidak hadir -> hadir, hadir -> tidak hadir
  });

  /* ---------- KR tak siap (banner) ---------- */
  async function muatKrTertunggak(kelasId) {
    var r = await sb.rpc('kr_tertunggak', { p_kelas: kelasId });
    var el = $app.querySelector('[data-kr]');
    if (!el) return;
    if (r.error) { el.textContent = '–'; return; }
    S.krTertunggak = { kelasId: kelasId, rows: r.data || [] };
    el.textContent = String(S.krTertunggak.rows.length);
  }

  function sheetKrTertunggak(kelasId) {
    var rows = (S.krTertunggak && S.krTertunggak.kelasId === kelasId) ? S.krTertunggak.rows : [];
    var bil = {}; rows.forEach(function (x) { bil[x.murid_id] = x.bil; });
    var list = muridKelas(kelasId).filter(function (m) { return bil[m.id]; });
    openSheet('<div class="between"><h2>KR tak siap</h2><button class="icon-sm" data-act="sheet-close" aria-label="Tutup">' + I.close + '</button></div>' +
      '<p class="sub" style="margin:0">Murid yang masih ada kerja rumah Tidak siap. Nama hilang sendiri bila semua sudah dihantar.</p>' +
      '<div class="sheet-scroll">' + (list.length ? list.map(function (m) {
        return '<button class="list-row" data-act="profil-murid" data-id="' + m.id + '"><span class="murid-av" style="width:36px;height:36px;font-size:13px;background:#FFEDD5;color:#C2410C">' + esc(inisial(m.nama)) + '</span><span class="grow" style="font-size:15px;font-weight:600">' + esc(m.nama) + '</span><span class="chip" style="background:#FFEDD5;color:#C2410C">' + bil[m.id] + ' tugasan</span></button>';
      }).join('') : '<p class="sub" style="padding:12px 2px">Tiada murid. Semua sudah siap!</p>') + '</div>',
      { label: 'KR tak siap' });
  }

  /* ---------- TaskTrack: senarai tugasan ---------- */
  function kepalaModul(k, id, nama, balik) {
    return '<div class="row"><a class="icon-btn" href="' + (balik || '#/kelas/' + k.id) + '" aria-label="Kembali">' + I.back + '</a><div class="row" style="gap:10px">' + logo(id, 40) + '<div><h2>' + nama + '</h2><span class="sub">' + esc(k.nama + (k.subjek ? ' · ' + k.subjek : '')) + '</span></div></div></div>';
  }

  async function renderTaskTrack(kelasId) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/');
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'tasktrack', 'TaskTrack') + '<p class="sub">Memuatkan…</p></div>';
    var r = await sb.rpc('ringkasan_tugasan', { p_kelas: k.id, p_had: 100 });
    var luar = !!(r.error && rangkaianGagal(r.error)), cKey = 'et_cache_ttl_' + uid() + '_' + k.id;
    if (r.error && !luar) throw r.error;
    if (location.hash !== '#/modul/tasktrack/' + k.id) return;
    var bil = muridKelas(k.id).length, list = luar ? bacaLS(cKey, []) : (r.data || []);
    if (!luar) simpanLS(cKey, list.slice(0, 30));
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'tasktrack', 'TaskTrack') +
      '<div data-outbox>' + htmlOutbox() + '</div>' +
      (luar ? '<div class="card luar-nota">Tiada internet. Senarai ini salinan terakhir dalam telefon; tugasan baharu perlu internet.</div>' : '') +
      '<button class="btn block" data-act="tt-baru" data-id="' + k.id + '">+ Tugasan baharu</button>' +
      (list.length ? '<div class="card list-card">' + list.map(function (t) {
        var info = t.ditanda ? t.siap + '/' + bil + ' siap' : 'Belum ditanda';
        return '<a class="list-item" href="#/modul/tasktrack/' + k.id + '/' + t.id + '"><span class="grow"><b style="display:block;font-size:15px">' + esc(t.tajuk) + '</b><span class="sub">' + esc(labelTarikh(t.tarikh, true)) + ' · ' + info + '</span></span>' +
          (t.tidak_siap ? '<span class="chip" style="background:#FFEDD5;color:#C2410C">' + t.tidak_siap + ' tak siap</span>' : (t.ditanda ? '<span class="chip" style="background:var(--tint-now);color:var(--ok)">' + I.check + '</span>' : '')) +
          '<span class="muted">' + I.chev + '</span></a>';
      }).join('') + '</div>'
      : '<div class="card empty"><p class="sub">Belum ada tugasan. Tekan <b>+ Tugasan baharu</b> untuk mula.</p></div>') +
    '</div>';
  }

  function sheetTugasanBaru(kelasId, t) {
    openSheet('<h2>' + (t ? 'Ubah tajuk' : 'Tugasan baharu') + '</h2>' +
      '<form class="stack" style="gap:14px" data-form="tugasan" data-kelas="' + kelasId + '"' + (t ? ' data-id="' + t.id + '"' : '') + ' novalidate>' +
        '<label class="field"><span>Tajuk</span><input class="input" name="tajuk" maxlength="120" placeholder="cth. Latihan m/s 34" value="' + (t ? esc(t.tajuk) : '') + '" required></label>' +
        '<p class="error" data-err></p><button class="btn block" type="submit">' + (t ? 'Simpan' : 'Cipta') + '</button></form>',
      { label: t ? 'Ubah tajuk' : 'Tugasan baharu', focus: 'input[name=tajuk]' });
  }

  async function simpanTugasan(form) {
    var err = form.querySelector('[data-err]'), btn = form.querySelector('[type=submit]');
    var tajuk = form.tajuk.value.trim();
    if (!tajuk) { err.textContent = 'Tajuk tidak boleh kosong.'; return; }
    btn.disabled = true;
    var kelasId = form.dataset.kelas, id = form.dataset.id;
    var r = id
      ? await sb.from('tugasan').update({ tajuk: tajuk }).eq('id', id)
      : await sb.from('tugasan').insert({ kelas_id: kelasId, tajuk: tajuk, tarikh: hariIni() }).select('id').single();
    btn.disabled = false;
    if (r.error) { err.textContent = errMsg(r.error); return; }
    closeSheet();
    if (id) { if (S.tt && S.tt.tugasan.id === id) { S.tt.tugasan.tajuk = tajuk; lukisTugasan(); } toast('Tajuk dikemas kini.'); }
    else go('#/modul/tasktrack/' + kelasId + '/' + r.data.id);
  }

  async function padamTugasan() {
    var tt = S.tt;
    if (!confirm('Padam tugasan "' + tt.tugasan.tajuk + '"?\nSemua tanda Siap / Tidak siap untuk tugasan ini akan hilang dan tidak boleh dikembalikan.')) return;
    var r = await sb.from('tugasan').delete().eq('id', tt.tugasan.id);
    if (r.error) { toast(errMsg(r.error)); return; }
    toast('Tugasan dipadam.');
    go('#/modul/tasktrack/' + tt.kelasId);
  }

  /* ---------- TaskTrack: satu tugasan ---------- */
  async function muatTugasan(kelasId, tugasanId) {
    var res = await Promise.all([
      sb.from('tugasan').select('id,tajuk,tarikh,kelas_id').eq('id', tugasanId).maybeSingle(),
      sb.from('status_tugasan').select('murid_id,siap').eq('tugasan_id', tugasanId)
    ]);
    var e = res[0].error || res[1].error, cKey = 'et_cache_tt_' + uid() + '_' + tugasanId, tugasan, rows = {}, luar = false;
    if (e) {
      var c = rangkaianGagal(e) && bacaLS(cKey, null);
      if (!c) throw e;
      tugasan = c.tugasan; rows = c.rows || {}; luar = true;
    } else {
      if (!res[0].data || res[0].data.kelas_id !== kelasId) return false;
      tugasan = res[0].data;
      (res[1].data || []).forEach(function (x) { rows[x.murid_id] = x.siap; });
      simpanLS(cKey, { tugasan: tugasan, rows: rows });
    }
    if (tugasan.kelas_id !== kelasId) return false;
    rekodLuar('status_tugasan', function (r) { return r.tugasan_id === tugasanId; }).forEach(function (r) { rows[r.murid_id] = r.siap; });
    S.tt = { kelasId: kelasId, tugasan: tugasan, rows: rows, luar: luar };
    return true;
  }

  async function renderTugasan(kelasId, tugasanId) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/');
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'tasktrack', 'TaskTrack', '#/modul/tasktrack/' + k.id) + '<p class="sub">Memuatkan…</p></div>';
    var ada = await muatTugasan(k.id, tugasanId);
    if (location.hash !== '#/modul/tasktrack/' + k.id + '/' + tugasanId) return;
    if (!ada) { toast('Tugasan tidak dijumpai.'); return go('#/modul/tasktrack/' + k.id); }
    lukisTugasan();
  }

  function kiraTT() {
    var tt = S.tt, murid = muridKelas(tt.kelasId), siap = 0, tak = 0, kosong = 0;
    murid.forEach(function (m) { var v = tt.rows[m.id]; if (v === true) siap++; else if (v === false) tak++; else kosong++; });
    return { murid: murid, siap: siap, tak: tak, kosong: kosong, mula: siap + tak > 0 };
  }

  function lukisTugasan() {
    var tt = S.tt, k = cariKelas(tt.kelasId), c = kiraTT();
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'tasktrack', 'TaskTrack', '#/modul/tasktrack/' + k.id) +
      '<div data-outbox>' + htmlOutbox() + '</div>' +
      (tt.luar ? '<div class="card luar-nota">Tiada internet. Tanda disimpan dalam telefon dan dihantar automatik bila ada isyarat.</div>' : '') +
      '<div class="card between" style="padding:12px 14px;gap:8px"><div class="grow" style="min-width:0"><b style="display:block;font-size:16px">' + esc(tt.tugasan.tajuk) + '</b><span class="sub">' + esc(labelTarikh(tt.tugasan.tarikh, true)) + '</span></div>' +
        '<button class="icon-sm" data-act="tt-ubah" aria-label="Ubah tajuk">' + I.edit + '</button><button class="icon-sm" data-act="tt-padam" aria-label="Padam tugasan" style="color:var(--danger)">' + I.trash + '</button></div>' +
      '<div class="card between" style="padding:14px 16px">' +
        '<div class="row" style="align-items:baseline;gap:6px"><span style="font-size:30px;font-weight:800;color:var(--acc)" data-tt-siap>' + (c.mula ? c.siap : '–') + '</span><span class="sub">/ ' + c.murid.length + ' siap</span></div>' +
        (c.tak ? '<span class="chip" style="background:#FFEDD5;color:#C2410C" data-tt-tak>' + c.tak + ' tidak siap</span>' : c.mula && !c.kosong ? '<span class="chip" style="background:var(--tint-now);color:var(--ok)" data-tt-tak>' + I.check + ' Semua siap</span>' : '<span class="chip" style="background:#FEF3C7;color:#92400E" data-tt-tak>' + (c.mula ? c.kosong + ' belum ditanda' : 'Belum ditanda') + '</span>') +
      '</div>' +
      (c.murid.length
        ? '<div class="tt-aksi">' +
            (c.kosong ? '<button class="btn" data-act="tt-semua" data-tt-semua>' + I.check + (c.mula ? ' Baki semua siap' : ' Semua siap') + '</button>' : '') +
            '<button class="btn secondary" data-act="tt-kutip">' + I.qr.replace(/width="34" height="34"/, 'width="22" height="22"') + ' Kutip Buku</button>' +
          '</div>' +
          '<p class="sub" style="margin:0">' + (c.mula ? 'Tekan nama murid untuk tukar <b>Siap / Tidak siap</b>.' : 'Tekan <b>Semua siap</b> lalu tekan nama yang tidak siap, atau guna <b>Kutip Buku</b> untuk scan buku yang dihantar.') + '</p>' +
          '<div class="ax-grid' + (c.mula ? '' : ' belum') + '" data-tt-grid>' + gridTugasan(c.murid) + '</div>'
        : '<div class="card empty"><p class="sub">Belum ada murid dalam kelas ini.</p><a class="btn" href="#/urus/kelas/' + k.id + '">Tambah murid</a></div>') +
    '</div>';
  }

  function gridTugasan(murid) {
    var tt = S.tt;
    return murid.map(function (m, i) {
      var v = tt.rows[m.id], on = v === true, off = v === false;
      return '<button class="ax-kad' + (off ? ' off' : on ? ' on' : '') + '" data-tt-murid="' + m.id + '" aria-label="' + esc(m.nama) + (off ? ', tidak siap' : on ? ', siap' : ', belum ditanda') + '">' +
        '<span class="ax-nama">' + (m.no || i + 1) + '. ' + esc(namaPendek(m.nama)) + '</span>' +
        '<span class="ax-st">' + (off ? '✗ Tidak siap' : on ? '✓ Siap' : '') + '</span></button>';
    }).join('');
  }

  async function simpanStatus(pasangan) {
    var tt = S.tt, sebelum = Object.assign({}, tt.rows);
    pasangan.forEach(function (p) { tt.rows[p[0]] = p[1]; });
    lukisTugasan();
    var r = await simpanRekod('status_tugasan', pasangan.map(function (p) {
      return { tugasan_id: tt.tugasan.id, murid_id: p[0], siap: p[1] };
    }));
    if (r.error) { tt.rows = sebelum; lukisTugasan(); toast('Tidak disimpan: ' + errMsg(r.error)); return false; }
    maklumLuarTalian(r);
    if (r.luar) lukisTugasan();
    return true;
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tt-murid]');
    if (!el || !S.tt) return;
    var c = kiraTT(), id = el.dataset.ttMurid, v = S.tt.rows[id];
    if (!c.mula) {
      toast('Tekan "Semua siap" atau "Kutip Buku" dahulu.');
      var b = $app.querySelector('[data-tt-semua]');
      if (b) { b.classList.remove('goyang'); void b.offsetWidth; b.classList.add('goyang'); }
      return;
    }
    simpanStatus([[id, v === false]]); // tidak siap -> siap; siap/kosong -> tidak siap
  });

  /* ---------- Kutip Buku: scan tanpa henti ---------- */
  var bunyi = null;
  function sediaBunyi() {
    try { if (!bunyi) bunyi = new (window.AudioContext || window.webkitAudioContext)(); if (bunyi.state === 'suspended') bunyi.resume(); } catch (e) { bunyi = null; }
  }
  function bip(tinggi) {
    if (!bunyi) return;
    try {
      var o = bunyi.createOscillator(), g = bunyi.createGain();
      o.frequency.value = tinggi ? 1320 : 330; o.type = 'sine';
      g.gain.setValueAtTime(0.25, bunyi.currentTime); g.gain.exponentialRampToValueAtTime(0.001, bunyi.currentTime + 0.15);
      o.connect(g); g.connect(bunyi.destination); o.start(); o.stop(bunyi.currentTime + 0.16);
    } catch (e) { /* abaikan */ }
  }

  async function renderKutip(kelasId, tugasanId) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/');
    if (!S.tt || S.tt.tugasan.id !== tugasanId) {
      if (!(await muatTugasan(kelasId, tugasanId))) return go('#/modul/tasktrack/' + kelasId);
    }
    var tt = S.tt, murid = muridKelas(kelasId), dalamKelas = {};
    murid.forEach(function (m) { dalamKelas[m.id] = m; });
    var sudah = {}; // murid yang sudah dikira dalam sesi ini
    $app.innerHTML = '<div class="scan-page">' +
      '<video playsinline muted></video>' +
      '<div class="scan-top"><button class="scan-btn-round" data-act="kutip-tutup" aria-label="Tutup">' + I.close + '</button><div style="text-align:center;min-width:0"><b style="display:block">Kutip Buku</b><span style="font-size:12px;opacity:.85">' + esc(tt.tugasan.tajuk) + '</span></div><span style="width:44px"></span></div>' +
      '<div class="scan-frame" aria-hidden="true"></div>' +
      '<div class="kutip-bawah">' +
        '<div class="kutip-kira"><b data-kutip-n>0</b><span>/ ' + murid.length + ' buku</span></div>' +
        '<div class="kutip-nama" data-kutip-msg>Halakan kamera ke QR buku. Scan terus satu demi satu.</div>' +
        '<div class="kutip-luar" data-kutip-luar></div>' +
        '<button class="btn block" data-act="kutip-selesai">Selesai</button>' +
      '</div>' +
    '</div>';
    var video = $app.querySelector('video'), msg = $app.querySelector('[data-kutip-msg]'), nEl = $app.querySelector('[data-kutip-n]');
    function kira() { nEl.textContent = String(murid.filter(function (m) { return tt.rows[m.id] === true; }).length); }
    function tunjuk(t, jenis) { msg.textContent = t; msg.className = 'kutip-nama' + (jenis ? ' ' + jenis : ''); }
    kira();
    if (!window.QrScanner) { tunjuk('Pembaca QR gagal dimuatkan. Muat semula app.', 'err'); return; }
    var abaiToken = {}; // QR bukan kelas ini: jangan ulang amaran setiap bingkai
    var sc = new window.QrScanner(video, function (res) {
      var t = ambilToken(res && res.data);
      if (!t || abaiToken[t]) return;
      var m = S.murid.filter(function (x) { return x.qr_token === t; })[0];
      if (!m || !dalamKelas[m.id]) {
        abaiToken[t] = true; setTimeout(function () { delete abaiToken[t]; }, 3000);
        bip(false); if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
        tunjuk(m ? m.nama + ' bukan murid kelas ini.' : 'QR ini bukan murid dalam senarai anda.', 'err');
        return;
      }
      if (sudah[m.id]) return; // buku sama: senyap
      sudah[m.id] = true;
      var lama = tt.rows[m.id];
      tt.rows[m.id] = true;
      bip(true); if (navigator.vibrate) navigator.vibrate(40);
      tunjuk('✓ ' + m.nama, 'ok'); kira();
      if (lama === true) return; // sudah siap dari awal
      simpanRekod('status_tugasan', [{ tugasan_id: tt.tugasan.id, murid_id: m.id, siap: true }]).then(function (r) {
        if (r.error) { tt.rows[m.id] = lama; delete sudah[m.id]; kira(); tunjuk('Tidak disimpan (' + m.nama + '): ' + errMsg(r.error), 'err'); }
        else if (r.luar) { var ob = $app.querySelector('[data-kutip-luar]'); if (ob) ob.textContent = 'Tiada internet: ' + kiraOutbox().tunggu + ' rekod disimpan dalam telefon'; }
      });
    }, { returnDetailedScanResult: true, preferredCamera: 'environment', maxScansPerSecond: 15, highlightScanRegion: false });
    S.scanner = sc;
    if (!navigator.mediaDevices) { tunjukRalatKamera(msg, 'NotSupported', 'kutip-nama'); return; }
    sc.start().then(kunciSkrin).catch(function (e) { tunjukRalatKamera(msg, e, 'kutip-nama'); });
  }

  async function selesaiKutip() {
    var tt = S.tt, murid = muridKelas(tt.kelasId);
    var baki = murid.filter(function (m) { return tt.rows[m.id] === undefined; });
    hentiScanner();
    if (baki.length) {
      var r = await simpanRekod('status_tugasan', baki.map(function (m) { return { tugasan_id: tt.tugasan.id, murid_id: m.id, siap: false }; }));
      maklumLuarTalian(r);
      if (r.error) { toast('Tidak disimpan: ' + errMsg(r.error)); return go('#/modul/tasktrack/' + tt.kelasId + '/' + tt.tugasan.id); }
      baki.forEach(function (m) { tt.rows[m.id] = false; });
    }
    var tak = murid.filter(function (m) { return tt.rows[m.id] === false; }).length;
    toast(tak ? tak + ' murid tidak hantar.' : 'Semua buku dihantar!');
    go('#/modul/tasktrack/' + tt.kelasId + '/' + tt.tugasan.id);
  }

  /* ---------- Assessment ---------- */
  /* TP ialah skala naik: satu warna, cerah (TP1) ke gelap (TP6). Label TP sentiasa ditulis. */
  var TP_WARNA = { 1: ['#EDE9FE', '#4C1D95'], 2: ['#DDD6FE', '#4C1D95'], 3: ['#C4B5FD', '#3B0764'], 4: ['#8B5CF6', '#FFFFFF'], 5: ['#6D28D9', '#FFFFFF'], 6: ['#4C1D95', '#FFFFFF'] };
  var JENIS = { kuiz: 'Kuiz', peperiksaan: 'Peperiksaan' };
  function subjekKunci(k) { return String((k && k.subjek) || '').trim().toLowerCase(); }
  function nomb(n) { n = Number(n); return Math.round(n * 10) / 10 + ''; }

  async function renderAssessment(kelasId, tab) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/');
    tab = ['pbd', 'kuiz', 'peperiksaan'].indexOf(tab) >= 0 ? tab : 'pbd';
    var hash = location.hash;
    var tabs = '<div class="seg">' + [['pbd', 'PBD'], ['kuiz', 'Kuiz'], ['peperiksaan', 'Peperiksaan']].map(function (t) {
      return '<button data-act="as-tab" data-id="' + k.id + '" data-tab="' + t[0] + '" aria-pressed="' + (t[0] === tab) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'assessment', 'Assessment') + tabs + '<p class="sub">Memuatkan…</p></div>';
    var bil = muridKelas(k.id).length, body;
    if (tab === 'pbd') {
      var r = await sb.rpc('ringkasan_pbd', { p_kelas: k.id });
      if (r.error) throw r.error;
      var list = r.data || [];
      body = '<button class="btn block" data-act="pbd-tulis" data-id="' + k.id + '">+ Tulis Bab</button>' +
        '<p class="sub" style="margin:0">Senarai Bab ini untuk subjek <b>' + esc(k.subjek || '(tiada subjek)') + '</b> dan dikongsi dengan semua kelas ' + esc(k.subjek || 'tanpa subjek') + ' anda.</p>' +
        (list.length ? '<div class="card list-card">' + list.map(function (it) {
          return '<a class="list-item" href="#/pbd/' + k.id + '/' + it.id + '"><span class="grow"><b style="display:block;font-size:15px">' + esc(it.tajuk) + '</b><span class="sub">' + (it.ditanda ? it.ditanda + '/' + bil + ' ditanda · purata TP ' + nomb(it.purata) : 'Belum ditanda') + '</span></span><span class="muted">' + I.chev + '</span></a>';
        }).join('') + '</div>' : '<div class="card empty"><p class="sub">Belum ada Bab. Tekan <b>+ Tulis Bab</b>. Boleh tampal banyak baris sekali gus.</p></div>');
    } else {
      var r2 = await sb.rpc('ringkasan_penilaian', { p_kelas: k.id, p_jenis: tab });
      if (r2.error) throw r2.error;
      await muatGred();
      var pl = r2.data || [];
      body = '<button class="btn block" data-act="nilai-baru" data-id="' + k.id + '" data-jenis="' + tab + '">+ ' + JENIS[tab] + ' baharu</button>' +
        '<button class="list-row card" style="padding:10px 14px" data-act="gred"><span class="grow"><b style="display:block;font-size:14px">Gred huruf</b><span class="sub">' + (S.gred ? ringkasGred() : 'Belum ditetapkan. Tekan untuk tetapkan.') + '</span></span>' + I.chev + '</button>' +
        (pl.length ? '<div class="card list-card">' + pl.map(function (p) {
          var pct = p.dimasuk ? Math.round(p.purata / p.markah_penuh * 100) : 0;
          return '<a class="list-item" href="#/nilai/' + k.id + '/' + p.id + '"><span class="grow"><b style="display:block;font-size:15px">' + esc(p.tajuk) + '</b><span class="sub">' + esc(labelTarikh(p.tarikh, true)) + ' · ' + (p.dimasuk ? p.dimasuk + '/' + bil + ' dimasuk · purata ' + nomb(p.purata) + '/' + nomb(p.markah_penuh) + ' (' + pct + '%' + (S.gred ? ', ' + esc(gredUntuk(pct)) : '') + ')' : 'Belum ada markah · /' + nomb(p.markah_penuh)) + '</span></span><span class="muted">' + I.chev + '</span></a>';
        }).join('') + '</div>' : '<div class="card empty"><p class="sub">Belum ada ' + JENIS[tab].toLowerCase() + '.</p></div>');
    }
    if (location.hash !== hash) return;
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'assessment', 'Assessment') + tabs + body + '</div>';
  }

  function sheetTulisBab(kelasId) {
    var k = cariKelas(kelasId);
    openSheet('<h2>Tulis Bab · ' + esc(k.subjek || 'tiada subjek') + '</h2>' +
      '<form class="stack" style="gap:14px" data-form="pbd-tulis" data-kelas="' + kelasId + '" novalidate>' +
        '<label class="field"><span>Satu Bab setiap baris (boleh tampal dari DSKP / Word)</span><textarea class="input" name="senarai" placeholder="Bab 1 Nombor Bulat&#10;Bab 2 Pecahan&#10;Bab 3 Perpuluhan"></textarea></label>' +
        '<p class="error" data-err></p><button class="btn block" type="submit">Simpan</button></form>',
      { label: 'Tulis Bab', focus: 'textarea' });
  }

  async function simpanBab(form) {
    var err = form.querySelector('[data-err]'), btn = form.querySelector('[type=submit]');
    var k = cariKelas(form.dataset.kelas);
    var baris = form.senarai.value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!baris.length) { err.textContent = 'Tulis sekurang-kurangnya satu Bab.'; return; }
    if (baris.some(function (x) { return x.length > 150; })) { err.textContent = 'Setiap Bab maksimum 150 aksara.'; return; }
    btn.disabled = true;
    var ada = await sb.rpc('ringkasan_pbd', { p_kelas: k.id });
    var mula = ((ada.data || []).reduce(function (m, x) { return Math.max(m, x.urutan || 0); }, 0)) + 1;
    var r = await sb.from('pbd_item').insert(baris.map(function (t, i) { return { subjek: subjekKunci(k), tajuk: t, urutan: mula + i }; }));
    btn.disabled = false;
    if (r.error) { err.textContent = errMsg(r.error); return; }
    closeSheet(); toast(baris.length + ' Bab disimpan.'); route();
  }

  /* PBD: satu Bab */
  async function renderPbdItem(kelasId, itemId) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/');
    var hash = location.hash;
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'assessment', 'PBD', '#/modul/assessment/' + k.id + '/pbd') + '<p class="sub">Memuatkan…</p></div>';
    var res = await Promise.all([
      sb.from('pbd_item').select('id,tajuk,subjek').eq('id', itemId).maybeSingle(),
      sb.from('pbd_tp').select('murid_id,tp').eq('item_id', itemId).eq('kelas_id', k.id)
    ]);
    if (res[0].error) throw res[0].error;
    if (res[1].error) throw res[1].error;
    if (location.hash !== hash) return;
    if (!res[0].data || res[0].data.subjek !== subjekKunci(k)) { toast('Bab tidak dijumpai.'); return go('#/modul/assessment/' + k.id + '/pbd'); }
    var rows = {};
    (res[1].data || []).forEach(function (x) { rows[x.murid_id] = x.tp; });
    S.pbd = { kelasId: k.id, item: res[0].data, rows: rows, pilih: (S.pbd && S.pbd.pilih) || 3 };
    lukisPbd();
  }

  function lukisPbd() {
    var p = S.pbd, k = cariKelas(p.kelasId), murid = muridKelas(k.id);
    var kira = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }, kosong = 0, jum = 0, n = 0;
    murid.forEach(function (m) { var t = p.rows[m.id]; if (t) { kira[t]++; jum += t; n++; } else kosong++; });
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'assessment', 'PBD', '#/modul/assessment/' + k.id + '/pbd') +
      '<div class="card between" style="padding:12px 14px;gap:8px"><div class="grow" style="min-width:0"><b style="display:block;font-size:16px">' + esc(p.item.tajuk) + '</b><span class="sub">' + (n ? n + '/' + murid.length + ' ditanda · purata TP ' + nomb(jum / n) : 'Belum ditanda') + '</span></div>' +
        '<button class="icon-sm" data-act="pbd-ubah" aria-label="Ubah tajuk Bab">' + I.edit + '</button><button class="icon-sm" data-act="pbd-padam" aria-label="Padam Bab" style="color:var(--danger)">' + I.trash + '</button></div>' +
      '<div class="tp-pilih" role="group" aria-label="Pilih TP">' + [1, 2, 3, 4, 5, 6].map(function (t) {
        var w = TP_WARNA[t], on = p.pilih === t;
        return '<button class="tp-btn" data-act="tp-pilih" data-tp="' + t + '" aria-pressed="' + on + '" style="background:' + w[0] + ';color:' + w[1] + '"><b>TP' + t + '</b><span>' + kira[t] + '</span></button>';
      }).join('') + '</div>' +
      (kosong && murid.length ? '<button class="btn block" data-act="tp-semua">' + I.check + ' Semua ' + (n ? 'baki ' : '') + '→ TP' + p.pilih + ' <span style="opacity:.8;font-weight:600">(' + kosong + ' murid)</span></button>' : '') +
      (murid.length
        ? '<p class="sub" style="margin:0">Pilih TP di atas, kemudian tekan nama murid. Tekan sekali lagi dengan TP yang sama untuk padam.</p>' +
          '<div class="ax-grid">' + murid.map(function (m, i) {
            var t = p.rows[m.id], w = t ? TP_WARNA[t] : null;
            return '<button class="ax-kad" data-pbd-murid="' + m.id + '"' + (w ? ' style="background:' + w[0] + ';border-color:' + (t >= 4 ? w[0] : '#8B5CF6') + ';color:' + w[1] + '"' : '') + ' aria-label="' + esc(m.nama) + (t ? ', TP' + t : ', belum ditanda') + '">' +
              '<span class="ax-nama">' + (m.no || i + 1) + '. ' + esc(namaPendek(m.nama)) + '</span><span class="ax-st">' + (t ? 'TP' + t : '') + '</span></button>';
          }).join('') + '</div>'
        : '<div class="card empty"><p class="sub">Belum ada murid dalam kelas ini.</p></div>') +
    '</div>';
  }

  async function simpanTp(pasangan) {
    var p = S.pbd, sebelum = Object.assign({}, p.rows);
    var buang = pasangan.filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; });
    var simpan = pasangan.filter(function (x) { return x[1]; });
    pasangan.forEach(function (x) { if (x[1]) p.rows[x[0]] = x[1]; else delete p.rows[x[0]]; });
    lukisPbd();
    var r1 = simpan.length ? await sb.from('pbd_tp').upsert(simpan.map(function (x) { return { item_id: p.item.id, murid_id: x[0], kelas_id: p.kelasId, tp: x[1] }; }), { onConflict: 'item_id,murid_id' }) : { error: null };
    var r2 = buang.length ? await sb.from('pbd_tp').delete().eq('item_id', p.item.id).in('murid_id', buang) : { error: null };
    var e = r1.error || r2.error;
    if (e) { p.rows = sebelum; lukisPbd(); toast('Tidak disimpan: ' + errMsg(e)); }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-pbd-murid]');
    if (!el || !S.pbd) return;
    var id = el.dataset.pbdMurid, kini = S.pbd.rows[id];
    simpanTp([[id, kini === S.pbd.pilih ? null : S.pbd.pilih]]);
  });

  function sheetUbahBab() {
    var it = S.pbd.item;
    openSheet('<h2>Ubah tajuk Bab</h2><form class="stack" style="gap:14px" data-form="pbd-ubah" novalidate><label class="field"><span>Tajuk</span><input class="input" name="tajuk" maxlength="150" value="' + esc(it.tajuk) + '" required></label><p class="sub" style="margin:0">Perubahan ini berlaku untuk semua kelas ' + esc(cariKelas(S.pbd.kelasId).subjek || '') + ' anda.</p><p class="error" data-err></p><button class="btn block" type="submit">Simpan</button></form>', { label: 'Ubah tajuk Bab', focus: 'input[name=tajuk]' });
  }
  async function padamBab() {
    var p = S.pbd, k = cariKelas(p.kelasId);
    if (!confirm('Padam Bab "' + p.item.tajuk + '"?\nBab ini akan hilang daripada SEMUA kelas ' + (k.subjek || '') + ' anda, bersama semua TP murid untuk Bab ini. Tidak boleh dikembalikan.')) return;
    var r = await sb.from('pbd_item').delete().eq('id', p.item.id);
    if (r.error) { toast(errMsg(r.error)); return; }
    toast('Bab dipadam.'); go('#/modul/assessment/' + k.id + '/pbd');
  }

  /* Kuiz / peperiksaan */
  function sheetPenilaian(kelasId, jenis, p) {
    openSheet('<h2>' + (p ? 'Ubah ' + JENIS[p.jenis].toLowerCase() : JENIS[jenis] + ' baharu') + '</h2>' +
      '<form class="stack" style="gap:14px" data-form="penilaian" data-kelas="' + kelasId + '" data-jenis="' + (p ? p.jenis : jenis) + '"' + (p ? ' data-id="' + p.id + '"' : '') + ' novalidate>' +
        '<label class="field"><span>Tajuk</span><input class="input" name="tajuk" maxlength="120" placeholder="' + (jenis === 'kuiz' || (p && p.jenis === 'kuiz') ? 'cth. Kuiz Bab 2' : 'cth. Ujian Pertengahan Tahun') + '" value="' + (p ? esc(p.tajuk) : '') + '" required></label>' +
        '<label class="field"><span>Markah penuh</span><input class="input" name="penuh" type="number" inputmode="decimal" min="1" max="1000" step="0.5" value="' + (p ? nomb(p.markah_penuh) : 100) + '" required></label>' +
        '<p class="error" data-err></p><button class="btn block" type="submit">' + (p ? 'Simpan' : 'Cipta') + '</button></form>',
      { label: 'Penilaian', focus: 'input[name=tajuk]' });
  }

  async function simpanPenilaian(form) {
    var err = form.querySelector('[data-err]'), btn = form.querySelector('[type=submit]');
    var tajuk = form.tajuk.value.trim(), penuh = parseFloat(form.penuh.value);
    if (!tajuk) { err.textContent = 'Tajuk tidak boleh kosong.'; return; }
    if (!(penuh > 0 && penuh <= 1000)) { err.textContent = 'Markah penuh mesti antara 1 dan 1000.'; return; }
    var id = form.dataset.id;
    if (id && S.nilai) {
      var tinggi = Object.keys(S.nilai.rows).reduce(function (m, k) { return Math.max(m, S.nilai.rows[k]); }, 0);
      if (tinggi > penuh) { err.textContent = 'Ada markah murid (' + nomb(tinggi) + ') lebih tinggi daripada markah penuh baharu.'; return; }
    }
    btn.disabled = true;
    var r = id
      ? await sb.from('penilaian').update({ tajuk: tajuk, markah_penuh: penuh }).eq('id', id)
      : await sb.from('penilaian').insert({ kelas_id: form.dataset.kelas, jenis: form.dataset.jenis, tajuk: tajuk, markah_penuh: penuh, tarikh: hariIni() }).select('id').single();
    btn.disabled = false;
    if (r.error) { err.textContent = errMsg(r.error); return; }
    closeSheet();
    if (id) { S.nilai.p.tajuk = tajuk; S.nilai.p.markah_penuh = penuh; lukisPenilaian(); toast('Dikemas kini.'); }
    else go('#/nilai/' + form.dataset.kelas + '/' + r.data.id);
  }

  async function renderPenilaian(kelasId, id) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/');
    var hash = location.hash;
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'assessment', 'Assessment', '#/modul/assessment/' + k.id) + '<p class="sub">Memuatkan…</p></div>';
    var res = await Promise.all([
      sb.from('penilaian').select('id,kelas_id,jenis,tajuk,markah_penuh,tarikh').eq('id', id).maybeSingle(),
      sb.from('markah').select('murid_id,markah').eq('penilaian_id', id)
    ]);
    if (res[0].error) throw res[0].error;
    if (res[1].error) throw res[1].error;
    if (location.hash !== hash) return;
    if (!res[0].data || res[0].data.kelas_id !== k.id) { toast('Tidak dijumpai.'); return go('#/modul/assessment/' + k.id); }
    var rows = {};
    (res[1].data || []).forEach(function (x) { rows[x.murid_id] = Number(x.markah); });
    await muatGred();
    S.nilai = { kelasId: k.id, p: res[0].data, rows: rows };
    lukisPenilaian();
  }

  /* Gred huruf: julat ditetapkan guru sendiri, disimpan dalam tetapan_guru.gred */
  async function muatGred(paksa) {
    if (S.gred !== undefined && !paksa) return S.gred;
    var r = await sb.from('tetapan_guru').select('gred').maybeSingle();
    if (r.error) { S.gred = null; return null; }
    S.gred = (r.data && r.data.gred) || null;
    return S.gred;
  }
  function gredUntuk(peratus) {
    if (!S.gred || peratus == null || isNaN(peratus)) return '';
    var g = S.gred.slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < g.length; i++) if (peratus >= g[i].min) return g[i].g;
    return '';
  }
  function ringkasGred() {
    return S.gred ? S.gred.slice().sort(function (a, b) { return b.min - a.min; }).map(function (x) { return esc(x.g) + ' ≥' + x.min + '%'; }).join(' · ') : '';
  }
  function sheetGred() {
    var g = (S.gred || []).slice().sort(function (a, b) { return b.min - a.min; });
    var baris = '';
    for (var i = 0; i < 8; i++) {
      var x = g[i] || {};
      baris += '<div class="gred-row"><input class="input" name="g' + i + '" maxlength="4" placeholder="' + (i === 0 ? 'cth. A' : '') + '" value="' + esc(x.g || '') + '" aria-label="Gred ' + (i + 1) + '"><span class="sub">jika ≥</span><input class="input" name="m' + i + '" type="number" inputmode="numeric" min="0" max="100" placeholder="' + (i === 0 ? '80' : '') + '" value="' + (x.min != null ? x.min : '') + '" aria-label="Peratus minimum gred ' + (i + 1) + '"><span class="sub">%</span></div>';
    }
    openSheet('<h2>Gred huruf</h2><p class="sub" style="margin:0">Tetapkan sendiri ikut panduan sekolah anda. Gred terendah mesti bermula dari 0%. Terpakai untuk semua kuiz dan peperiksaan anda.</p>' +
      '<form class="stack" style="gap:8px" data-form="gred" novalidate>' + baris +
        '<p class="error" data-err></p><button class="btn block" type="submit">Simpan</button><button class="btn ghost block" type="button" data-act="gred-kosong">Tidak guna gred</button></form>',
      { label: 'Gred huruf', tall: true });
  }
  async function simpanGred(form, kosong) {
    var err = form.querySelector('[data-err]'), g = [];
    if (!kosong) {
      for (var i = 0; i < 8; i++) {
        var a = form['g' + i].value.trim(), m = form['m' + i].value.trim();
        if (!a && !m) continue;
        if (!a || m === '') { err.textContent = 'Baris ' + (i + 1) + ': isi kedua-dua gred dan peratus.'; return; }
        var n = Number(m);
        if (!(n >= 0 && n <= 100) || Math.round(n) !== n) { err.textContent = 'Baris ' + (i + 1) + ': peratus mesti nombor bulat 0 hingga 100.'; return; }
        if (g.some(function (x) { return x.min === n; })) { err.textContent = 'Peratus ' + n + '% berulang.'; return; }
        g.push({ g: a, min: n });
      }
      if (!g.length) { err.textContent = 'Isi sekurang-kurangnya satu gred, atau tekan "Tidak guna gred".'; return; }
      if (!g.some(function (x) { return x.min === 0; })) { err.textContent = 'Gred terendah mesti bermula dari 0%.'; return; }
    }
    var r = await sb.from('tetapan_guru').upsert({ guru_id: S.session.user.id, gred: kosong ? null : g }, { onConflict: 'guru_id' });
    if (r.error) { err.textContent = errMsg(r.error); return; }
    S.gred = kosong ? null : g;
    closeSheet(); toast(kosong ? 'Gred tidak digunakan.' : 'Gred disimpan.'); route();
  }

  function statNilai() {
    var n = S.nilai, murid = muridKelas(n.kelasId);
    var v = murid.map(function (m) { return n.rows[m.id]; }).filter(function (x) { return x !== undefined; });
    if (!v.length) return 'Belum ada markah';
    var jum = v.reduce(function (a, b) { return a + b; }, 0), pen = Number(n.p.markah_penuh);
    var t = v.length + '/' + murid.length + ' dimasuk · purata <b>' + nomb(jum / v.length) + '</b> (' + Math.round(jum / v.length / pen * 100) + '%) · tertinggi ' + nomb(Math.max.apply(null, v)) + ' · terendah ' + nomb(Math.min.apply(null, v));
    if (S.gred) {
      var kira = {};
      v.forEach(function (x) { var g = gredUntuk(x / pen * 100); kira[g] = (kira[g] || 0) + 1; });
      t += '<br>Gred: ' + S.gred.slice().sort(function (a, b) { return b.min - a.min; }).map(function (x) { return '<b>' + esc(x.g) + '</b> ' + (kira[x.g] || 0); }).join(' · ');
    }
    return t;
  }

  function lukisPenilaian() {
    var n = S.nilai, k = cariKelas(n.kelasId), murid = muridKelas(k.id), pen = Number(n.p.markah_penuh);
    $app.innerHTML = '<div class="page">' + kepalaModul(k, 'assessment', JENIS[n.p.jenis], '#/modul/assessment/' + k.id + '/' + n.p.jenis) +
      '<div class="card between" style="padding:12px 14px;gap:8px"><div class="grow" style="min-width:0"><b style="display:block;font-size:16px">' + esc(n.p.tajuk) + '</b><span class="sub">' + esc(labelTarikh(n.p.tarikh, true)) + ' · markah penuh ' + nomb(pen) + '</span></div>' +
        '<button class="icon-sm" data-act="nilai-ubah" aria-label="Ubah">' + I.edit + '</button><button class="icon-sm" data-act="nilai-padam" aria-label="Padam" style="color:var(--danger)">' + I.trash + '</button></div>' +
      '<div class="card" style="padding:12px 14px"><span class="sub" data-nilai-stat>' + statNilai() + '</span></div>' +
      (murid.length ? '<p class="sub" style="margin:0">Taip markah, tekan <b>Next / Enter</b> untuk ke murid seterusnya. Kosongkan untuk padam.</p>' +
        '<div class="card list-card">' + murid.map(function (m, i) {
          var v = n.rows[m.id];
          return '<label class="list-item markah-row"><span class="grow" style="font-size:14px;font-weight:600">' + (m.no || i + 1) + '. ' + esc(m.nama) + '</span>' +
            '<input class="input markah-in" data-markah-murid="' + m.id + '" type="number" inputmode="decimal" enterkeyhint="next" min="0" max="' + pen + '" step="0.5" value="' + (v !== undefined ? nomb(v) : '') + '" aria-label="Markah ' + esc(m.nama) + '"><span class="sub" style="width:40px">/' + nomb(pen) + '</span>' +
            (S.gred ? '<b class="gred-chip" data-gred-murid="' + m.id + '">' + esc(v !== undefined ? gredUntuk(v / pen * 100) : '') + '</b>' : '') + '</label>';
        }).join('') + '</div>'
      : '<div class="card empty"><p class="sub">Belum ada murid dalam kelas ini.</p></div>') +
    '</div>';
  }

  async function simpanMarkah(input) {
    var n = S.nilai, id = input.dataset.markahMurid, pen = Number(n.p.markah_penuh);
    var raw = input.value.trim(), lama = n.rows[id];
    if (raw === '') {
      if (lama === undefined) return;
      delete n.rows[id];
      var rd = await sb.from('markah').delete().eq('penilaian_id', n.p.id).eq('murid_id', id);
      if (rd.error) { n.rows[id] = lama; input.value = nomb(lama); toast('Tidak dipadam: ' + errMsg(rd.error)); }
    } else {
      var v = parseFloat(raw.replace(',', '.'));
      if (isNaN(v) || v < 0 || v > pen) { input.classList.add('salah'); toast('Markah mesti antara 0 dan ' + nomb(pen) + '.'); return; }
      input.classList.remove('salah');
      if (lama === v) return;
      n.rows[id] = v;
      var r = await sb.from('markah').upsert({ penilaian_id: n.p.id, murid_id: id, markah: v }, { onConflict: 'penilaian_id,murid_id' });
      if (r.error) { if (lama === undefined) delete n.rows[id]; else n.rows[id] = lama; input.value = lama === undefined ? '' : nomb(lama); toast('Tidak disimpan: ' + errMsg(r.error)); }
      else { input.classList.add('ok'); setTimeout(function () { input.classList.remove('ok'); }, 900); }
    }
    var st = $app.querySelector('[data-nilai-stat]'); if (st) st.innerHTML = statNilai();
    var gc = $app.querySelector('[data-gred-murid="' + id + '"]'); if (gc) gc.textContent = n.rows[id] !== undefined ? gredUntuk(n.rows[id] / pen * 100) : '';
  }
  document.addEventListener('change', function (e) { if (e.target.matches && e.target.matches('[data-markah-murid]')) simpanMarkah(e.target); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('[data-markah-murid]')) return;
    e.preventDefault();
    var all = Array.prototype.slice.call($app.querySelectorAll('[data-markah-murid]')), i = all.indexOf(e.target);
    if (all[i + 1]) { all[i + 1].focus(); all[i + 1].select(); } else e.target.blur();
  });

  async function padamPenilaian() {
    var n = S.nilai;
    if (!confirm('Padam ' + JENIS[n.p.jenis].toLowerCase() + ' "' + n.p.tajuk + '"?\nSemua markah murid untuknya akan hilang dan tidak boleh dikembalikan.')) return;
    var r = await sb.from('penilaian').delete().eq('id', n.p.id);
    if (r.error) { toast(errMsg(r.error)); return; }
    toast('Dipadam.'); go('#/modul/assessment/' + n.kelasId + '/' + n.p.jenis);
  }

  /* ---------- Analisis ---------- */
  var TEMPOH = { '30': '30 hari', tahun: 'Tahun ini', semua: 'Semua' };
  function dariTempoh(t) {
    if (t === 'semua') return null;
    if (t === 'tahun') return new Date().getFullYear() + '-01-01';
    return tambahHari(hariIni(), -30);
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : null; }
  var HAD_ASAL = { had_hadir: 80, had_kr: 2, had_tp: 3, had_markah: 40 };

  async function muatAnalisis(k, tempoh) {
    var dari = dariTempoh(tempoh);
    var res = await Promise.all([
      sb.rpc('analisis_murid', { p_kelas: k.id, p_dari: dari }),
      sb.rpc('ringkasan_kehadiran', { p_kelas: k.id, p_had: 400 }),
      sb.rpc('ringkasan_tugasan', { p_kelas: k.id, p_had: 300 }),
      sb.rpc('taburan_pbd', { p_kelas: k.id }),
      sb.rpc('ringkasan_penilaian', { p_kelas: k.id, p_jenis: 'kuiz' }),
      sb.rpc('ringkasan_penilaian', { p_kelas: k.id, p_jenis: 'peperiksaan' }),
      sb.from('tetapan_guru').select('had_hadir,had_kr,had_tp,had_markah,gred').maybeSingle()
    ]);
    res.forEach(function (r) { if (r.error) throw r.error; });
    S.gred = (res[6].data && res[6].data.gred) || null;
    function lepas(x) { return !dari || x.tarikh >= dari; }
    var nilai = (res[4].data || []).map(function (p) { p.jenis = 'kuiz'; return p; })
      .concat((res[5].data || []).map(function (p) { p.jenis = 'peperiksaan'; return p; }))
      .filter(lepas).sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : -1; });
    return {
      kelasId: k.id, tempoh: tempoh, dari: dari,
      murid: res[0].data || [],
      hadir: (res[1].data || []).filter(lepas),
      tugasan: (res[2].data || []).filter(lepas),
      pbd: res[3].data || [],
      nilai: nilai,
      had: Object.assign({}, HAD_ASAL, res[6].data || {})
    };
  }

  function sebabPerhatian(x, had) {
    var r = [], ph = pct(x.hadir_ya, x.hadir_jum);
    if (x.hadir_jum && ph < had.had_hadir) r.push('Hadir ' + ph + '%');
    if (x.kr_tak >= had.had_kr) r.push(x.kr_tak + ' KR tak siap');
    if (x.tp_bil && Number(x.tp_purata) < Number(had.had_tp)) r.push('TP purata ' + nomb(x.tp_purata));
    if (x.mk_bil && Number(x.mk_pct) < had.had_markah) r.push('Markah ' + Math.round(x.mk_pct) + '%');
    return r;
  }

  function ringkasKelas(an) {
    var hy = 0, hj = 0, ks = 0, kj = 0, tp = [], mk = [];
    an.murid.forEach(function (x) {
      hy += x.hadir_ya; hj += x.hadir_jum; ks += x.kr_siap; kj += x.kr_jum;
      if (x.tp_bil) tp.push(Number(x.tp_purata));
      if (x.mk_bil) mk.push(Number(x.mk_pct));
    });
    function avg(a) { return a.length ? a.reduce(function (p, c) { return p + c; }, 0) / a.length : null; }
    return { hadir: pct(hy, hj), kr: pct(ks, kj), tp: avg(tp), mk: avg(mk) };
  }

  async function renderAnalisis(kelasId, tempoh) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/');
    tempoh = TEMPOH[tempoh] ? tempoh : '30';
    var hash = location.hash;
    var tabs = '<div class="seg">' + Object.keys(TEMPOH).map(function (t) {
      return '<button data-act="an-tempoh" data-id="' + k.id + '" data-t="' + t + '" aria-pressed="' + (t === tempoh) + '">' + TEMPOH[t] + '</button>';
    }).join('') + '</div>';
    var kepala = kepalaModul(k, 'analisis', 'Analysis');
    $app.innerHTML = '<div class="page">' + kepala + tabs + '<p class="sub">Memuatkan…</p></div>';
    var an = await muatAnalisis(k, tempoh);
    if (location.hash !== hash) return;
    S.an = an;
    var nama = {}; muridKelas(k.id).forEach(function (m) { nama[m.id] = m; });
    var rk = ringkasKelas(an);
    function tile(label, nilai, sub) {
      return '<div class="an-tile"><span class="an-tile-l">' + label + '</span><b>' + (nilai === null ? '–' : nilai) + '</b><span class="an-tile-s">' + sub + '</span></div>';
    }

    // Kehadiran: bar harian (lama -> baru)
    var hd = an.hadir.slice(0, 30).reverse();
    var cartaHadir = hd.length ? '<div class="an-bars" role="img" aria-label="Peratus hadir setiap hari">' +
      '<span class="an-grid" style="bottom:50%"></span><span class="an-grid" style="bottom:100%"></span>' +
      hd.map(function (d) {
        var p = pct(d.jumlah - d.tidak_hadir, d.jumlah);
        var tip = labelTarikh(d.tarikh) + ': ' + (d.jumlah - d.tidak_hadir) + '/' + d.jumlah + ' hadir (' + p + '%)';
        return '<button class="an-bar" data-tip="' + esc(tip) + '" title="' + esc(tip) + '"><span style="height:' + Math.max(p, 2) + '%"></span></button>';
      }).join('') + '</div><div class="between an-axis"><span>' + esc(labelTarikh(hd[0].tarikh).replace('Hari ini · ', '')) + '</span><span>100% · 50%</span><span>' + esc(labelTarikh(hd[hd.length - 1].tarikh).replace('Hari ini · ', '')) + '</span></div>' : '<p class="sub">Tiada rekod kehadiran dalam tempoh ini.</p>';
    var kerapTak = an.murid.filter(function (x) { return x.hadir_jum - x.hadir_ya > 0; })
      .sort(function (a, b) { return (b.hadir_jum - b.hadir_ya) - (a.hadir_jum - a.hadir_ya); }).slice(0, 3);

    // KR
    var tg = an.tugasan.slice(0, 8);
    var cartaKr = tg.length ? tg.map(function (t) {
      var p = pct(t.siap, t.ditanda);
      return barMendatar(t.tajuk, t.ditanda ? t.siap + '/' + t.ditanda + ' siap' : 'Belum ditanda', p, 'var(--acc)');
    }).join('') : '<p class="sub">Tiada tugasan dalam tempoh ini.</p>';
    var kerapKr = an.murid.filter(function (x) { return x.kr_tak > 0; }).sort(function (a, b) { return b.kr_tak - a.kr_tak; }).slice(0, 3);

    // PBD: bar bertindan setiap Bab
    var bab = [], ikut = {};
    an.pbd.forEach(function (r) { if (!ikut[r.item_id]) { ikut[r.item_id] = { tajuk: r.tajuk, tp: {}, jum: 0 }; bab.push(ikut[r.item_id]); } ikut[r.item_id].tp[r.tp] = r.bil; ikut[r.item_id].jum += r.bil; });
    var cartaPbd = bab.length ? '<div class="an-legend">' + [1, 2, 3, 4, 5, 6].map(function (t) { return '<span><i style="background:' + TP_WARNA[t][0] + (t === 1 ? ';box-shadow:inset 0 0 0 1px #C4B5FD' : '') + '"></i>TP' + t + '</span>'; }).join('') + '</div>' +
      bab.map(function (b) {
        return '<div class="an-hrow"><div class="between"><span class="an-hl">' + esc(b.tajuk) + '</span><span class="an-hv">' + b.jum + ' murid</span></div><div class="an-stack">' +
          [1, 2, 3, 4, 5, 6].filter(function (t) { return b.tp[t]; }).map(function (t) {
            var w = b.tp[t] / b.jum * 100, tip = b.tajuk + ' · TP' + t + ': ' + b.tp[t] + ' murid';
            return '<button data-tip="' + esc(tip) + '" title="' + esc(tip) + '" style="flex:' + b.tp[t] + ';background:' + TP_WARNA[t][0] + ';color:' + TP_WARNA[t][1] + '">' + (w >= 9 ? 'TP' + t : '') + '</button>';
          }).join('') + '</div></div>';
      }).join('') : '<p class="sub">Belum ada TP direkod.</p>';

    // Kuiz & peperiksaan
    var nl = an.nilai.slice(0, 8);
    var cartaNilai = nl.length ? nl.map(function (p) {
      var pc = p.dimasuk ? Math.round(p.purata / p.markah_penuh * 100) : null;
      return barMendatar((p.jenis === 'kuiz' ? 'Kuiz · ' : 'Peperiksaan · ') + p.tajuk, p.dimasuk ? 'purata ' + nomb(p.purata) + '/' + nomb(p.markah_penuh) : 'Belum ada markah', pc, '#7C3AED');
    }).join('') : '<p class="sub">Tiada kuiz / peperiksaan dalam tempoh ini.</p>';

    // Perlu perhatian
    var perhatian = an.murid.map(function (x) { return { x: x, m: nama[x.murid_id], r: sebabPerhatian(x, an.had) }; })
      .filter(function (o) { return o.m && o.r.length; }).sort(function (a, b) { return b.r.length - a.r.length || (a.m.no || 0) - (b.m.no || 0); });

    function senaraiMurid(arr, teks) {
      return arr.length ? '<div class="an-mini">' + arr.map(function (x) { var m = nama[x.murid_id]; return m ? '<button data-act="profil-murid" data-id="' + m.id + '"><span>' + esc(namaPendek(m.nama)) + '</span><b>' + teks(x) + '</b></button>' : ''; }).join('') + '</div>' : '';
    }

    $app.innerHTML = '<div class="page">' + kepala + tabs +
      '<button class="btn block" data-act="an-laporan">' + I.print + ' Laporan (PDF)</button>' +
      '<div class="an-tiles">' +
        tile('Hadir', rk.hadir === null ? null : rk.hadir + '%', 'purata kelas') +
        tile('KR siap', rk.kr === null ? null : rk.kr + '%', 'semua tugasan') +
        tile('Purata TP', rk.tp === null ? null : nomb(rk.tp), 'TP semasa') +
        tile('Markah', rk.mk === null ? null : Math.round(rk.mk) + '%', 'kuiz & periksa') +
      '</div>' +
      '<div class="card an-card"><div class="between"><b>⚠ Perlu perhatian</b><button class="icon-sm" data-act="an-had" aria-label="Tetapkan had perhatian">' + I.gear + '</button></div>' +
        '<span class="sub">Hadir &lt; ' + an.had.had_hadir + '% · KR tak siap ≥ ' + an.had.had_kr + ' · TP &lt; ' + nomb(an.had.had_tp) + ' · Markah &lt; ' + an.had.had_markah + '%</span>' +
        (perhatian.length ? '<div class="list-card" style="margin-top:6px">' + perhatian.map(function (o) {
          return '<button class="list-row" data-act="profil-murid" data-id="' + o.m.id + '"><span class="grow" style="min-width:0"><b style="display:block;font-size:14px">' + esc(o.m.nama) + '</b><span class="row" style="gap:4px;flex-wrap:wrap;margin-top:3px">' + o.r.map(function (r) { return '<span class="chip an-chip">' + esc(r) + '</span>'; }).join('') + '</span></span><span class="muted">' + I.chev + '</span></button>';
        }).join('') + '</div>' : '<p class="sub" style="margin:6px 0 0">Tiada murid. Bagus!</p>') +
      '</div>' +
      '<div class="card an-card"><b>Kehadiran</b>' + cartaHadir + (kerapTak.length ? '<span class="an-sub">Paling kerap tidak hadir</span>' + senaraiMurid(kerapTak, function (x) { return (x.hadir_jum - x.hadir_ya) + ' kali'; }) : '') + '</div>' +
      '<div class="card an-card"><b>Kerja rumah</b>' + cartaKr + (kerapKr.length ? '<span class="an-sub">Paling banyak tertunggak</span>' + senaraiMurid(kerapKr, function (x) { return x.kr_tak + ' KR'; }) : '') + '</div>' +
      '<div class="card an-card"><b>PBD</b><span class="sub">TP semasa setiap Bab (tidak ikut tempoh)</span>' + cartaPbd + '</div>' +
      '<div class="card an-card"><b>Kuiz &amp; peperiksaan</b><span class="sub">Purata kelas sebagai % markah penuh</span>' + cartaNilai + '</div>' +
    '</div>';
  }

  function barMendatar(label, nilai, p, warnaBar) {
    var tip = label + ': ' + nilai + (p === null ? '' : ' (' + p + '%)');
    return '<div class="an-hrow" data-tip="' + esc(tip) + '" title="' + esc(tip) + '"><div class="between"><span class="an-hl">' + esc(label) + '</span><span class="an-hv">' + esc(nilai) + (p === null ? '' : ' · <b>' + p + '%</b>') + '</span></div>' +
      '<div class="an-track"><span style="width:' + (p === null ? 0 : Math.max(p, 1.5)) + '%;background:' + warnaBar + '"></span></div></div>';
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tip]');
    if (el && !e.target.closest('[data-act]')) toast(el.dataset.tip);
  });

  function sheetHad() {
    var h = S.an.had;
    function f(n, label, v, min, max, step) { return '<label class="field"><span>' + label + '</span><input class="input" name="' + n + '" type="number" inputmode="decimal" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" required></label>'; }
    openSheet('<h2>Had "Perlu perhatian"</h2><p class="sub" style="margin:0">Murid masuk senarai jika memenuhi <b>mana-mana</b> satu syarat. Tetapan ini untuk semua kelas anda.</p>' +
      '<form class="stack" style="gap:12px" data-form="had" novalidate>' +
        f('had_hadir', 'Kehadiran di bawah (%)', h.had_hadir, 0, 100, 1) +
        f('had_kr', 'Kerja rumah tak siap sekurang-kurangnya', h.had_kr, 1, 50, 1) +
        f('had_tp', 'Purata TP di bawah', nomb(h.had_tp), 1, 6, 0.5) +
        f('had_markah', 'Purata markah di bawah (%)', h.had_markah, 0, 100, 1) +
        '<p class="error" data-err></p><button class="btn block" type="submit">Simpan</button><button class="btn ghost block" type="button" data-act="had-asal">Guna had cadangan</button></form>',
      { label: 'Had perhatian' });
  }
  async function simpanHad(form) {
    var err = form.querySelector('[data-err]');
    var v = { had_hadir: parseInt(form.had_hadir.value, 10), had_kr: parseInt(form.had_kr.value, 10), had_tp: parseFloat(form.had_tp.value), had_markah: parseInt(form.had_markah.value, 10) };
    if (!(v.had_hadir >= 0 && v.had_hadir <= 100) || !(v.had_markah >= 0 && v.had_markah <= 100)) { err.textContent = 'Peratus mesti antara 0 dan 100.'; return; }
    if (!(v.had_kr >= 1 && v.had_kr <= 50)) { err.textContent = 'Kerja rumah mesti antara 1 dan 50.'; return; }
    if (!(v.had_tp >= 1 && v.had_tp <= 6)) { err.textContent = 'TP mesti antara 1 dan 6.'; return; }
    v.guru_id = S.session.user.id;
    var r = await sb.from('tetapan_guru').upsert(v, { onConflict: 'guru_id' });
    if (r.error) { err.textContent = errMsg(r.error); return; }
    closeSheet(); toast('Had disimpan.'); route();
  }

  function sheetLaporan() {
    var an = S.an, k = cariKelas(an.kelasId);
    openSheet('<div class="between"><h2>Laporan</h2><button class="icon-sm" data-act="sheet-close" aria-label="Tutup">' + I.close + '</button></div>' +
      '<p class="sub" style="margin:0">Tempoh: <b>' + TEMPOH[an.tempoh] + '</b>. Pilih jenis, semak pratonton, kemudian Cetak → <b>Simpan sebagai PDF</b>.</p>' +
      '<a class="list-row" href="#/laporan/' + k.id + '/kelas/' + an.tempoh + '"><span class="grow"><b style="display:block">Laporan kelas</b><span class="sub">Ringkasan + jadual semua murid</span></span>' + I.chev + '</a>' +
      '<a class="list-row" href="#/laporan/' + k.id + '/idme/' + an.tempoh + '"><span class="grow"><b style="display:block">Helaian salin ke idMe</b><span class="sub">Ikut nombor giliran: kehadiran, TP setiap Bab, cadangan TP keseluruhan, peperiksaan</span></span>' + I.chev + '</a>' +
      '<a class="list-row" href="#/laporan/' + k.id + '/murid/' + an.tempoh + '"><span class="grow"><b style="display:block">Laporan individu — semua murid</b><span class="sub">Satu halaman setiap murid (' + muridKelas(k.id).length + ' halaman)</span></span>' + I.chev + '</a>' +
      '<span class="section-title" style="margin-top:6px">Laporan individu — pilih murid</span>' +
      '<div class="sheet-scroll">' + muridKelas(k.id).map(function (m, i) {
        return '<a class="list-row" href="#/laporan/' + k.id + '/murid/' + an.tempoh + '/' + m.id + '"><span class="grow" style="font-size:14px;font-weight:600">' + (m.no || i + 1) + '. ' + esc(m.nama) + '</span>' + I.chev + '</a>';
      }).join('') + '</div>', { label: 'Laporan', tall: true });
  }

  /* ---------- Laporan (PDF melalui cetak) ---------- */
  async function renderLaporan(kelasId, jenis, tempoh, muridId) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/');
    tempoh = TEMPOH[tempoh] ? tempoh : '30';
    var hash = location.hash, balik = '#/modul/analisis/' + k.id + '/' + tempoh;
    $app.innerHTML = '<div class="page"><div class="row"><a class="icon-btn" href="' + balik + '" aria-label="Kembali">' + I.back + '</a><h2>Laporan</h2></div><p class="sub">Menyediakan laporan…</p></div>';
    var an = (S.an && S.an.kelasId === k.id && S.an.tempoh === tempoh) ? S.an : await muatAnalisis(k, tempoh);
    var butir = (jenis === 'murid' || jenis === 'idme') ? await muatButiran(k, an) : null;
    if (location.hash !== hash) return;
    var murid = muridKelas(k.id), info = {};
    an.murid.forEach(function (x) { info[x.murid_id] = x; });
    var html, tajuk;
    if (jenis === 'kelas') { html = laporanKelas(k, an, murid, info); tajuk = 'Laporan kelas'; }
    else if (jenis === 'idme') { html = laporanIdme(k, an, murid, info, butir); tajuk = 'Helaian salin ke idMe'; }
    else {
      var pilih = muridId ? murid.filter(function (m) { return m.id === muridId; }) : murid;
      if (!pilih.length) { toast('Murid tidak dijumpai.'); return go(balik); }
      html = pilih.map(function (m) { return laporanMurid(k, an, m, info[m.id], butir); }).join('');
      tajuk = muridId ? 'Laporan ' + pilih[0].nama : 'Laporan individu (' + pilih.length + ' murid)';
    }
    var helai = (html.match(/class="label-page/g) || []).length;
    $app.innerHTML = '<div class="page">' +
      '<div class="row"><a class="icon-btn" href="' + balik + '" aria-label="Kembali">' + I.back + '</a><div><h2>' + esc(tajuk) + '</h2><span class="sub">' + esc(k.nama + (k.subjek ? ' · ' + k.subjek : '')) + ' · ' + TEMPOH[tempoh] + ' · ' + helai + ' helai A4</span></div></div>' +
      '<div class="card" style="padding:12px 14px"><span class="sub">Tekan <b>Cetak</b>, kemudian pilih pencetak <b>Simpan sebagai PDF</b> untuk dapatkan fail PDF, atau pilih pencetak sebenar.' + (jenis === 'murid' ? ' <b>Ulasan guru</b> boleh diubah terus dalam pratonton: tekan ayat itu dan taip.' : '') + (jenis === 'idme' ? ' Susunan ikut nombor giliran. <b>TP akhir</b> ialah keputusan anda; lajur Cadangan hanya purata Bab yang dibundarkan.' : '') + '</span></div>' +
      '<button class="btn block" data-act="cetak">' + I.print + ' Cetak / Simpan PDF</button>' +
      '<div class="preview-wrap">' + html + '</div>' +
    '</div>';
    S.cetakHtml = html;
    skalaPratonton();
  }

  async function muatButiran(k, an) {
    var dari = an.dari, tgIds = an.tugasan.map(function (t) { return t.id; }), pnIds = an.nilai.map(function (p) { return p.id; });
    var qH = sb.from('kehadiran').select('murid_id,tarikh,sebab').eq('kelas_id', k.id).eq('hadir', false).order('tarikh', { ascending: false }).limit(1000);
    if (dari) qH = qH.gte('tarikh', dari);
    var res = await Promise.all([
      qH,
      tgIds.length ? sb.from('status_tugasan').select('murid_id,tugasan_id').in('tugasan_id', tgIds).eq('siap', false).limit(1000) : { data: [] },
      sb.from('pbd_tp').select('murid_id,item_id,tp').eq('kelas_id', k.id).limit(1000),
      pnIds.length ? sb.from('markah').select('murid_id,penilaian_id,markah').in('penilaian_id', pnIds).limit(1000) : { data: [] },
      sb.rpc('ringkasan_pbd', { p_kelas: k.id })
    ]);
    res.forEach(function (r) { if (r.error) throw r.error; });
    return { tak: res[0].data || [], kr: res[1].data || [], tp: res[2].data || [], mk: res[3].data || [], bab: res[4].data || [] };
  }

  function kepalaLaporan(k, an, tajuk) {
    return '<div class="lap-head"><div class="lap-brand">' + I.mark.replace('width="34" height="34"', 'width="26" height="26"').replace(/#fff"/g, '#0F766E"') + '<span>EduTrack</span></div>' +
      '<div class="lap-title"><b>' + esc(tajuk) + '</b><span>' + esc(k.nama + (k.subjek ? ' · ' + k.subjek : '')) + ' · Tempoh: ' + TEMPOH[an.tempoh] + (an.dari ? ' (dari ' + esc(an.dari.split('-').reverse().join('/')) + ')' : '') + '</span></div>' +
      '<div class="lap-meta">Guru: ' + esc(S.profil.nama || '') + '<br>Dicetak: ' + esc(hariIni().split('-').reverse().join('/')) + '</div></div>';
  }

  function laporanKelas(k, an, murid, info) {
    var rk = ringkasKelas(an), per = 26, halaman = [];
    var bab = {}, urut = [];
    an.pbd.forEach(function (r) { if (!bab[r.item_id]) { bab[r.item_id] = { tajuk: r.tajuk, tp: {} }; urut.push(bab[r.item_id]); } bab[r.item_id].tp[r.tp] = r.bil; });
    var muka1 = '<div class="label-page lap-page">' + kepalaLaporan(k, an, 'Laporan Kelas') +
      '<div class="lap-tiles"><div><span>Kehadiran</span><b>' + (rk.hadir === null ? '–' : rk.hadir + '%') + '</b></div><div><span>Kerja rumah siap</span><b>' + (rk.kr === null ? '–' : rk.kr + '%') + '</b></div><div><span>Purata TP</span><b>' + (rk.tp === null ? '–' : nomb(rk.tp)) + '</b></div><div><span>Purata markah</span><b>' + (rk.mk === null ? '–' : Math.round(rk.mk) + '%') + '</b></div><div><span>Bil. murid</span><b>' + murid.length + '</b></div></div>' +
      '<h3>Taburan TP setiap Bab</h3>' + (urut.length ? '<table class="lap-t"><thead><tr><th>Bab</th>' + [1, 2, 3, 4, 5, 6].map(function (t) { return '<th class="c">TP' + t + '</th>'; }).join('') + '</tr></thead><tbody>' +
        urut.map(function (b) { return '<tr><td>' + esc(b.tajuk) + '</td>' + [1, 2, 3, 4, 5, 6].map(function (t) { return '<td class="c">' + (b.tp[t] || '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' : '<p class="lap-kosong">Belum ada TP direkod.</p>') +
      '<h3>Kuiz &amp; peperiksaan</h3>' + (an.nilai.length ? '<table class="lap-t"><thead><tr><th>Penilaian</th><th>Tarikh</th><th class="c">Dimasuk</th><th class="c">Purata</th><th class="c">%</th></tr></thead><tbody>' +
        an.nilai.slice(0, 14).map(function (p) { return '<tr><td>' + (p.jenis === 'kuiz' ? 'Kuiz' : 'Peperiksaan') + ' · ' + esc(p.tajuk) + '</td><td>' + esc(p.tarikh.split('-').reverse().join('/')) + '</td><td class="c">' + p.dimasuk + '/' + murid.length + '</td><td class="c">' + (p.dimasuk ? nomb(p.purata) + '/' + nomb(p.markah_penuh) : '–') + '</td><td class="c">' + (p.dimasuk ? Math.round(p.purata / p.markah_penuh * 100) + '%' : '–') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="lap-kosong">Tiada kuiz / peperiksaan dalam tempoh ini.</p>') +
      '</div>';
    halaman.push(muka1);
    for (var i = 0; i < Math.max(murid.length, 1); i += per) {
      var cebis = murid.slice(i, i + per);
      halaman.push('<div class="label-page lap-page">' + kepalaLaporan(k, an, 'Laporan Kelas — Senarai Murid' + (murid.length > per ? ' (' + (i / per + 1) + '/' + Math.ceil(murid.length / per) + ')' : '')) +
        '<table class="lap-t lap-murid"><thead><tr><th class="c">No</th><th>Nama</th><th class="c">Hadir</th><th class="c">KR siap</th><th class="c">Purata TP</th><th class="c">Markah</th><th>Perhatian</th></tr></thead><tbody>' +
        cebis.map(function (m, j) {
          var x = info[m.id] || { hadir_jum: 0, hadir_ya: 0, kr_jum: 0, kr_siap: 0, kr_tak: 0, tp_bil: 0, mk_bil: 0 };
          var r = sebabPerhatian(x, an.had);
          return '<tr><td class="c">' + (m.no || i + j + 1) + '</td><td>' + esc(m.nama) + '</td><td class="c">' + (x.hadir_jum ? pct(x.hadir_ya, x.hadir_jum) + '%' : '–') + '</td><td class="c">' + (x.kr_jum ? x.kr_siap + '/' + x.kr_jum : '–') + '</td><td class="c">' + (x.tp_bil ? nomb(x.tp_purata) : '–') + '</td><td class="c">' + (x.mk_bil ? Math.round(x.mk_pct) + '%' : '–') + '</td><td class="lap-r">' + esc(r.join(', ')) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="lap-nota">Perhatian: hadir &lt; ' + an.had.had_hadir + '%, KR tak siap ≥ ' + an.had.had_kr + ', purata TP &lt; ' + nomb(an.had.had_tp) + ', purata markah &lt; ' + an.had.had_markah + '%. PBD ialah TP semasa (tidak ikut tempoh).</p></div>');
    }
    return halaman.join('');
  }

  /* ---------- Kongsi ringkasan murid (gambar) ---------- */
  function pilihKelasKongsi(muridId) {
    var m = S.murid.filter(function (x) { return x.id === muridId; })[0];
    var links = (m.kelas_murid || []).map(function (l) { return cariKelas(l.kelas_id); }).filter(Boolean);
    if (links.length === 1) return sediaKongsi(m, links[0]);
    openSheet('<h2>Ringkasan untuk kelas mana?</h2>' + links.map(function (k) {
      return '<button class="list-row" data-act="kongsi-kelas" data-id="' + m.id + '" data-kelas="' + k.id + '"><span class="grow"><b>' + esc(k.nama + (k.subjek ? ' · ' + k.subjek : '')) + '</b></span>' + I.chev + '</button>';
    }).join(''), { label: 'Pilih kelas' });
  }

  async function sediaKongsi(m, k) {
    openSheet('<h2>Menyediakan gambar…</h2><p class="sub">Sila tunggu sebentar.</p>', { label: 'Menyediakan' });
    try {
      var an = await muatAnalisis(k, 'tahun'), b = await muatButiran(k, an);
      var x = an.murid.filter(function (r) { return r.murid_id === m.id; })[0] || { hadir_jum: 0, hadir_ya: 0, kr_jum: 0, kr_siap: 0, kr_tak: 0, tp_bil: 0, mk_bil: 0 };
      var lk = muridKelas(k.id).filter(function (y) { return y.id === m.id; })[0] || { nama: m.nama };
      var tgNama = {}; an.tugasan.forEach(function (t) { tgNama[t.id] = t.tajuk; });
      var tpM = {}; b.tp.forEach(function (r) { if (r.murid_id === m.id) tpM[r.item_id] = r.tp; });
      var mkM = {}; b.mk.forEach(function (r) { if (r.murid_id === m.id) mkM[r.penilaian_id] = Number(r.markah); });
      var tpBab = b.bab.filter(function (it) { return tpM[it.id]; }).map(function (it) { return { tajuk: it.tajuk, tp: tpM[it.id] }; });
      var d = {
        nama: m.nama, kelas: k.nama + (k.subjek ? ' · ' + k.subjek : ''), x: x,
        tak: b.tak.filter(function (r) { return r.murid_id === m.id; }).map(function (r) { return labelTarikh(r.tarikh).replace('Hari ini · ', '') + (r.sebab ? ' (' + r.sebab + ')' : ''); }),
        kr: b.kr.filter(function (r) { return r.murid_id === m.id; }).map(function (r) { return tgNama[r.tugasan_id]; }).filter(Boolean),
        tp: tpBab,
        mk: an.nilai.filter(function (p) { return mkM[p.id] !== undefined; }).map(function (p) { var pc = Math.round(mkM[p.id] / p.markah_penuh * 100); return p.tajuk + ': ' + nomb(mkM[p.id]) + '/' + nomb(p.markah_penuh) + ' (' + pc + '%' + (S.gred ? ', ' + gredUntuk(pc) : '') + ')'; }),
        ulasan: ulasanAuto(lk, x, an.had, tpBab)
      };
      var blob = await lukisRingkasan(d);
      S.failKongsi = new File([blob], 'EduTrack-' + m.nama.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40) + '.png', { type: 'image/png' });
      var url = URL.createObjectURL(blob);
      openSheet('<div class="between"><h2>Ringkasan ' + esc(namaPendek(m.nama)) + '</h2><button class="icon-sm" data-act="sheet-close" aria-label="Tutup">' + I.close + '</button></div>' +
        '<div class="sheet-scroll"><img src="' + url + '" alt="Ringkasan prestasi ' + esc(m.nama) + '" style="width:100%;border-radius:12px;border:1px solid var(--line)"></div>' +
        '<p class="sub" style="margin:0">Semak dahulu. Pastikan anda menghantar kepada ibu bapa <b>murid ini sahaja</b>. Gambar akan kekal dalam telefon penerima.</p>' +
        '<button class="btn block" data-act="kongsi-fail">' + I.share + ' Kongsi (WhatsApp, Telegram…)</button><button class="btn ghost block" data-act="muat-fail">Muat turun gambar</button>',
        { label: 'Ringkasan murid', tall: true });
    } catch (e) { closeSheet(); toast('Gagal: ' + errMsg(e)); }
  }

  async function lukisRingkasan(d) {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* abaikan */ } }
    var W = 1080, P = 64, F = '"Plus Jakarta Sans", system-ui, sans-serif';
    var c = document.createElement('canvas'), g = c.getContext('2d');
    function balut(teks, saiz, berat, lebar) {
      g.font = berat + ' ' + saiz + 'px ' + F;
      var kata = String(teks).split(/\s+/), out = [], baris = '';
      kata.forEach(function (w) { var cuba = baris ? baris + ' ' + w : w; if (g.measureText(cuba).width > lebar && baris) { out.push(baris); baris = w; } else baris = cuba; });
      if (baris) out.push(baris);
      return out;
    }
    var x = d.x;
    var bahagian = [
      ['Tidak hadir', d.tak.length ? d.tak.slice(0, 6).join(', ') + (d.tak.length > 6 ? ' dan ' + (d.tak.length - 6) + ' lagi' : '') : 'Tiada.'],
      ['Kerja rumah belum siap', d.kr.length ? d.kr.slice(0, 6).join(', ') + (d.kr.length > 6 ? ' dan ' + (d.kr.length - 6) + ' lagi' : '') : 'Tiada.'],
      ['PBD', d.tp.length ? d.tp.slice(0, 10).map(function (t) { return t.tajuk + ' — TP' + t.tp; }).join('\n') : 'Belum ada TP direkod.'],
      ['Kuiz & peperiksaan', d.mk.length ? d.mk.slice(0, 6).join('\n') : 'Tiada markah tahun ini.'],
      ['Ulasan guru', d.ulasan]
    ];
    // kira tinggi
    var lebar = W - 2 * P, H = 420;
    bahagian.forEach(function (s) { H += 70; s[1].split('\n').forEach(function (l) { H += balut(l, 30, '500', lebar).length * 42; }); H += 10; });
    H += 110;
    c.width = W; c.height = H;
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0F766E'; g.fillRect(0, 0, W, 120);
    g.fillStyle = '#FFFFFF'; g.font = '800 40px ' + F; g.textBaseline = 'middle'; g.fillText('EduTrack', P, 60);
    g.font = '600 28px ' + F; g.textAlign = 'right'; g.fillText('Ringkasan prestasi · ' + hariIni().split('-').reverse().join('/'), W - P, 60); g.textAlign = 'left';
    var y = 190;
    g.textBaseline = 'alphabetic'; g.fillStyle = '#0F172A'; g.font = '800 50px ' + F;
    balut(d.nama, 50, '800', lebar).forEach(function (l) { g.fillText(l, P, y); y += 60; });
    g.fillStyle = '#475569'; g.font = '600 30px ' + F; g.fillText(d.kelas + ' · Tahun ini', P, y); y += 40;
    var tiles = [['Kehadiran', x.hadir_jum ? pct(x.hadir_ya, x.hadir_jum) + '%' : '–'], ['KR siap', x.kr_jum ? x.kr_siap + '/' + x.kr_jum : '–'], ['Purata TP', x.tp_bil ? nomb(x.tp_purata) : '–'], ['Markah', x.mk_bil ? Math.round(x.mk_pct) + '%' : '–']];
    var tw = (lebar - 3 * 16) / 4;
    tiles.forEach(function (t, i) {
      var tx = P + i * (tw + 16);
      g.fillStyle = '#F1F5F9'; if (g.roundRect) { g.beginPath(); g.roundRect(tx, y, tw, 130, 22); g.fill(); } else g.fillRect(tx, y, tw, 130);
      g.fillStyle = '#475569'; g.font = '700 24px ' + F; g.fillText(t[0], tx + 20, y + 42);
      g.fillStyle = '#0F172A'; g.font = '800 46px ' + F; g.fillText(t[1], tx + 20, y + 100);
    });
    y += 130 + 20;
    bahagian.forEach(function (s) {
      y += 56; g.fillStyle = '#0F766E'; g.font = '800 32px ' + F; g.fillText(s[0], P, y); y += 14;
      g.fillStyle = '#1E293B';
      s[1].split('\n').forEach(function (l) { balut(l, 30, '500', lebar).forEach(function (b2) { y += 42; g.font = '500 30px ' + F; g.fillText(b2, P, y); }); });
      y += 10;
    });
    g.fillStyle = '#94A3B8'; g.font = '600 24px ' + F; g.fillText('Guru: ' + (S.profil.nama || '') + ' · Dijana oleh EduTrack', P, H - 44);
    return new Promise(function (ok) { c.toBlob(ok, 'image/png'); });
  }

  /* Helaian untuk memudahkan menaip semula ke idMe (tiada muat naik terus ke idMe). */
  function laporanIdme(k, an, murid, info, b) {
    var PER = 24, BAB_SEMUKA = 8, hal = [];
    var sebab = {}; b.tak.forEach(function (r) { var s = sebab[r.murid_id] = sebab[r.murid_id] || {}; var kk = r.sebab || 'tiada sebab'; s[kk] = (s[kk] || 0) + 1; });
    var tpM = {}; b.tp.forEach(function (r) { (tpM[r.murid_id] = tpM[r.murid_id] || {})[r.item_id] = r.tp; });
    var mk = {}; b.mk.forEach(function (r) { mk[r.penilaian_id + '|' + r.murid_id] = Number(r.markah); });
    var exam = an.nilai.filter(function (p) { return p.jenis === 'peperiksaan'; })[0] || an.nilai[0] || null;
    var bab = b.bab.filter(function (it) { return it.ditanda > 0; });
    for (var i = 0; i < Math.max(murid.length, 1); i += PER) {
      var cebis = murid.slice(i, i + PER);
      hal.push('<div class="label-page lap-page">' + kepalaLaporan(k, an, 'Helaian salin ke idMe' + (murid.length > PER ? ' (' + (i / PER + 1) + '/' + Math.ceil(murid.length / PER) + ')' : '')) +
        '<table class="lap-t lap-murid"><thead><tr><th class="c">No</th><th>Nama</th><th class="c">Hadir</th><th>Tidak hadir (sebab)</th><th class="c">Purata TP</th><th class="c">Cadangan TP</th><th class="c" style="width:16mm">TP akhir</th>' +
        (exam ? '<th class="c">' + esc((exam.jenis === 'kuiz' ? 'Kuiz: ' : '') + exam.tajuk) + '</th>' : '') + '</tr></thead><tbody>' +
        cebis.map(function (m, j) {
          var x = info[m.id] || { hadir_jum: 0, hadir_ya: 0, tp_bil: 0 }, s = sebab[m.id] || {};
          var tak = Object.keys(s).map(function (kk) { return kk + ' ' + s[kk]; }).join(', ');
          var nilai = exam && mk[exam.id + '|' + m.id] !== undefined ? mk[exam.id + '|' + m.id] : null;
          var pc = nilai === null ? null : Math.round(nilai / exam.markah_penuh * 100);
          return '<tr><td class="c">' + (m.no || i + j + 1) + '</td><td>' + esc(m.nama) + '</td><td class="c">' + (x.hadir_jum ? x.hadir_ya + '/' + x.hadir_jum : '–') + '</td><td class="lap-r">' + esc(tak) + '</td>' +
            '<td class="c">' + (x.tp_bil ? nomb(x.tp_purata) : '–') + '</td><td class="c"><b>' + (x.tp_bil ? 'TP' + Math.round(Number(x.tp_purata)) : '–') + '</b></td><td class="c lap-isi"></td>' +
            (exam ? '<td class="c">' + (pc === null ? '–' : nomb(nilai) + ' (' + pc + '%' + (S.gred ? ' ' + esc(gredUntuk(pc)) : '') + ')') + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table>' +
        '<p class="lap-nota">Cadangan TP = purata TP semua Bab, dibundarkan (2.5 → 3). TP keseluruhan ialah pertimbangan guru: tulis keputusan anda dalam lajur TP akhir sebelum mengisi idMe. Kehadiran dan peperiksaan ikut tempoh dipilih; TP ialah TP semasa.</p></div>');
    }
    for (var a = 0; a < bab.length; a += BAB_SEMUKA) {
      var bb = bab.slice(a, a + BAB_SEMUKA);
      for (var i2 = 0; i2 < Math.max(murid.length, 1); i2 += PER) {
        var cb = murid.slice(i2, i2 + PER);
        hal.push('<div class="label-page lap-page">' + kepalaLaporan(k, an, 'Helaian idMe — TP setiap Bab') +
          '<table class="lap-t lap-murid"><thead><tr><th class="c">No</th><th>Nama</th>' + bb.map(function (it, n) { return '<th class="c">B' + (a + n + 1) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          cb.map(function (m, j) { var t = tpM[m.id] || {}; return '<tr><td class="c">' + (m.no || i2 + j + 1) + '</td><td>' + esc(m.nama) + '</td>' + bb.map(function (it) { return '<td class="c">' + (t[it.id] ? 'TP' + t[it.id] : '') + '</td>'; }).join('') + '</tr>'; }).join('') +
          '</tbody></table><p class="lap-nota">' + bb.map(function (it, n) { return '<b>B' + (a + n + 1) + '</b> = ' + esc(it.tajuk); }).join(' · ') + '</p></div>');
      }
    }
    return hal.join('');
  }

  /* Ayat ulasan automatik (tanpa AI): dipilih ikut data murid dan had "Perlu perhatian" guru. */
  function ulasanAuto(m, x, had, tpBab) {
    var n = namaPendek(m.nama), ay = [], p;
    if (x.hadir_jum) {
      p = pct(x.hadir_ya, x.hadir_jum);
      ay.push(p >= 95 ? n + ' hadir dengan sangat konsisten (' + p + '%).' : p >= had.had_hadir ? 'Kehadiran ' + n + ' baik (' + p + '%).' : 'Kehadiran ' + n + ' perlu diberi perhatian (' + p + '%); kerjasama ibu bapa amat dihargai.');
    }
    if (x.kr_jum) ay.push(x.kr_tak === 0 ? 'Semua kerja rumah disiapkan.' : x.kr_tak < had.had_kr ? 'Kebanyakan kerja rumah disiapkan (' + x.kr_siap + '/' + x.kr_jum + ').' : 'Terdapat ' + x.kr_tak + ' kerja rumah yang belum disiapkan; mohon dipantau di rumah.');
    if (x.tp_bil) {
      var t = Number(x.tp_purata);
      ay.push(t >= 5 ? 'Penguasaan PBD sangat baik (purata TP ' + nomb(t) + ').' : t >= Number(had.had_tp) ? 'Penguasaan PBD memuaskan (purata TP ' + nomb(t) + ').' : 'Penguasaan beberapa Bab masih di tahap awal (purata TP ' + nomb(t) + '); latihan tambahan disyorkan.');
      if (tpBab && tpBab.length > 1) {
        var s2 = tpBab.slice().sort(function (a, b) { return b.tp - a.tp; });
        if (s2[0].tp > s2[s2.length - 1].tp) {
          ay.push('Paling menguasai: ' + s2[0].tajuk + '.');
          if (s2[s2.length - 1].tp < Number(had.had_tp)) ay.push('Perlu bimbingan: ' + s2[s2.length - 1].tajuk + '.');
        }
      }
    }
    if (x.mk_bil) {
      p = Math.round(x.mk_pct);
      ay.push(p >= 80 ? 'Prestasi kuiz dan peperiksaan cemerlang (' + p + '%).' : p >= had.had_markah ? 'Prestasi kuiz dan peperiksaan sederhana (' + p + '%).' : 'Prestasi kuiz dan peperiksaan perlu dipertingkat (' + p + '%).');
    }
    return ay.length ? ay.join(' ') : 'Belum ada rekod yang mencukupi untuk ulasan.';
  }

  function laporanMurid(k, an, m, x, b) {
    x = x || { hadir_jum: 0, hadir_ya: 0, kr_jum: 0, kr_siap: 0, kr_tak: 0, tp_bil: 0, mk_bil: 0 };
    var tak = b.tak.filter(function (r) { return r.murid_id === m.id; });
    var tgNama = {}; an.tugasan.forEach(function (t) { tgNama[t.id] = t.tajuk; });
    var kr = b.kr.filter(function (r) { return r.murid_id === m.id; }).map(function (r) { return tgNama[r.tugasan_id]; }).filter(Boolean);
    var tpM = {}; b.tp.forEach(function (r) { if (r.murid_id === m.id) tpM[r.item_id] = r.tp; });
    var mkM = {}; b.mk.forEach(function (r) { if (r.murid_id === m.id) mkM[r.penilaian_id] = Number(r.markah); });
    var babAda = b.bab.filter(function (it) { return tpM[it.id]; });
    var nilaiAda = an.nilai.filter(function (p) { return mkM[p.id] !== undefined; }).slice(0, 12);
    return '<div class="label-page lap-page">' + kepalaLaporan(k, an, 'Laporan Prestasi Murid') +
      '<div class="lap-murid-head"><b>' + esc(m.nama) + '</b><span>No. giliran: ' + (m.no || '–') + '</span></div>' +
      '<div class="lap-tiles"><div><span>Kehadiran</span><b>' + (x.hadir_jum ? pct(x.hadir_ya, x.hadir_jum) + '%' : '–') + '</b><small>' + x.hadir_ya + '/' + x.hadir_jum + ' hari</small></div><div><span>Kerja rumah siap</span><b>' + (x.kr_jum ? x.kr_siap + '/' + x.kr_jum : '–') + '</b><small>' + x.kr_tak + ' belum siap</small></div><div><span>Purata TP</span><b>' + (x.tp_bil ? nomb(x.tp_purata) : '–') + '</b><small>' + x.tp_bil + ' Bab</small></div><div><span>Purata markah</span><b>' + (x.mk_bil ? Math.round(x.mk_pct) + '%' : '–') + '</b><small>' + x.mk_bil + ' penilaian</small></div></div>' +
      '<div class="lap-2col"><div><h3>Tidak hadir</h3>' + (tak.length ? '<ul>' + tak.slice(0, 12).map(function (r) { return '<li>' + esc(labelTarikh(r.tarikh, true).replace('Hari ini · ', '')) + (r.sebab ? ' — ' + esc(r.sebab) : '') + '</li>'; }).join('') + (tak.length > 12 ? '<li>dan ' + (tak.length - 12) + ' lagi</li>' : '') + '</ul>' : '<p class="lap-kosong">Tiada.</p>') + '</div>' +
      '<div><h3>Kerja rumah belum siap</h3>' + (kr.length ? '<ul>' + kr.slice(0, 12).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + (kr.length > 12 ? '<li>dan ' + (kr.length - 12) + ' lagi</li>' : '') + '</ul>' : '<p class="lap-kosong">Tiada.</p>') + '</div></div>' +
      '<h3>PBD (TP semasa)</h3>' + (babAda.length ? '<table class="lap-t"><thead><tr><th>Bab</th><th class="c" style="width:22mm">TP</th></tr></thead><tbody>' + babAda.map(function (it) { return '<tr><td>' + esc(it.tajuk) + '</td><td class="c"><b>TP' + tpM[it.id] + '</b></td></tr>'; }).join('') + '</tbody></table>' : '<p class="lap-kosong">Belum ada TP direkod.</p>') +
      '<h3>Kuiz &amp; peperiksaan</h3>' + (nilaiAda.length ? '<table class="lap-t"><thead><tr><th>Penilaian</th><th class="c">Markah</th><th class="c">%</th>' + (S.gred ? '<th class="c">Gred</th>' : '') + '<th class="c">Purata kelas</th></tr></thead><tbody>' + nilaiAda.map(function (p) { var pc = Math.round(mkM[p.id] / p.markah_penuh * 100); return '<tr><td>' + (p.jenis === 'kuiz' ? 'Kuiz' : 'Peperiksaan') + ' · ' + esc(p.tajuk) + '</td><td class="c">' + nomb(mkM[p.id]) + '/' + nomb(p.markah_penuh) + '</td><td class="c">' + pc + '%</td>' + (S.gred ? '<td class="c"><b>' + esc(gredUntuk(pc)) + '</b></td>' : '') + '<td class="c">' + Math.round(p.purata / p.markah_penuh * 100) + '%</td></tr>'; }).join('') + '</tbody></table>' : '<p class="lap-kosong">Tiada markah dalam tempoh ini.</p>') +
      '<h3>Ulasan guru</h3><div class="lap-ulasan" contenteditable="true" spellcheck="false">' + esc(ulasanAuto(m, x, an.had, babAda.map(function (it) { return { tajuk: it.tajuk, tp: tpM[it.id] }; }))) + '</div><div class="lap-garis"></div>' +
      '<div class="lap-ttd"><div>Tandatangan guru</div><div>Tandatangan ibu bapa / penjaga</div></div>' +
    '</div>';
  }

  /* ---------- Modul (akan datang) ---------- */
  function renderModul(id, kelasId) {
    var m = MODUL.filter(function (x) { return x.id === id; })[0];
    var k = cariKelas(kelasId);
    if (!m || !k) return go('#/');
    $app.innerHTML = '<div class="page">' +
      '<div class="row"><a class="icon-btn" href="#/kelas/' + k.id + '" aria-label="Kembali ke ' + esc(k.nama) + '">' + I.back + '</a><div><h2>' + m.nama + '</h2><span class="sub">' + esc(k.nama + (k.subjek ? ' · ' + k.subjek : '')) + '</span></div></div>' +
      '<div class="card empty" style="margin-top:20px;padding:32px 20px">' + logo(m.id, 88) +
        '<h2>Sedang dibina</h2><p class="sub">Modul ' + m.nama + ' akan tersedia dalam kemas kini seterusnya.</p>' +
        (m.rancang ? '<ul style="text-align:left;margin:6px 0 0;padding-left:20px;color:var(--sub);font-size:14px;line-height:1.7">' + m.rancang.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' : '') +
      '</div></div>';
  }

  /* ---------- Urus (akaun, kelas, admin) ---------- */
  async function renderUrus() {
    var admin = S.profil.peranan === 'admin';
    $app.innerHTML = '<div class="page">' +
      '<div class="row"><a class="icon-btn" href="#/" aria-label="Kembali ke halaman utama">' + I.back + '</a><div class="row" style="gap:10px">' + logo('urus', 40) + '<h2>Manage</h2></div></div>' +
      '<span class="section-title">Akaun</span>' +
      '<form class="card stack" style="padding:16px;gap:12px" data-form="akaun" novalidate>' +
        '<label class="field"><span>Nama</span><input class="input" name="nama" value="' + esc(S.profil.nama) + '"></label>' +
        '<p class="sub" style="margin:0">' + esc(S.profil.emel || '') + (admin ? ' · <b style="color:var(--acc)">Admin</b>' : '') + '</p>' +
        '<div class="row"><button class="btn" type="submit">Simpan nama</button><button class="btn secondary" type="button" data-act="keluar">Log keluar</button></div>' +
      '</form>' +
      '<div class="between"><span class="section-title">Kelas (' + S.kelas.length + ')</span><button class="btn ghost" data-act="tambah-kelas">+ Tambah kelas</button></div>' +
      (S.kelas.length ? '<div class="card list-card">' + S.kelas.map(function (k) {
        var w = warna(k.warna);
        return '<a class="list-item" href="#/urus/kelas/' + k.id + '"><span class="kelas-av" style="width:40px;height:40px;border-radius:13px;font-size:14px;background:' + w.g + ';--dot:' + w.dot + '"><span>' + esc(kodKelas(k.nama)) + '</span></span><span class="grow"><b style="display:block">' + esc(k.nama) + '</b><span class="sub">' + esc((k.subjek ? k.subjek + ' · ' : '') + bilMurid(k.id) + ' murid') + '</span></span><span class="muted">' + I.chev + '</span></a>';
      }).join('') + '</div>' : '<p class="sub">Belum ada kelas.</p>') +
      '<span class="section-title">Data saya</span>' +
      '<div class="card stack" style="padding:16px;gap:10px"><b>Muat turun semua data</b><span class="sub">Satu fail CSV (boleh dibuka dengan Excel atau Google Sheets) mengandungi semua murid, kehadiran, kerja rumah, TP dan markah anda. Simpan sebagai salinan pendua, contohnya sebulan sekali.</span><button class="btn secondary" data-act="eksport-csv">' + I.download + ' Muat turun CSV</button></div>' +
      (admin ? '<span class="section-title">Admin</span><div class="card stack" style="padding:16px;gap:12px" data-admin-kod><span class="sub">Memuatkan kod…</span></div><div class="card list-card" data-admin-guru><div class="list-item sub">Memuatkan senarai guru…</div></div>' : '') +
    '</div>';
    $app.querySelector('.page').insertAdjacentHTML('beforeend', '<p class="sub" style="text-align:center;margin:8px 0 0">EduTrack versi ' + VERSI + '</p>');
    if (admin) { muatKod(); muatGuru(); }
  }

  async function muatKod() {
    var box = $app.querySelector('[data-admin-kod]');
    if (!box) return;
    var r = await sb.rpc('kod_semasa');
    if (r.error) { box.innerHTML = '<p class="error">' + esc(errMsg(r.error)) + '</p>'; return; }
    box.innerHTML = '<span class="field"><span>Kod pendaftaran guru</span></span><div class="between"><span class="kod-box">' + esc(r.data) + '</span><button class="btn secondary" data-act="salin-kod" data-kod="' + esc(r.data) + '">Salin</button></div>' +
      '<p class="sub" style="margin:0">Kongsi kod ini dengan guru yang mahu mendaftar. Tukar kod jika ia tersebar; kod lama terus tidak sah.</p>' +
      '<button class="btn danger" data-act="tukar-kod">Tukar kod</button>';
  }

  async function muatGuru() {
    var box = $app.querySelector('[data-admin-guru]');
    if (!box) return;
    var r = await sb.from('profil').select('id,nama,emel,status,dicipta').eq('peranan', 'guru').order('dicipta', { ascending: false });
    if (r.error) { box.innerHTML = '<div class="list-item error">' + esc(errMsg(r.error)) + '</div>'; return; }
    var list = (r.data || []).sort(function (a, b) { return (a.status === 'menunggu' ? 0 : 1) - (b.status === 'menunggu' ? 0 : 1); });
    if (!list.length) { box.innerHTML = '<div class="list-item sub">Belum ada guru lain mendaftar.</div>'; return; }
    var lbl = { menunggu: ['wait', 'Menunggu'], lulus: ['ok', 'Lulus'], ditolak: ['no', 'Ditolak'] };
    box.innerHTML = list.map(function (g) {
      var b = lbl[g.status] || ['wait', g.status];
      return '<div class="list-item"><span class="murid-av">' + esc(inisial(g.nama)) + '</span><span class="grow"><b style="display:block">' + esc(g.nama || '(tiada nama)') + '</b><span class="sub" style="word-break:break-all">' + esc(g.emel || '') + '</span></span>' +
        '<span class="stack" style="gap:6px;align-items:flex-end"><span class="badge ' + b[0] + '">' + b[1] + '</span>' +
        (g.status !== 'lulus' ? '<button class="btn" style="min-height:36px;padding:6px 12px;font-size:13px" data-act="status-guru" data-id="' + g.id + '" data-status="lulus">Lulus</button>' : '') +
        (g.status === 'menunggu' ? '<button class="btn danger" style="min-height:36px;padding:6px 12px;font-size:13px" data-act="status-guru" data-id="' + g.id + '" data-status="ditolak">Tolak</button>' : '') +
        (g.status === 'lulus' ? '<button class="btn ghost" style="min-height:32px;font-size:13px;color:var(--danger)" data-act="status-guru" data-id="' + g.id + '" data-status="ditolak">Batal akses</button>' : '') +
        '</span></div>';
    }).join('');
  }

  /* ---------- Urus kelas ---------- */
  function renderUrusKelas(id) {
    var k = cariKelas(id);
    if (!k) return go('#/urus');
    var murid = muridKelas(k.id);
    var lain = S.kelas.filter(function (x) { return x.id !== k.id && bilMurid(x.id) > 0; });
    $app.innerHTML = '<div class="page">' +
      '<div class="row"><a class="icon-btn" href="#/kelas/' + k.id + '" aria-label="Kembali ke ' + esc(k.nama) + '">' + I.back + '</a><div class="row" style="gap:10px">' + logo('urus', 40) + '<div><h2>Manage ' + esc(k.nama) + '</h2><span class="sub">' + esc(k.subjek || '') + '</span></div></div></div>' +

      '<span class="section-title">Maklumat kelas</span>' +
      '<form class="card stack" style="padding:16px;gap:12px" data-form="kelas-edit" data-id="' + k.id + '" novalidate>' +
        '<label class="field"><span>Nama kelas</span><input class="input" name="nama" value="' + esc(k.nama) + '" required></label>' +
        '<label class="field"><span>Subjek</span><input class="input" name="subjek" value="' + esc(k.subjek) + '"></label>' +
        '<div class="field"><span>Warna</span><div class="swatches">' + swatches(k.warna) + '</div><input type="hidden" name="warna" value="' + k.warna + '"></div>' +
        '<p class="error" data-err></p><button class="btn" type="submit">Simpan</button>' +
      '</form>' +

      '<span class="section-title">Tambah murid</span>' +
      '<form class="card stack" style="padding:16px;gap:12px" data-form="tampal" data-id="' + k.id + '" novalidate>' +
        '<label class="field"><span>Tampal senarai nama (satu nama setiap baris)</span><textarea class="input" name="senarai" placeholder="Adam Danial&#10;Aisyah Sofea&#10;Amirul Hakim"></textarea></label>' +
        '<p class="sub" style="margin:0">Boleh salin terus dari Excel, Google Sheet atau WhatsApp. Nombor di depan nama akan dibuang secara automatik.</p>' +
        '<p class="error" data-err></p><button class="btn" type="submit">Tambah murid</button>' +
      '</form>' +
      (lain.length ? '<form class="card stack" style="padding:16px;gap:12px" data-form="salin-murid" data-id="' + k.id + '" novalidate>' +
        '<label class="field"><span>Atau salin murid dari kelas lain</span><select class="input" name="dari">' + lain.map(function (x) { return '<option value="' + x.id + '">' + esc(x.nama + (x.subjek ? ' · ' + x.subjek : '') + ' (' + bilMurid(x.id) + ' murid)') + '</option>'; }).join('') + '</select></label>' +
        '<p class="sub" style="margin:0">Sesuai bila cikgu ajar kelas yang sama untuk subjek lain. Murid yang sama dikongsi, jadi profil mereka digabungkan.</p>' +
        '<button class="btn secondary" type="submit">Salin murid</button></form>' : '') +

      '<div class="between"><span class="section-title">Senarai murid (' + murid.length + ')</span>' +
        (murid.length ? '<a class="btn ghost" href="#/cetak/' + k.id + '">Cetak sticker QR</a>' : '') + '</div>' +
      (murid.length ? '<div class="card list-card">' + murid.map(function (m, i) {
        return '<div class="list-item" data-murid-row="' + m.id + '"><span style="width:24px;font-size:12px;font-weight:700;color:var(--muted)">' + (m.no || i + 1) + '</span><span class="grow" style="font-weight:600">' + esc(m.nama) + '</span>' +
          '<button class="icon-sm" data-act="edit-murid" data-id="' + m.id + '" aria-label="Ubah nama ' + esc(m.nama) + '">' + I.edit + '</button>' +
          '<button class="icon-sm" data-act="buang-murid" data-id="' + m.id + '" data-kelas="' + k.id + '" aria-label="Buang ' + esc(m.nama) + ' dari kelas">' + I.trash + '</button></div>';
      }).join('') + '</div>' : '<p class="sub">Belum ada murid dalam kelas ini.</p>') +

      '<button class="btn danger block" style="margin-top:10px" data-act="padam-kelas" data-id="' + k.id + '">Padam kelas ini</button>' +
    '</div>';
  }

  function bersihSenarai(text) {
    return String(text || '').split(/\r?\n/).map(function (line) {
      var cells = line.split('\t').map(function (c) { return c.trim(); }).filter(Boolean);
      var best = cells.sort(function (a, b) { return (b.replace(/[^A-Za-z@'’\s]/g, '').length) - (a.replace(/[^A-Za-z@'’\s]/g, '').length); })[0] || '';
      return best.replace(/^\s*\d+\s*[.)\-:]?\s*/, '').replace(/\s+/g, ' ').trim();
    }).filter(function (n) { return n && /[A-Za-zÀ-￿]/.test(n); });
  }

  async function tambahMurid(kelasId, form) {
    var err = form.querySelector('[data-err]'), btn = form.querySelector('[type=submit]');
    var names = bersihSenarai(form.senarai.value);
    var ada = muridKelas(kelasId).map(function (m) { return m.nama.toLowerCase(); });
    var seen = {};
    names = names.filter(function (n) { var l = n.toLowerCase(); if (seen[l] || ada.indexOf(l) >= 0) return false; seen[l] = 1; return true; });
    if (!names.length) { err.textContent = 'Tiada nama baharu untuk ditambah.'; return; }
    btn.disabled = true; err.textContent = '';
    var r = await sb.from('murid').insert(names.map(function (n) { return { nama: n }; })).select('id,nama');
    if (r.error) { btn.disabled = false; err.textContent = errMsg(r.error); return; }
    var start = muridKelas(kelasId).reduce(function (mx, m) { return Math.max(mx, m.no || 0); }, 0);
    var byName = {}; r.data.forEach(function (m) { byName[m.nama] = m.id; });
    var links = names.map(function (n, i) { return { kelas_id: kelasId, murid_id: byName[n], no_giliran: start + i + 1 }; });
    var r2 = await sb.from('kelas_murid').insert(links);
    btn.disabled = false;
    if (r2.error) { err.textContent = errMsg(r2.error); return; }
    await loadData(true);
    toast(names.length + ' murid ditambah.');
    renderUrusKelas(kelasId);
  }

  async function salinMurid(kelasId, form) {
    var dari = form.dari.value, btn = form.querySelector('[type=submit]');
    var ada = muridKelas(kelasId).map(function (m) { return m.id; });
    var src = muridKelas(dari).filter(function (m) { return ada.indexOf(m.id) < 0; });
    if (!src.length) { toast('Semua murid kelas itu sudah ada di sini.'); return; }
    btn.disabled = true;
    var start = muridKelas(kelasId).reduce(function (mx, m) { return Math.max(mx, m.no || 0); }, 0);
    var r = await sb.from('kelas_murid').insert(src.map(function (m, i) { return { kelas_id: kelasId, murid_id: m.id, no_giliran: ada.length ? start + i + 1 : m.no }; }));
    btn.disabled = false;
    if (r.error) { toast(errMsg(r.error)); return; }
    await loadData(true);
    toast(src.length + ' murid disalin.');
    renderUrusKelas(kelasId);
  }

  function editMurid(id) {
    var m = S.murid.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    openSheet('<h2>Ubah nama murid</h2><form class="stack" style="gap:14px" data-form="murid-edit" data-id="' + id + '" novalidate><label class="field"><span>Nama</span><input class="input" name="nama" value="' + esc(m.nama) + '" required></label><p class="error" data-err></p><button class="btn block" type="submit">Simpan</button></form>', { label: 'Ubah nama murid', focus: 'input[name=nama]' });
  }

  async function buangMurid(muridId, kelasId) {
    var m = muridKelas(kelasId).filter(function (x) { return x.id === muridId; })[0];
    if (!m) return;
    var r = await sb.from('kelas_murid').delete().eq('kelas_id', kelasId).eq('murid_id', muridId);
    if (r.error) { toast(errMsg(r.error)); return; }
    await loadData(true);
    renderUrusKelas(kelasId);
    toast(m.nama + ' dibuang dari kelas.', async function () {
      var u = await sb.from('kelas_murid').insert({ kelas_id: kelasId, murid_id: muridId, no_giliran: m.no });
      if (u.error) { toast(errMsg(u.error)); return; }
      await loadData(true);
      if (location.hash === '#/urus/kelas/' + kelasId) renderUrusKelas(kelasId);
    });
  }


  /* ---------- Cetak sticker QR (A4, 3 x 8 = 24 label) ---------- */
  function labelHalaman(k, list) {
    var pages = [];
    for (var i = 0; i < list.length; i += 24) pages.push(list.slice(i, i + 24));
    return pages.map(function (p) {
      return '<div class="label-page">' + p.map(function (m) {
        return '<div class="label"><div class="qr">' + qrSvg(qrUrl(m.qr_token)) + '</div><div class="txt">' +
          '<span class="n">' + esc(m.nama) + '</span><span class="k">' + esc(k.nama + (k.subjek ? ' · ' + k.subjek : '')) + '</span><span class="b">EduTrack</span></div></div>';
      }).join('') + '</div>';
    }).join('');
  }

  function renderCetak(kelasId) {
    var k = cariKelas(kelasId);
    if (!k) return go('#/urus');
    var tok = {}; S.murid.forEach(function (m) { tok[m.id] = m.qr_token; });
    var list = muridKelas(k.id).map(function (m) { return { nama: m.nama, qr_token: tok[m.id] }; });
    var muka = Math.max(1, Math.ceil(list.length / 24));
    $app.innerHTML = '<div class="page">' +
      '<div class="row"><a class="icon-btn" href="#/urus/kelas/' + k.id + '" aria-label="Kembali">' + I.back + '</a><div><h2>Cetak sticker QR</h2><span class="sub">' + esc(k.nama + (k.subjek ? ' · ' + k.subjek : '')) + ' · ' + list.length + ' murid · ' + muka + ' helai A4</span></div></div>' +
      '<div class="card stack" style="padding:16px;gap:8px">' +
        '<b>Sebelum cetak</b>' +
        '<ol class="sub" style="margin:0;padding-left:18px;line-height:1.7">' +
          '<li>Masukkan kertas label A4 <b>24 keping (3 × 8, 70 × 37 mm)</b>.</li>' +
          '<li>Dalam tetingkap cetak, pilih saiz <b>A4</b>, skala <b>100% / Actual size</b>, dan margin <b>None</b>.</li>' +
          '<li>Cuba cetak 1 helai atas kertas biasa dahulu dan tindihkan pada kertas label untuk semak kedudukan.</li>' +
        '</ol>' +
      '</div>' +
      '<div class="row"><button class="btn grow" data-act="cetak">Cetak</button><button class="btn secondary" data-act="garis-panduan" aria-pressed="false">Garis label</button></div>' +
      '<div class="preview-wrap">' + labelHalaman(k, list) + '</div>' +
    '</div>';
    skalaPratonton();
    S.cetakHtml = labelHalaman(k, list);
  }

  function skalaPratonton() {
    var w = $app.querySelector('.preview-wrap');
    if (!w) return;
    var pages = w.querySelectorAll('.label-page');
    pages.forEach(function (p) { p.style.zoom = ''; });
    var px = pages.length ? pages[0].getBoundingClientRect().width : 794;
    var sc = w.clientWidth / (px || 794);
    pages.forEach(function (p, i) { p.style.zoom = sc; p.style.marginBottom = i < pages.length - 1 ? (8 / sc) + 'px' : '0'; });
  }
  window.addEventListener('resize', function () { if (/^#\/cetak\//.test(location.hash)) skalaPratonton(); });

  function cetakSekarang() {
    var root = document.getElementById('print-root');
    var w = $app.querySelector('.preview-wrap');
    if (w && w.querySelector('.lap-page')) {
      var c = w.cloneNode(true);
      Array.prototype.forEach.call(c.querySelectorAll('.label-page'), function (p) { p.style.zoom = ''; p.style.marginBottom = ''; });
      Array.prototype.forEach.call(c.querySelectorAll('[contenteditable]'), function (e) { e.removeAttribute('contenteditable'); });
      root.innerHTML = c.innerHTML;
    } else root.innerHTML = S.cetakHtml || '';
    setTimeout(function () { window.print(); }, 50);
  }
  window.addEventListener('afterprint', function () { var r = document.getElementById('print-root'); if (r) r.innerHTML = ''; });

  /* ---------- Scan QR ---------- */
  function renderScan() {
    $app.innerHTML = '<div class="scan-page">' +
      '<video playsinline muted></video>' +
      '<div class="scan-top"><button class="scan-btn-round" data-act="back" aria-label="Tutup scan">' + I.close + '</button><b>Scan QR murid</b><span style="width:44px"></span></div>' +
      '<div class="scan-frame" aria-hidden="true"></div>' +
      '<div class="scan-msg" data-scan-msg>Halakan kamera ke sticker QR pada buku</div>' +
    '</div>';
    var video = $app.querySelector('video'), msg = $app.querySelector('[data-scan-msg]');
    if (!window.QrScanner) { msg.textContent = 'Pembaca QR gagal dimuatkan. Muat semula app.'; msg.className = 'scan-msg err'; return; }
    var sibuk = false;
    var sc = new window.QrScanner(video, function (res) {
      if (sibuk) return;
      sibuk = true;
      var t = ambilToken(res && res.data);
      if (!t) { tunjuk('Ini bukan QR EduTrack.', true); return lepas(); }
      cariToken(t).then(function (m) {
        if (!m) { tunjuk('Murid ini tiada dalam senarai anda.', true); return lepas(); }
        if (navigator.vibrate) navigator.vibrate(60);
        hentiScanner();
        go('#/murid/' + m.id);
      }).catch(function (e) { tunjuk(errMsg(e), true); lepas(); });
    }, { returnDetailedScanResult: true, preferredCamera: 'environment', maxScansPerSecond: 8 });
    function tunjuk(t, err) { msg.textContent = t; msg.className = 'scan-msg' + (err ? ' err' : ''); }
    function lepas() { setTimeout(function () { sibuk = false; tunjuk('Halakan kamera ke sticker QR pada buku'); }, 1800); }
    S.scanner = sc;
    if (!navigator.mediaDevices) { tunjukRalatKamera(msg, 'NotSupported', 'scan-msg'); return; }
    sc.start().then(kunciSkrin).catch(function (e) { sibuk = true; tunjukRalatKamera(msg, e, 'scan-msg'); });
  }

  async function cariToken(t) {
    var m = S.murid.filter(function (x) { return x.qr_token === t; })[0];
    if (m) return m;
    var r = await sb.from('murid').select('id').eq('qr_token', t).maybeSingle();
    if (r.error) throw r.error;
    if (r.data) await loadData(true);
    return r.data;
  }

  async function bukaToken(t) {
    var tok = ambilToken('#/m/' + t);
    var m = tok ? await cariToken(tok) : null;
    if (m) { location.replace('#/murid/' + m.id); return; }
    $app.innerHTML = '<div class="page"><div class="empty" style="margin:auto"><h2>Murid tidak dijumpai</h2><p class="sub">QR ini bukan milik murid dalam senarai anda, atau kod QR telah ditukar.</p><a class="btn" href="#/">Ke halaman utama</a></div></div>';
  }

  /* ---------- Student Profile (asas) ---------- */
  function renderMurid(id) {
    var m = S.murid.filter(function (x) { return x.id === id; })[0];
    if (!m) return go('#/');
    var links = (m.kelas_murid || []).map(function (l) { return { k: cariKelas(l.kelas_id), no: l.no_giliran }; }).filter(function (x) { return x.k; });
    var w = warna(links.length ? links[0].k.warna : 3);
    $app.innerHTML = '<div class="page">' +
      '<div class="row"><button class="icon-btn" data-act="back" aria-label="Kembali">' + I.back + '</button><div class="row" style="gap:10px">' + logo('profil', 40) + '<h2>Student Profile</h2></div></div>' +
      '<div class="card profil-head">' +
        '<span class="profil-av" style="background:' + w.g + '">' + esc(inisial(m.nama)) + '</span>' +
        '<h1 style="font-size:22px">' + esc(m.nama) + '</h1>' +
        '<div class="row" style="gap:6px;flex-wrap:wrap;justify-content:center">' + links.map(function (x) {
          return '<a class="chip" style="background:var(--tint-now);color:var(--acc)" href="#/kelas/' + x.k.id + '">' + esc(x.k.nama + (x.k.subjek ? ' · ' + x.k.subjek : '')) + (x.no ? ' · No. ' + x.no : '') + '</a>';
        }).join('') + '</div>' +
      '</div>' +
      '<span class="section-title">Rekod</span>' +
      '<div class="card list-card">' +
        '<div class="list-item" style="align-items:flex-start">' + logo('attendx', 36) + '<span class="grow" data-prof-hadir><b style="display:block">AttendX</b><span class="sub">Memuatkan…</span></span></div>' +
        '<div class="list-item" style="align-items:flex-start">' + logo('tasktrack', 36) + '<span class="grow" data-prof-kr><b style="display:block">TaskTrack</b><span class="sub">Memuatkan…</span></span></div>' +
        '<div class="list-item" style="align-items:flex-start">' + logo('assessment', 36) + '<span class="grow" data-prof-as><b style="display:block">Assessment</b><span class="sub">Memuatkan…</span></span></div>' +
      '</div>' +
      (links.length ? '<button class="btn secondary block" data-act="kongsi-murid" data-id="' + m.id + '">' + I.share + ' Kongsi ringkasan kepada ibu bapa</button>' : '') +
      '<span class="section-title">QR murid</span>' +
      '<div class="card stack" style="padding:16px;align-items:center;gap:12px">' +
        '<div class="qr-box" role="img" aria-label="Kod QR ' + esc(m.nama) + '">' + qrSvg(qrUrl(m.qr_token)) + '</div>' +
        '<p class="sub" style="margin:0;text-align:center">QR ini hanya mengandungi kod rawak. Orang lain yang scan tidak akan nampak apa-apa.</p>' +
        '<button class="btn danger block" data-act="jana-qr" data-id="' + m.id + '">Jana QR baharu (sticker hilang)</button>' +
      '</div>' +
    '</div>';
    muatHadirMurid(m.id, links);
    muatKrMurid(m.id, links);
    muatAsMurid(m.id);
  }

  async function muatHadirMurid(muridId, links) {
    var r = await sb.from('kehadiran').select('kelas_id,tarikh,hadir,sebab').eq('murid_id', muridId).order('tarikh', { ascending: false }).limit(1000);
    var el = $app.querySelector('[data-prof-hadir]');
    if (!el) return;
    if (r.error) { el.innerHTML = '<b style="display:block">AttendX</b><span class="error">' + esc(errMsg(r.error)) + '</span>'; return; }
    var data = r.data || [];
    if (!data.length) { el.innerHTML = '<b style="display:block">AttendX</b><span class="sub">Belum ada rekod kehadiran.</span>'; return; }
    var perKelas = links.map(function (x) {
      var d = data.filter(function (h) { return h.kelas_id === x.k.id; });
      var hadir = d.filter(function (h) { return h.hadir; }).length;
      return { k: x.k, jumlah: d.length, hadir: hadir };
    }).filter(function (x) { return x.jumlah > 0; });
    var tak = data.filter(function (h) { return !h.hadir; }).slice(0, 5);
    el.innerHTML = '<b style="display:block">AttendX</b>' +
      perKelas.map(function (x) {
        var pct = Math.round(x.hadir / x.jumlah * 100);
        return '<span class="sub" style="display:block">' + esc(x.k.nama + (x.k.subjek ? ' · ' + x.k.subjek : '')) + ': <b style="color:' + (pct < 80 ? 'var(--danger)' : 'var(--ok)') + '">' + pct + '%</b> (' + x.hadir + '/' + x.jumlah + ')</span>';
      }).join('') +
      (tak.length ? '<span class="sub" style="display:block;margin-top:6px">Tidak hadir terkini: ' + tak.map(function (h) { return esc(labelTarikh(h.tarikh).replace('Hari ini · ', '') + (h.sebab ? ' (' + h.sebab + ')' : '')); }).join(', ') + '</span>' : '<span class="sub" style="display:block;margin-top:6px">Tiada rekod tidak hadir.</span>');
  }

  async function muatKrMurid(muridId, links) {
    var r = await sb.from('status_tugasan').select('siap,tugasan(tajuk,tarikh,kelas_id)').eq('murid_id', muridId).limit(1000);
    var el = $app.querySelector('[data-prof-kr]');
    if (!el) return;
    if (r.error) { el.innerHTML = '<b style="display:block">TaskTrack</b><span class="error">' + esc(errMsg(r.error)) + '</span>'; return; }
    var data = (r.data || []).filter(function (x) { return x.tugasan; });
    if (!data.length) { el.innerHTML = '<b style="display:block">TaskTrack</b><span class="sub">Belum ada rekod kerja rumah.</span>'; return; }
    var perKelas = links.map(function (x) {
      var d = data.filter(function (h) { return h.tugasan.kelas_id === x.k.id; });
      return { k: x.k, jumlah: d.length, siap: d.filter(function (h) { return h.siap; }).length };
    }).filter(function (x) { return x.jumlah > 0; });
    var tak = data.filter(function (h) { return !h.siap; }).sort(function (a, b) { return a.tugasan.tarikh < b.tugasan.tarikh ? 1 : -1; });
    el.innerHTML = '<b style="display:block">TaskTrack</b>' +
      perKelas.map(function (x) {
        return '<span class="sub" style="display:block">' + esc(x.k.nama + (x.k.subjek ? ' · ' + x.k.subjek : '')) + ': <b>' + x.siap + '/' + x.jumlah + '</b> siap</span>';
      }).join('') +
      (tak.length ? '<span class="sub" style="display:block;margin-top:6px;color:#C2410C"><b>Belum siap:</b> ' + tak.slice(0, 5).map(function (h) { return esc(h.tugasan.tajuk); }).join(', ') + (tak.length > 5 ? ' dan ' + (tak.length - 5) + ' lagi' : '') + '</span>' : '<span class="sub" style="display:block;margin-top:6px">Tiada kerja rumah tertunggak.</span>');
  }

  async function muatAsMurid(muridId) {
    var res = await Promise.all([
      sb.from('pbd_tp').select('tp,pbd_item(tajuk,urutan,subjek)').eq('murid_id', muridId).limit(1000),
      sb.from('markah').select('markah,penilaian(tajuk,markah_penuh,tarikh,jenis)').eq('murid_id', muridId).limit(1000)
    ]);
    var el = $app.querySelector('[data-prof-as]');
    if (!el) return;
    var e = res[0].error || res[1].error;
    if (e) { el.innerHTML = '<b style="display:block">Assessment</b><span class="error">' + esc(errMsg(e)) + '</span>'; return; }
    var tp = (res[0].data || []).filter(function (x) { return x.pbd_item; }).sort(function (a, b) { return a.pbd_item.urutan - b.pbd_item.urutan; });
    var mk = (res[1].data || []).filter(function (x) { return x.penilaian; }).sort(function (a, b) { return a.penilaian.tarikh < b.penilaian.tarikh ? 1 : -1; });
    if (!tp.length && !mk.length) { el.innerHTML = '<b style="display:block">Assessment</b><span class="sub">Belum ada rekod PBD atau markah.</span>'; return; }
    el.innerHTML = '<b style="display:block">Assessment</b>' +
      (tp.length ? '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px">' + tp.map(function (x) {
        var w = TP_WARNA[x.tp];
        return '<span class="chip" style="background:' + w[0] + ';color:' + w[1] + '" title="' + esc(x.pbd_item.tajuk) + '">' + esc(x.pbd_item.tajuk.length > 22 ? x.pbd_item.tajuk.slice(0, 21) + '…' : x.pbd_item.tajuk) + ' · TP' + x.tp + '</span>';
      }).join('') + '</div>' : '') +
      (mk.length ? '<span class="sub" style="display:block;margin-top:6px">' + mk.slice(0, 5).map(function (x) {
        return esc(x.penilaian.tajuk) + ': <b>' + nomb(x.markah) + '/' + nomb(x.penilaian.markah_penuh) + '</b> (' + Math.round(x.markah / x.penilaian.markah_penuh * 100) + '%)';
      }).join('<br>') + '</span>' : '');
  }

  async function janaQrBaru(id) {
    var m = S.murid.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    if (!window.confirm('Jana QR baharu untuk ' + m.nama + '? Sticker lama terus tidak boleh digunakan, dan sticker baharu perlu dicetak.')) return;
    var r = await sb.from('murid').update({ qr_token: tokenBaru() }).eq('id', id);
    if (r.error) { toast(errMsg(r.error)); return; }
    await loadData(true);
    toast('QR baharu dijana. Cetak semula sticker murid ini.');
    renderMurid(id);
  }

  /* ---------- Tindakan (klik) ---------- */
  var ACT = {
    'reload': function () { S.loaded = false; route(); },
    'auth-tab': function (el) { S.authTab = el.dataset.tab; renderAuth(); },
    'ke-masuk': function () { S.authTab = 'masuk'; renderAuth(); },
    'lupa': function () { lupaLaluan(); },
    'keluar': async function () {
      var c = kiraOutbox();
      if ((c.tunggu || c.gagal) && !confirm((c.tunggu + c.gagal) + ' rekod belum dihantar dan akan HILANG jika anda log keluar sekarang.\nTekan Batal, sambung ke internet, dan tunggu rekod dihantar dahulu.\n\nLog keluar juga?')) return;
      padamCacheTelefon();
      await sb.auth.signOut(); S.profil = null; S.loaded = false; S.kelas = []; S.murid = []; location.hash = '#/'; renderAuth(); },
    'semak-status': async function () { await ensureProfil(true); route(); },
    'mod': function () { pref.set('mod', isMod('dark') ? 'light' : 'dark'); applyTheme(); route(); },
    'tema': function () { sheetTema(); },
    'set-mod': function (el) { pref.set('mod', el.dataset.mod); applyTheme(); sheetTema(); rerenderBelakang(); },
    'set-tema': function (el) { pref.set('tema', el.dataset.tema); applyTheme(); sheetTema(); },
    'sheet-close': function () { closeSheet(); },
    'sheet-close-bg': function (el, e) { if (e.target === el) closeSheet(); },
    'tambah-kelas': function () { sheetKelasBaru(); },
    'pilih-warna': function (el) {
      var wrap = el.closest('form');
      wrap.querySelectorAll('.swatch').forEach(function (s) { s.setAttribute('aria-pressed', String(s === el)); });
      wrap.querySelector('input[name=warna]').value = el.dataset.warna;
    },
    'pin': async function (el) {
      var k = cariKelas(el.dataset.id); if (!k) return;
      var baru = !k.disemat; k.disemat = baru;
      var list = $app.querySelector('[data-home-list]'); if (list) list.innerHTML = homeList();
      var r = await sb.from('kelas').update({ disemat: baru }).eq('id', k.id);
      if (r.error) { k.disemat = !baru; toast(errMsg(r.error)); if (list) list.innerHTML = homeList(); }
    },
    'scan': function () { go('#/scan'); },
    'back': function () { if (history.length > 1) history.back(); else go('#/'); },
    'cetak': function () { cetakSekarang(); },
    'garis-panduan': function (el) { var w = $app.querySelector('.preview-wrap'); if (w) { w.classList.toggle('guides'); el.setAttribute('aria-pressed', String(w.classList.contains('guides'))); } },
    'jana-qr': function (el) { janaQrBaru(el.dataset.id); },
    'alert': function () { toast('Akan aktif selepas modul TaskTrack siap.'); },
    'alert-lama': function (el) { sheetLamaTakHadir(el.dataset.id); },
    'alert-kr': function (el) { sheetKrTertunggak(el.dataset.id); },
    'an-tempoh': function (el) { location.replace('#/modul/analisis/' + el.dataset.id + '/' + el.dataset.t); },
    'an-had': function () { sheetHad(); },
    'had-asal': function (el) { var f = el.closest('form'); Object.keys(HAD_ASAL).forEach(function (k) { f[k].value = HAD_ASAL[k]; }); },
    'an-laporan': function () { sheetLaporan(); },
    'eksport-csv': function (el) { eksportCsv(el); },
    'outbox': function () { sheetOutbox(); },
    'outbox-hantar': async function () { closeSheet(); await hantarOutbox(true); },
    'outbox-buang': function () { if (!confirm('Buang rekod yang ditolak? Ia tidak boleh dikembalikan.')) return; tulisOutbox(bacaOutbox().filter(function (x) { return !x.gagal; })); closeSheet(); kemasPetunjukOutbox(); toast('Rekod yang ditolak dibuang.'); },
    'gred': function () { sheetGred(); },
    'gred-kosong': function (el) { simpanGred(el.closest('form'), true); },
    'kongsi-murid': function (el) { pilihKelasKongsi(el.dataset.id); },
    'kongsi-kelas': function (el) { var m = S.murid.filter(function (x) { return x.id === el.dataset.id; })[0]; sediaKongsi(m, cariKelas(el.dataset.kelas)); },
    'kongsi-fail': function () { var f = S.failKongsi; if (!f) return; if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f] }).catch(function () {}); else { muatTurun(f); toast('Gambar dimuat turun. Hantar melalui WhatsApp.'); } },
    'muat-fail': function () { if (S.failKongsi) muatTurun(S.failKongsi); },
    'kongsi-csv': function () { var f = S.failCsv; if (!f) return; navigator.share({ files: [f], title: f.name }).then(closeSheet).catch(function (e) { if (!/Abort/i.test(String(e && e.name))) { muatTurun(f); closeSheet(); } }); },
    'muat-csv': function () { if (S.failCsv) muatTurun(S.failCsv); closeSheet(); },
    'salin-pautan': function () { var u = location.href; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('Pautan disalin. Tampal dalam pelayar.'); }).catch(function () { window.prompt('Salin pautan ini:', u); }); },
    'as-tab': function (el) { location.replace('#/modul/assessment/' + el.dataset.id + '/' + el.dataset.tab); },
    'pbd-tulis': function (el) { sheetTulisBab(el.dataset.id); },
    'pbd-ubah': function () { sheetUbahBab(); },
    'pbd-padam': function () { padamBab(); },
    'tp-pilih': function (el) { S.pbd.pilih = +el.dataset.tp; lukisPbd(); },
    'tp-semua': function () { var p = S.pbd; simpanTp(muridKelas(p.kelasId).filter(function (m) { return !p.rows[m.id]; }).map(function (m) { return [m.id, p.pilih]; })); },
    'nilai-baru': function (el) { sheetPenilaian(el.dataset.id, el.dataset.jenis); },
    'nilai-ubah': function () { sheetPenilaian(S.nilai.kelasId, null, S.nilai.p); },
    'nilai-padam': function () { padamPenilaian(); },
    'tt-baru': function (el) { sheetTugasanBaru(el.dataset.id); },
    'tt-ubah': function () { sheetTugasanBaru(S.tt.kelasId, S.tt.tugasan); },
    'tt-padam': function () { padamTugasan(); },
    'tt-semua': function () { var tt = S.tt; simpanStatus(muridKelas(tt.kelasId).filter(function (m) { return tt.rows[m.id] === undefined; }).map(function (m) { return [m.id, true]; })); },
    'tt-kutip': function () { sediaBunyi(); go('#/kutip/' + S.tt.kelasId + '/' + S.tt.tugasan.id); },
    'kutip-selesai': function () { selesaiKutip(); },
    'kutip-tutup': function () { hentiScanner(); go('#/modul/tasktrack/' + S.tt.kelasId + '/' + S.tt.tugasan.id); },
    'ax-semua': function () { simpanSemuaHadir(); },
    'ax-pilih': function (el) { closeSheet(); setHadir(el.dataset.id, el.dataset.hadir === '1', el.dataset.sebab || null); },
    'senarai-murid': function (el) { sheetMurid(el.dataset.id, !!el.dataset.cari); },
    'profil-murid': function (el) { go('#/murid/' + el.dataset.id); },
    'edit-murid': function (el) { editMurid(el.dataset.id); },
    'buang-murid': function (el) { buangMurid(el.dataset.id, el.dataset.kelas); },
    'padam-kelas': async function (el) {
      var k = cariKelas(el.dataset.id); if (!k) return;
      if (!window.confirm('Padam kelas "' + k.nama + (k.subjek ? ' · ' + k.subjek : '') + '"? Semua rekod kelas ini akan dipadam dan tidak boleh dikembalikan.')) return;
      var r = await sb.from('kelas').delete().eq('id', k.id);
      if (r.error) { toast(errMsg(r.error)); return; }
      await loadData(true); toast('Kelas dipadam.'); go('#/urus');
    },
    'salin-kod': function (el) {
      var kod = el.dataset.kod;
      if (navigator.clipboard) navigator.clipboard.writeText(kod).then(function () { toast('Kod disalin.'); }, function () { toast('Kod: ' + kod); });
      else toast('Kod: ' + kod);
    },
    'tukar-kod': async function () {
      if (!window.confirm('Tukar kod pendaftaran? Kod lama terus tidak boleh digunakan.')) return;
      var r = await sb.rpc('tukar_kod', { kod_baru: null });
      if (r.error) { toast(errMsg(r.error)); return; }
      toast('Kod baharu: ' + r.data); muatKod();
    },
    'status-guru': async function (el) {
      var r = await sb.rpc('tetap_status_guru', { guru: el.dataset.id, status_baru: el.dataset.status });
      if (r.error) { toast(errMsg(r.error)); return; }
      toast(el.dataset.status === 'lulus' ? 'Guru diluluskan.' : 'Status guru dikemas kini.'); muatGuru();
    }
  };

  function rerenderBelakang() {
    var h = location.hash.replace(/^#\/?/, '').split('/');
    if (!h[0]) renderHome();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = ACT[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn(el, e);
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset.input === 'cari') {
      S.q = el.value;
      var list = $app.querySelector('[data-home-list]');
      if (list) list.innerHTML = homeList();
    } else if (el.dataset.input === 'cari-murid') {
      var box = $sheet.querySelector('[data-murid-list]');
      if (box) box.innerHTML = senaraiMuridHtml(el.dataset.id, el.value.trim());
    }
  });

  /* ---------- Borang ---------- */
  var FORM = {
    'tugasan': simpanTugasan,
    'pbd-tulis': simpanBab,
    'gred': function (form) { return simpanGred(form, false); },
    'had': simpanHad,
    'penilaian': simpanPenilaian,
    'pbd-ubah': async function (form) {
      var err = form.querySelector('[data-err]'), t = form.tajuk.value.trim();
      if (!t) { err.textContent = 'Tajuk tidak boleh kosong.'; return; }
      var r = await sb.from('pbd_item').update({ tajuk: t }).eq('id', S.pbd.item.id);
      if (r.error) { err.textContent = errMsg(r.error); return; }
      S.pbd.item.tajuk = t; closeSheet(); lukisPbd(); toast('Tajuk dikemas kini.');
    },
    'masuk': submitMasuk,
    'daftar': submitDaftar,
    'laluan-baru': async function (form) {
      var err = form.querySelector('[data-err]'), v = form.laluan.value;
      if (v.length < 6) { err.textContent = 'Kata laluan mesti sekurang-kurangnya 6 aksara.'; return; }
      var r = await sb.auth.updateUser({ password: v });
      if (r.error) { err.textContent = errMsg(r.error); return; }
      S.recovery = false; toast('Kata laluan dikemas kini.'); route();
    },
    'kelas-baru': async function (form) {
      var err = form.querySelector('[data-err]'), btn = form.querySelector('[type=submit]');
      var nama = form.nama.value.trim(), subjek = form.subjek.value.trim(), w = parseInt(form.warna.value, 10) || 0;
      if (!nama) { err.textContent = 'Isi nama kelas.'; return; }
      btn.disabled = true;
      var r = await sb.from('kelas').insert({ nama: nama, subjek: subjek, warna: w }).select('id').single();
      btn.disabled = false;
      if (r.error) { err.textContent = errMsg(r.error); return; }
      await loadData(true); closeSheet(); toast('Kelas ditambah. Masukkan senarai murid.'); go('#/urus/kelas/' + r.data.id);
    },
    'kelas-edit': async function (form) {
      var err = form.querySelector('[data-err]');
      var nama = form.nama.value.trim();
      if (!nama) { err.textContent = 'Isi nama kelas.'; return; }
      var r = await sb.from('kelas').update({ nama: nama, subjek: form.subjek.value.trim(), warna: parseInt(form.warna.value, 10) || 0 }).eq('id', form.dataset.id);
      if (r.error) { err.textContent = errMsg(r.error); return; }
      await loadData(true); toast('Maklumat kelas disimpan.'); renderUrusKelas(form.dataset.id);
    },
    'tampal': function (form) { return tambahMurid(form.dataset.id, form); },
    'salin-murid': function (form) { return salinMurid(form.dataset.id, form); },
    'murid-edit': async function (form) {
      var err = form.querySelector('[data-err]'), nama = form.nama.value.trim();
      if (!nama) { err.textContent = 'Isi nama murid.'; return; }
      var r = await sb.from('murid').update({ nama: nama }).eq('id', form.dataset.id);
      if (r.error) { err.textContent = errMsg(r.error); return; }
      await loadData(true); closeSheet(); toast('Nama murid dikemas kini.'); route();
    },
    'akaun': async function (form) {
      var nama = form.nama.value.trim();
      if (!nama) { toast('Isi nama.'); return; }
      var r = await sb.from('profil').update({ nama: nama }).eq('id', S.profil.id);
      if (r.error) { toast(errMsg(r.error)); return; }
      S.profil.nama = nama; toast('Nama disimpan.'); renderUrus();
    }
  };

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    var fn = FORM[form.dataset.form];
    if (fn) Promise.resolve(fn(form)).catch(function (er) { toast(errMsg(er)); });
  });

  /* ---------- Status rangkaian ---------- */
  function kemasSaved() { var el = $app.querySelector('[data-saved]'); if (el) el.outerHTML = savedChip(); }
  window.addEventListener('online', kemasSaved);
  window.addEventListener('offline', kemasSaved);

  /* ---------- Muat turun semua data (CSV) ---------- */
  async function ambilSemua(table, cols, susun) {
    var semua = [], dari = 0, SAIZ = 1000;
    for (;;) {
      var q = sb.from(table).select(cols);
      susun.forEach(function (c) { q = q.order(c); });
      var r = await q.range(dari, dari + SAIZ - 1);
      if (r.error) throw r.error;
      semua = semua.concat(r.data || []);
      if (!r.data || r.data.length < SAIZ) return semua;
      dari += SAIZ;
    }
  }
  function sel(v) { v = v == null ? '' : String(v); return /[",\r\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function tarikhDMY(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }

  async function eksportCsv(btn) {
    btn.disabled = true; var asal = btn.innerHTML; btn.textContent = 'Menyediakan…';
    try {
      var res = await Promise.all([
        ambilSemua('kehadiran', 'kelas_id,murid_id,tarikh,hadir,sebab', ['tarikh', 'kelas_id', 'murid_id']),
        ambilSemua('status_tugasan', 'tugasan_id,murid_id,siap,tugasan(kelas_id,tajuk,tarikh)', ['tugasan_id', 'murid_id']),
        ambilSemua('pbd_tp', 'item_id,kelas_id,murid_id,tp,pbd_item(tajuk,urutan)', ['item_id', 'murid_id']),
        ambilSemua('markah', 'penilaian_id,murid_id,markah,penilaian(kelas_id,jenis,tajuk,tarikh,markah_penuh)', ['penilaian_id', 'murid_id'])
      ]);
      var kelas = {}; S.kelas.forEach(function (k) { kelas[k.id] = k; });
      var murid = {}, no = {};
      S.murid.forEach(function (m) { murid[m.id] = m; (m.kelas_murid || []).forEach(function (x) { no[x.kelas_id + '|' + m.id] = x.no_giliran; }); });
      var baris = [['Jenis', 'Kelas', 'Subjek', 'No', 'Nama murid', 'Tarikh', 'Perkara', 'Nilai', 'Catatan']];
      function b(jenis, kelasId, muridId, tarikh, perkara, nilai, catatan) {
        var k = kelas[kelasId] || {}, m = murid[muridId] || {};
        baris.push([jenis, k.nama || '', k.subjek || '', no[kelasId + '|' + muridId] || '', m.nama || '(murid telah dibuang)', tarikhDMY(tarikh), perkara, nilai, catatan || '']);
      }
      S.kelas.forEach(function (k) { muridKelas(k.id).forEach(function (m) { b('Murid', k.id, m.id, '', 'Senarai murid', '', ''); }); });
      res[0].forEach(function (r) { b('Kehadiran', r.kelas_id, r.murid_id, r.tarikh, 'Kehadiran', r.hadir ? 'Hadir' : 'Tidak hadir', r.sebab); });
      res[1].forEach(function (r) { if (r.tugasan) b('Kerja rumah', r.tugasan.kelas_id, r.murid_id, r.tugasan.tarikh, r.tugasan.tajuk, r.siap ? 'Siap' : 'Tidak siap', ''); });
      res[2].forEach(function (r) { if (r.pbd_item) b('PBD', r.kelas_id, r.murid_id, '', r.pbd_item.tajuk, 'TP' + r.tp, ''); });
      res[3].forEach(function (r) { var p = r.penilaian; if (p) b(p.jenis === 'kuiz' ? 'Kuiz' : 'Peperiksaan', p.kelas_id, r.murid_id, p.tarikh, p.tajuk, nomb(r.markah) + '/' + nomb(p.markah_penuh), Math.round(r.markah / p.markah_penuh * 100) + '%'); });
      var csv = '﻿' + baris.map(function (r) { return r.map(sel).join(','); }).join('\r\n');
      var nama = 'EduTrack-data-' + hariIni() + '.csv';
      var fail = new File([csv], nama, { type: 'text/csv' });
      var mudahAlih = /Android|iPhone|iPad/.test(navigator.userAgent || '');
      if (mudahAlih && navigator.canShare && navigator.canShare({ files: [fail] })) {
        S.failCsv = fail;
        openSheet('<h2>Fail sedia</h2><p class="sub" style="margin:0">' + (baris.length - 1) + ' baris data. Tekan Simpan, kemudian pilih <b>Simpan ke Fail</b>, <b>Google Drive</b> atau aplikasi lain.</p><button class="btn block" data-act="kongsi-csv">' + I.download + ' Simpan</button><button class="btn ghost block" data-act="muat-csv">Muat turun terus</button>', { label: 'Fail sedia' });
      } else { muatTurun(fail); toast('Fail dimuat turun: ' + nama); }
    } catch (e) { toast('Gagal: ' + errMsg(e)); }
    btn.disabled = false; btn.innerHTML = asal;
  }
  function muatTurun(fail) {
    var url = URL.createObjectURL(fail), a = document.createElement('a');
    a.href = url; a.download = fail.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  /* ---------- Versi baharu ---------- */
  var semakTerakhir = 0;
  function semakVersi() {
    if (Date.now() - semakTerakhir < 60000) return;
    semakTerakhir = Date.now();
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update().catch(function () {}); }).catch(function () {});
    }
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.v && String(d.v) !== VERSI && !document.getElementById('versi-baru')) {
        var el = document.createElement('div');
        el.id = 'versi-baru';
        el.setAttribute('role', 'status');
        el.innerHTML = '<span>Versi baharu EduTrack tersedia.</span><button type="button">Muat semula</button>';
        el.querySelector('button').onclick = function () { location.reload(); };
        document.body.appendChild(el);
      }
    }).catch(function () { /* luar talian: abaikan */ });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') semakVersi(); });

  /* ---------- Mula ---------- */
  async function init() {
    applyTheme();
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', function () { if (pref.get('mod', null) === null) { applyTheme(); route(); } });
    }
    var r = await sb.auth.getSession();
    S.session = r.data.session;
    sb.auth.onAuthStateChange(function (ev, session) {
      var sebelum = S.session && S.session.user.id;
      S.session = session;
      if (ev === 'PASSWORD_RECOVERY') { S.recovery = true; route(); return; }
      if (ev === 'SIGNED_OUT') { S.profil = null; S.loaded = false; route(); return; }
      if (ev === 'SIGNED_IN' && (session && session.user.id) !== sebelum) { S.profil = null; S.loaded = false; setTimeout(route, 0); }
    });
    window.addEventListener('hashchange', route);
    route();
    semakVersi();
  }

  init();
})();
