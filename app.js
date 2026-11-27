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
  function hentiScanner() {
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
    { id: 'attendx', nama: 'AttendX', desc: 'Rekod kehadiran', rancang: ['Semua murid hadir secara default, tanda yang tidak hadir sahaja', 'Tekan lama untuk sebab: MC, Lewat, Ponteng, Aktiviti', 'Rekod setiap kali masuk kelas'] },
    { id: 'tasktrack', nama: 'TaskTrack', desc: 'Kerja rumah · kutip buku', rancang: ['Beri kerja rumah dengan tajuk dan tarikh hantar', 'Tanda Siap / Tidak siap', 'Mod Kutip Buku: scan buku yang dihantar'] },
    { id: 'assessment', nama: 'Assessment', desc: 'PBD · kuiz · peperiksaan', rancang: ['PBD dengan butang TP1 hingga TP6', 'Markah kuiz dan peperiksaan dengan papan nombor besar', 'Auto ke murid seterusnya'] },
    { id: 'profil', nama: 'Student Profile', desc: 'Profil murid · QR' },
    { id: 'analisis', nama: 'Analisis', desc: 'Statistik · laporan', rancang: ['Ringkasan kehadiran, kerja rumah dan PBD kelas', 'Jana laporan PDF / Excel', 'Laporan individu murid'] },
    { id: 'urus', nama: 'Urus', desc: 'Murid · kelas · QR' }
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
    if (r.error) throw r.error;
    S.profil = r.data;
    return r.data;
  }

  async function loadData(force) {
    if (S.loaded && !force) return;
    var res = await Promise.all([
      sb.from('kelas').select('id,nama,subjek,warna,disemat,dicipta').order('dicipta'),
      sb.from('murid').select('id,nama,qr_token,kelas_murid(kelas_id,no_giliran)').order('nama')
    ]);
    if (res[0].error) throw res[0].error;
    if (res[1].error) throw res[1].error;
    S.kelas = res[0].data || [];
    S.murid = res[1].data || [];
    S.loaded = true;
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
        '<a class="avatar-btn" href="#/urus" aria-label="Akaun dan urus">' + esc(inisial(S.profil.nama)) + '</a>' +
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
    var on = navigator.onLine !== false;
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
        '<div class="alert-grid">' +
          '<button class="alert" data-act="alert"><b style="color:#DC2626">–</b><span>Lama tak hadir</span></button>' +
          '<button class="alert" data-act="alert"><b style="color:#EA580C">–</b><span>KR tak siap</span></button>' +
          '<button class="alert" data-act="alert"><b style="color:#7C3AED">–</b><span>Buku tak hantar</span></button>' +
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
  }

  function sheetMurid(kelasId, fokusCari) {
    var k = cariKelas(kelasId);
    if (!k) return;
    openSheet(
      '<div class="between"><h2>Murid ' + esc(k.nama) + ' <span style="color:var(--acc)" data-bil>(' + bilMurid(k.id) + ')</span></h2><button class="icon-sm" data-act="sheet-close" aria-label="Tutup senarai">' + I.close + '</button></div>' +
      '<label class="search" style="box-shadow:none;background:var(--soft)">' + I.search + '<span class="sr">Cari nama murid</span><input type="search" data-input="cari-murid" data-id="' + k.id + '" placeholder="Cari nama murid" autocomplete="off"></label>' +
      '<div class="sheet-scroll" data-murid-list>' + senaraiMuridHtml(k.id, '') + '</div>' +
      '<a class="btn secondary block" href="#/urus/kelas/' + k.id + '">Urus murid kelas ini</a>',
      { tall: true, label: 'Senarai murid', focus: fokusCari ? 'input[data-input=cari-murid]' : null });
  }
  function senaraiMuridHtml(kelasId, q) {
    var list = muridKelas(kelasId).filter(function (m) { return !q || m.nama.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    if (!list.length) return '<p class="sub" style="padding:12px 2px">' + (q ? 'Tiada murid sepadan.' : 'Belum ada murid. Tambah murid melalui Urus.') + '</p>';
    return list.map(function (m, i) {
      return '<button class="list-row" data-act="profil-murid" data-id="' + m.id + '"><span style="width:24px;font-size:12px;font-weight:700;color:var(--muted)">' + (m.no || i + 1) + '</span><span class="murid-av" style="width:36px;height:36px;font-size:13px">' + esc(inisial(m.nama)) + '</span><span class="grow" style="font-size:15px;font-weight:600">' + esc(m.nama) + '</span><span class="muted">' + I.chev + '</span></button>';
    }).join('');
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
      '<div class="row"><a class="icon-btn" href="#/" aria-label="Kembali ke halaman utama">' + I.back + '</a><div class="row" style="gap:10px">' + logo('urus', 40) + '<h2>Urus</h2></div></div>' +
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
      (admin ? '<span class="section-title">Admin</span><div class="card stack" style="padding:16px;gap:12px" data-admin-kod><span class="sub">Memuatkan kod…</span></div><div class="card list-card" data-admin-guru><div class="list-item sub">Memuatkan senarai guru…</div></div>' : '') +
    '</div>';
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
      '<div class="row"><a class="icon-btn" href="#/kelas/' + k.id + '" aria-label="Kembali ke ' + esc(k.nama) + '">' + I.back + '</a><div class="row" style="gap:10px">' + logo('urus', 40) + '<div><h2>Urus ' + esc(k.nama) + '</h2><span class="sub">' + esc(k.subjek || '') + '</span></div></div></div>' +

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
    root.innerHTML = S.cetakHtml || '';
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
    sc.start().catch(function (e) {
      var m = String(e && (e.name || e.message || e));
      if (/NotAllowed|Permission|denied/i.test(m)) tunjuk('Kebenaran kamera ditolak. Benarkan kamera untuk laman ini dalam tetapan pelayar, kemudian cuba lagi.', true);
      else if (/NotFound|no camera|Camera not found/i.test(m)) tunjuk('Tiada kamera dijumpai pada peranti ini.', true);
      else tunjuk('Kamera tidak dapat dibuka: ' + m, true);
    });
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
        ['attendx', 'tasktrack', 'assessment'].map(function (mid) {
          var mm = MODUL.filter(function (x) { return x.id === mid; })[0];
          return '<div class="list-item">' + logo(mid, 36) + '<span class="grow"><b style="display:block">' + mm.nama + '</b><span class="sub">Akan dipaparkan bila modul ini siap</span></span></div>';
        }).join('') +
      '</div>' +
      '<span class="section-title">QR murid</span>' +
      '<div class="card stack" style="padding:16px;align-items:center;gap:12px">' +
        '<div class="qr-box" role="img" aria-label="Kod QR ' + esc(m.nama) + '">' + qrSvg(qrUrl(m.qr_token)) + '</div>' +
        '<p class="sub" style="margin:0;text-align:center">QR ini hanya mengandungi kod rawak. Orang lain yang scan tidak akan nampak apa-apa.</p>' +
        '<button class="btn danger block" data-act="jana-qr" data-id="' + m.id + '">Jana QR baharu (sticker hilang)</button>' +
      '</div>' +
    '</div>';
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
    'keluar': async function () { await sb.auth.signOut(); S.profil = null; S.loaded = false; S.kelas = []; S.murid = []; location.hash = '#/'; renderAuth(); },
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
    'alert': function () { toast('Akan aktif selepas modul AttendX dan TaskTrack siap.'); },
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
  }

  init();
})();
