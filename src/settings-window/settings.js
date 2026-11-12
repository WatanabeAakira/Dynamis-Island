// Window Pengaturan: island untuk melakukan sesuatu, pengaturan untuk mengatur cara kerjanya.
import { compactIcon } from '../renderer/tray-icons.js';
import { MODELS, DEFAULT_MODEL } from '../renderer/ai-core.js';

const api = window.api;

// ---------- Pembantu ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const IC = {
  brand: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
  general: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  appearance: svg('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.2 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  behavior: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>'),
  features: svg('<path d="M3.5 8L12 3.5 20.5 8v8L12 20.5 3.5 16z"/><path d="M3.5 8L12 12.5 20.5 8M12 12.5v8"/>'),
  lyrics: svg('<path d="M4 6.5h10M4 12h16M4 17.5h12"/>'),
  apps: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>'),
  ai: svg('<circle cx="12" cy="12" r="8"/><path d="M8 12c1.2-2.4 2.6-3.6 4-3.6s2.8 1.2 4 3.6"/>'),
  notif: svg('<path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9"/><path d="M10 21h4"/>'),
  tray: svg('<path d="M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h3.6l2 2.4H18a2.5 2.5 0 0 1 2.5 2.5v7.6A2.5 2.5 0 0 1 18 19.5H6a2.5 2.5 0 0 1-2.5-2.5z"/>'),
  chev: svg('<path d="M6 9l6 6 6-6"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>')
};

function toggle(value, onChange) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!value;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'tg' }, input, h('span'));
}

function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'seg' });
  const btns = options.map(([v, t]) => {
    const b = h('button', { type: 'button' }, t);
    b.addEventListener('click', () => { mark(v); onChange(v); });
    wrap.append(b);
    return [v, b];
  });
  const mark = (v) => btns.forEach(([x, b]) => b.classList.toggle('on', x === v));
  mark(value);
  return wrap;
}

function stepper({ value, min, max, step = 1, unit = '' }, onChange) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const input = h('input', { type: 'number', min, max, step });
  input.value = value;
  const commit = (v) => { v = clamp(Math.round(Number(v) || 0)); input.value = v; onChange(v); };
  input.addEventListener('change', () => commit(input.value));
  const mk = (icon, d, label) => h('button', { type: 'button', 'aria-label': label, html: icon, onclick: () => commit(Number(input.value) + d) });
  const box = h('div', { class: 'box' }, input, h('div', { class: 'arrows' }, mk(IC.up, step, 'Tambah'), mk(IC.down, -step, 'Kurangi')));
  return h('div', { class: 'st' }, box, unit ? h('span', { class: 'unit' }, unit) : '');
}

function row(title, desc, control) {
  return h('div', { class: 'row' },
    h('div', { class: 'rt' }, h('b', {}, title), desc instanceof Node ? desc : desc ? h('small', {}, desc) : ''),
    h('div', { class: 'rc' }, control || ''));
}
const card = (...rows) => h('div', { class: 'card' }, rows);

// ---------- Data ----------
let S = {};
async function save(patch) { S = await api.setSettings(patch); }
api.onSettings((s) => { S = s; });

// ---------- Halaman ----------
const ACCENTS = ['#8b9bff', '#6ee7b7', '#fbbf77', '#f7a1c4', '#7dd3fc', '#c4b5fd'];

function pageGeneral(root) {
  const dirText = h('small', {}, 'Memuat...');
  const dirRow = h('div', { class: 'row' }, h('div', { class: 'rt' }, h('b', {}, 'Folder data'), dirText), h('div', { class: 'rc' }, h('button', { class: 'btn', type: 'button', onclick: () => api.openDataDir() }, 'Buka folder')));
  const ver = h('small', {}, '');
  api.appInfo().then((i) => { dirText.textContent = i.dataDir; ver.textContent = `Versi ${i.version}`; });
  root.append(
    card(
      row('Jalankan saat Windows menyala', 'Island langsung aktif setelah komputer dinyalakan. Berlaku setelah aplikasi di-build menjadi .exe.', toggle(S.autoStart, (v) => save({ autoStart: v }))),
      dirRow,
      row('Keluar dari aplikasi', 'Menutup island beserta semua timer dan alarm yang sedang berjalan.', h('button', { class: 'btn danger', type: 'button', onclick: () => api.quit() }, 'Keluar'))
    ),
    h('div', { class: 'card about' }, h('i', { html: IC.brand }), h('div', {}, h('b', {}, 'Dynamis Island'), ver))
  );
}

function pageAppearance(root) {
  const wrap = h('div', { class: 'sw' });
  const mark = (c) => wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c.toLowerCase() === String(c).toLowerCase()));
  for (const c of ACCENTS) {
    wrap.append(h('button', { type: 'button', 'data-c': c, style: `background:${c}`, 'aria-label': `Warna ${c}`, onclick: () => { mark(c); picker.value = c; save({ accent: c }); } }));
  }
  const picker = h('input', { type: 'color', 'aria-label': 'Warna sendiri' });
  picker.value = /^#[0-9a-f]{6}$/i.test(S.accent) ? S.accent : '#8b9bff';
  picker.addEventListener('change', () => { mark(picker.value); save({ accent: picker.value }); });
  wrap.append(picker);
  mark(S.accent);
  root.append(card(
    row('Warna aksen', 'Dipakai untuk ikon tab aktif, progress bar, dan sorotan lain di island.', wrap),
    row('Ikuti warna cover lagu', 'Warna aksen berubah mengikuti warna dominan cover lagu yang sedang diputar.', toggle(S.accentFromCover, (v) => save({ accentFromCover: v })))
  ));
}

function pageBehavior(root) {
  const out = h('output', {}, `${S.collapseDelay ?? 350} ms`);
  const range = h('input', { type: 'range', min: 0, max: 1500, step: 50, 'aria-label': 'Jeda sebelum menutup' });
  range.value = S.collapseDelay ?? 350;
  range.addEventListener('input', () => { out.textContent = `${range.value} ms`; });
  range.addEventListener('change', () => save({ collapseDelay: Number(range.value) }));
  root.append(card(
    row('Buka island saat kursor di atasnya', 'Jika dimatikan, island dibuka dengan klik.', toggle(S.openOnHover, (v) => save({ openOnHover: v }))),
    row('Jeda sebelum menutup', 'Waktu tunggu setelah kursor meninggalkan island sebelum island menutup.', h('div', { class: 'rg' }, range, out)),
    row('Info lagu di mode collapse', 'Saat lagu berganti, island yang tertutup menampilkan cover dan judul sebentar.', toggle(S.trackToast !== false, (v) => save({ trackToast: v })))
  ));
}

function pageLyrics(root) {
  const dirDesc = h('small', {}, '');
  const dirBtns = h('div', { class: 'rc' });
  const paintDir = () => {
    dirDesc.textContent = S.lyricsDir || 'Opsional. Nama file: Artis - Judul.lrc';
    dirBtns.replaceChildren(h('button', { class: 'btn', type: 'button', onclick: async () => { const d = await api.pickLyricsDir(); if (d) { await save({ lyricsDir: d }); paintDir(); } } }, 'Pilih'));
    if (S.lyricsDir) dirBtns.append(h('button', { class: 'btn', type: 'button', onclick: async () => { await save({ lyricsDir: '' }); paintDir(); } }, 'Hapus'));
  };
  paintDir();

  const list = h('div', {});
  const count = h('small', {}, 'Memuat...');
  async function paintList() {
    const items = await api.listLyrics();
    count.textContent = `${items.length} file`;
    list.replaceChildren(...(items.length ? items.map((it) => {
      let armed = 0;
      const del = h('button', { class: 'btn', type: 'button', 'aria-label': `Hapus ${it.name}` }, 'Hapus');
      del.addEventListener('click', async () => {
        if (!armed) { del.textContent = 'Yakin?'; del.classList.add('arm'); armed = setTimeout(() => { armed = 0; del.textContent = 'Hapus'; del.classList.remove('arm'); }, 2500); return; }
        clearTimeout(armed);
        await api.deleteLyrics(it.name);
        paintList();
      });
      return h('div', { class: 'li' }, h('span', { title: it.name }, it.name), del);
    }) : [h('div', { class: 'empty' }, 'Belum ada salinan. Lirik yang dipilih atau diseret ke panel lirik akan tersimpan di sini.')]));
  }
  paintList();

  root.append(
    card(
      h('div', { class: 'row' }, h('div', { class: 'rt' }, h('b', {}, 'Folder lirik tambahan'), dirDesc), dirBtns),
      row('Penyesuaian waktu lirik', 'Berlaku untuk semua lagu. Nilai positif membuat lirik muncul lebih awal, nilai negatif lebih lambat. Pakai ini jika lirik terasa selalu terlambat atau terlalu cepat.',
        stepper({ value: S.lyricsOffset || 0, min: -5000, max: 5000, step: 100, unit: 'ms' }, (v) => save({ lyricsOffset: v })))
    ),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('div', { class: 'rt' }, h('b', {}, 'Salinan lirik tersimpan'), count), h('div', { class: 'rc' }, h('button', { class: 'btn', type: 'button', onclick: () => api.openLyricsDir() }, 'Buka folder'))),
      list
    )
  );
}

const TRAY_DEFAULTS = { view: 'grid', sort: 'recent', size: 'md', compactIcon: 'outline', showPinned: true, showRef: false, pinnedFirst: true };
const TT = () => ({ ...TRAY_DEFAULTS, ...(S.tray || {}) });
const saveT = (patch) => save({ tray: { ...TT(), ...patch } });

function pageTray(root) {
  const vcards = h('div', { class: 'vcards' });
  const paintV = () => {
    vcards.replaceChildren(...[['outline', 'Garis'], ['filled', 'Isi'], ['stack', 'Tumpuk']].map(([v, name]) => {
      const on = TT().compactIcon === v;
      const b = h('button', { type: 'button', class: 'vc' + (on ? ' on' : ''), 'aria-label': name, 'aria-pressed': String(on) },
        h('span', { class: 'vp' }, h('i', { html: compactIcon(v), style: 'display:contents' }), h('b', {}, '12')), h('small', {}, name));
      b.addEventListener('click', async () => { await saveT({ compactIcon: v }); paintV(); });
      return b;
    }));
  };
  paintV();

  const missDesc = h('small', {}, 'Memeriksa...');
  const missBtn = h('button', { class: 'btn', type: 'button' }, 'Hapus');
  missBtn.disabled = true;
  api.trayList().then((list) => {
    const n = list.filter((i) => !i.exists).length;
    missDesc.textContent = n ? `${n} item yang file aslinya sudah tidak ada.` : 'Tidak ada item yang hilang.';
    missBtn.disabled = !n;
  });
  missBtn.addEventListener('click', async () => { const n = await api.trayRemoveMissing(); missDesc.textContent = `${n} referensi dihapus.`; missBtn.disabled = true; });

  let armed = 0;
  const allBtn = h('button', { class: 'btn danger', type: 'button' }, 'Hapus semua');
  allBtn.addEventListener('click', async () => {
    if (!armed) { allBtn.textContent = 'Yakin hapus semua?'; allBtn.classList.add('arm'); armed = setTimeout(() => { armed = 0; allBtn.textContent = 'Hapus semua'; allBtn.classList.remove('arm'); }, 2500); return; }
    clearTimeout(armed); armed = 0;
    const n = await api.trayClear();
    allBtn.textContent = 'Hapus semua'; allBtn.classList.remove('arm');
    missDesc.textContent = `${n} referensi dihapus.`;
  });

  root.append(
    card(
      row('Tampilan awal', 'Cara item ditampilkan saat File Tray dibuka.', segmented([['grid', 'Grid'], ['list', 'Daftar']], TT().view, (v) => saveT({ view: v }))),
      row('Urutan', 'Urutan item. Bisa juga diganti langsung dari tombol urutan di File Tray.', segmented([['recent', 'Terbaru'], ['name', 'Nama'], ['type', 'Jenis']], TT().sort, (v) => saveT({ sort: v }))),
      row('Ukuran ikon', 'Ukuran ikon dan jumlah kolom pada tampilan grid.', segmented([['sm', 'Kecil'], ['md', 'Sedang'], ['lg', 'Besar']], TT().size, (v) => saveT({ size: v }))),
      row('Item tersemat selalu di atas', 'Item yang disematkan tetap berada di bagian atas apa pun urutannya.', toggle(TT().pinnedFirst, (v) => saveT({ pinnedFirst: v })))
    ),
    card(row('Ikon di mode compact', 'Ikon pada pill kecil yang tampil saat island menutup setelah File Tray dipakai.', vcards)),
    card(
      row('Lencana sematan', 'Tanda bintang pada item yang disematkan.', toggle(TT().showPinned, (v) => saveT({ showPinned: v }))),
      row('Lencana referensi', 'Tanda tautan kecil pada tiap item. Semua item File Tray memang disimpan sebagai referensi, bukan salinan file.', toggle(TT().showRef, (v) => saveT({ showRef: v }))),
      row('Lencana file hilang', 'Tanda seru merah pada item yang file aslinya sudah dipindah atau dihapus.', h('span', { class: 'tag' }, 'Selalu aktif'))
    ),
    card(
      row('Hapus referensi yang hilang', missDesc, missBtn),
      row('Hapus semua referensi', 'Hanya menghapus daftar di File Tray. File aslinya tidak ikut terhapus.', allBtn)
    )
  );
}

const APPS_DEFAULTS = { view: 'grid', size: 'md', style: 'default', sort: 'manual', favCount: 4, favFirst: true, compactLabels: false, compactMode: 'icons' };
const AT = () => ({ ...APPS_DEFAULTS, ...(S.apps || {}) });
const saveA = (patch) => save({ apps: { ...AT(), ...patch } });

function pageApps(root) {
  const a = AT();
  const countDesc = h('small', {}, 'Memuat...');
  api.appsList().then((l) => { countDesc.textContent = `${l.length} pintasan tersimpan. Aplikasinya sendiri tidak ikut terhapus.`; });
  let armed = 0;
  const clearBtn = h('button', { class: 'btn danger', type: 'button' }, 'Hapus semua pintasan');
  clearBtn.addEventListener('click', async () => {
    if (!armed) { clearBtn.textContent = 'Yakin hapus semua?'; clearBtn.classList.add('arm'); armed = setTimeout(() => { armed = 0; clearBtn.textContent = 'Hapus semua pintasan'; clearBtn.classList.remove('arm'); }, 2500); return; }
    clearTimeout(armed); armed = 0;
    const n = await api.appsClear();
    clearBtn.textContent = 'Hapus semua pintasan'; clearBtn.classList.remove('arm');
    countDesc.textContent = `${n} pintasan dihapus.`;
  });
  root.append(
    card(
      row('Jumlah ikon favorit (mode compact)', 'Jumlah ikon yang ditampilkan di island saat menutup (1 sampai 8).', stepper({ value: a.favCount, min: 1, max: 8, step: 1 }, (v) => saveA({ favCount: v }))),
      row('Mode compact', 'Pill kecil saat island menutup: deretan ikon yang bisa diklik langsung, atau ikon dengan jumlah aplikasi.', segmented([['icons', 'Ikon favorit'], ['count', 'Ikon + jumlah']], a.compactMode, (v) => saveA({ compactMode: v }))),
      row('Tampilan awal (mode expanded)', 'Tampilan saat Pintasan Aplikasi dibuka.', segmented([['grid', 'Grid'], ['list', 'Daftar']], a.view, (v) => saveA({ view: v }))),
      row('Ukuran ikon (mode expanded)', 'Ukuran ikon aplikasi dan jumlah kolom pada tampilan grid.', segmented([['sm', 'Kecil'], ['md', 'Sedang'], ['lg', 'Besar']], a.size, (v) => saveA({ size: v }))),
      row('Gaya item', 'Tampilan tiap kotak aplikasi. Gaya Aksen memakai warna dominan ikon masing-masing.', segmented([['default', 'Standar'], ['glass', 'Kaca'], ['accent', 'Aksen']], a.style, (v) => saveA({ style: v }))),
      row('Urutan', 'Urutan manual bisa diatur dengan menyeret item di island.', segmented([['manual', 'Urutan saya'], ['name', 'Nama'], ['recent', 'Terakhir dipakai']], a.sort, (v) => saveA({ sort: v })))
    ),
    card(
      row('Tampilkan aplikasi favorit di depan', 'Aplikasi favorit selalu di bagian awal daftar dan lebih dulu muncul di mode compact.', toggle(a.favFirst, (v) => saveA({ favFirst: v }))),
      row('Tampilkan label aplikasi di mode compact', 'Hanya jika ikon yang tampil tidak lebih dari 3.', toggle(a.compactLabels, (v) => saveA({ compactLabels: v })))
    ),
    card(row('Hapus semua pintasan', countDesc, clearBtn))
  );
}

const NOTIF_DEFAULTS = { noticeMs: 7000, historyLimit: 50, showBody: true };
const NT_ = () => ({ ...NOTIF_DEFAULTS, ...(S.notif || {}) });
const saveN = (patch) => save({ notif: { ...NT_(), ...patch } });

function pageNotif(root) {
  const n = NT_();
  const dur = stepper({ value: Math.round(n.noticeMs / 1000), min: 3, max: 15, step: 1, unit: 'detik' }, (v) => saveN({ noticeMs: v * 1000 }));
  const hist = segmented([[25, '25'], [50, '50'], [75, '75'], [100, '100']], n.historyLimit, (v) => saveN({ historyLimit: v }));
  const countDesc = h('small', {}, '');
  const paintCount = () => {
    let total = 0;
    try { total = JSON.parse(localStorage.getItem('notifs') || '[]').length; } catch {}
    countDesc.textContent = `${total} notifikasi tersimpan.`;
  };
  paintCount();
  let armed = 0;
  const clearBtn = h('button', { class: 'btn danger', type: 'button' }, 'Hapus semua notifikasi');
  clearBtn.addEventListener('click', () => {
    if (!armed) { clearBtn.textContent = 'Yakin hapus semua?'; clearBtn.classList.add('arm'); armed = setTimeout(() => { armed = 0; clearBtn.textContent = 'Hapus semua notifikasi'; clearBtn.classList.remove('arm'); }, 2500); return; }
    clearTimeout(armed); armed = 0;
    api.notifClear();
    try { localStorage.setItem('notifs', '[]'); } catch {}
    clearBtn.textContent = 'Hapus semua notifikasi'; clearBtn.classList.remove('arm');
    paintCount();
  });
  root.append(
    card(
      row('Durasi banner', 'Lama banner pengingat tampil di island yang tertutup, sebelum menghilang sendiri.', dur),
      row('Batas riwayat', 'Jumlah notifikasi terakhir yang disimpan.', hist),
      row('Tampilkan isi pesan', 'Menampilkan keterangan singkat di bawah judul notifikasi.', toggle(n.showBody, (v) => saveN({ showBody: v })))
    ),
    card(row('Hapus semua notifikasi', countDesc, clearBtn))
  );
}

const AI_DEFAULTS = { model: DEFAULT_MODEL, historyLimit: 20, ctxMedia: true, ctxWeather: true, ctxSchedule: true };
const AI_ = () => ({ ...AI_DEFAULTS, ...(S.ai || {}) });
const saveAI = (patch) => save({ ai: { ...AI_(), ...patch } });

function pageAi(root) {
  const a = AI_();
  const status = h('small', {}, 'Memeriksa...');
  const keyInput = h('input', { type: 'password', placeholder: 'gsk_...', autocomplete: 'off', 'aria-label': 'Kunci API Groq', class: 'txt' });
  const saveBtn = h('button', { class: 'btn', type: 'button' }, 'Simpan');
  const delBtn = h('button', { class: 'btn danger', type: 'button' }, 'Hapus');
  const paintKey = (has) => {
    status.textContent = has ? 'Tersimpan terenkripsi di perangkat ini.' : 'Belum diatur. Asisten tidak bisa dipakai sebelum kunci diisi.';
    delBtn.disabled = !has;
  };
  api.aiHasKey().then(paintKey);
  saveBtn.addEventListener('click', async () => {
    const r = await api.aiSetKey(keyInput.value);
    if (r && r.ok) { keyInput.value = ''; status.textContent = 'Kunci disimpan terenkripsi.'; paintKey(true); }
    else status.textContent = (r && r.error) || 'Gagal menyimpan kunci.';
  });
  let armed = 0;
  delBtn.addEventListener('click', async () => {
    if (!armed) { delBtn.textContent = 'Yakin?'; delBtn.classList.add('arm'); armed = setTimeout(() => { armed = 0; delBtn.textContent = 'Hapus'; delBtn.classList.remove('arm'); }, 2500); return; }
    clearTimeout(armed); armed = 0;
    await api.aiClearKey();
    delBtn.textContent = 'Hapus'; delBtn.classList.remove('arm');
    paintKey(false);
  });

  const clearHist = h('button', { class: 'btn danger', type: 'button' }, 'Hapus riwayat percakapan');
  let armedH = 0;
  clearHist.addEventListener('click', () => {
    if (!armedH) { clearHist.textContent = 'Yakin hapus riwayat?'; clearHist.classList.add('arm'); armedH = setTimeout(() => { armedH = 0; clearHist.textContent = 'Hapus riwayat percakapan'; clearHist.classList.remove('arm'); }, 2500); return; }
    clearTimeout(armedH); armedH = 0;
    try { localStorage.setItem('ai.chat', '[]'); } catch {}
    clearHist.textContent = 'Hapus riwayat percakapan'; clearHist.classList.remove('arm');
  });

  root.append(
    card(
      h('div', { class: 'row' }, h('div', { class: 'rt' }, h('b', {}, 'Kunci API Groq'), status),
        h('div', { class: 'rc keyrow' }, keyInput, saveBtn, delBtn))
    ),
    card(
      row('Model', 'Ringan untuk pertanyaan singkat. Pilih yang lebih pintar jika jawabannya terasa kurang tepat.',
        segmented(Object.entries(MODELS).map(([k, v]) => [k, v.label]), a.model, (v) => saveAI({ model: v }))),
      row('Riwayat percakapan', 'Jumlah pesan terakhir yang diingat asisten.', segmented([[10, '10'], [20, '20'], [40, '40']], a.historyLimit, (v) => saveAI({ historyLimit: v })))
    ),
    card(
      row('Sertakan lagu yang sedang diputar', 'Asisten tahu judul dan artis lagu saat kamu bertanya.', toggle(a.ctxMedia, (v) => saveAI({ ctxMedia: v }))),
      row('Sertakan cuaca', 'Asisten tahu cuaca di lokasi kamu saat ini.', toggle(a.ctxWeather, (v) => saveAI({ ctxWeather: v }))),
      row('Sertakan jadwal hari ini', 'Asisten tahu event kalender kamu hari ini.', toggle(a.ctxSchedule, (v) => saveAI({ ctxSchedule: v })))
    ),
    card(row('Hapus riwayat', 'Menghapus semua percakapan di tab AI. Kunci API tidak ikut terhapus.', clearHist)),
    h('p', { class: 'note' }, 'Pertanyaan dan konteks yang dipilih dikirim ke layanan Groq untuk dijawab. Gunakan asisten untuk hal ringan sehari-hari.')
  );
}

// ---------- Navigasi ----------
const PAGES = {
  general: { title: 'Umum', desc: 'Pengaturan dasar aplikasi.', icon: IC.general, build: pageGeneral },
  appearance: { title: 'Tampilan', desc: 'Warna dan gaya island.', icon: IC.appearance, build: pageAppearance },
  behavior: { title: 'Perilaku', desc: 'Kapan island terbuka dan tertutup.', icon: IC.behavior, build: pageBehavior },
  apps: { title: 'Pintasan Aplikasi', desc: 'Aplikasi favorit, tampilan, dan perilaku di island.', icon: IC.apps, build: pageApps },
  ai: { title: 'Asisten AI', desc: 'Kunci API Groq, model, dan konteks yang dipakai asisten.', icon: IC.ai, build: pageAi },
  notif: { title: 'Notifikasi', desc: 'Durasi banner, riwayat, dan isi pesan notifikasi.', icon: IC.notif, build: pageNotif },
  tray: { title: 'File Tray', desc: 'Tampilan, urutan, dan lencana item di File Tray.', icon: IC.tray, build: pageTray },
  lyrics: { title: 'Lirik', desc: 'Sumber, waktu, dan salinan lirik di tab Media.', icon: IC.lyrics, build: pageLyrics }
};
const NAV = [
  { id: 'general' }, { id: 'appearance' }, { id: 'behavior' },
  { group: 'Fitur', icon: IC.features, kids: ['ai', 'notif', 'apps', 'tray', 'lyrics'] }
];

// Warna ikon per halaman (gaya ikon sistem macOS)
const TILE = { general: '#8e8e93', appearance: '#0a84ff', behavior: '#ff9f0a', ai: '#bf5af2', notif: '#ff453a', apps: '#30b0c7', tray: '#5e5ce6', lyrics: '#ff375f' };
const SECTIONS = [{ id: 'general' }, { id: 'appearance' }, { id: 'behavior' }, { sec: 'Fitur', ids: ['ai', 'notif', 'apps', 'tray', 'lyrics'] }];

let current = 'general';
function show(id) {
  if (!PAGES[id]) id = 'general';
  current = id;
  const p = PAGES[id];
  document.getElementById('bt').textContent = p.title;
  const main = document.getElementById('main');
  main.replaceChildren(h('div', { class: 'phead' },
    h('i', { html: p.icon, style: `background:${TILE[id]}` }),
    h('div', {}, h('h1', {}, p.title), h('p', {}, p.desc))));
  p.build(main);
  main.scrollTop = 0;
  document.querySelectorAll('.nav button[data-page]').forEach((b) => b.classList.toggle('on', b.dataset.page === id));
}

function buildNav() {
  const item = (id) => h('button', { type: 'button', 'data-page': id, onclick: () => show(id) },
    h('span', { class: 'ti', style: `background:${TILE[id]}`, html: PAGES[id].icon }),
    h('span', { class: 'tn' }, PAGES[id].title));
  const nav = h('nav', { class: 'nav' });
  for (const sct of SECTIONS) {
    if (sct.id) { nav.append(item(sct.id)); continue; }
    nav.append(h('div', { class: 'sec' }, sct.sec), ...sct.ids.map(item));
  }
  document.getElementById('side').replaceChildren(
    h('div', { class: 'profile' }, h('i', { html: IC.brand }), h('div', {}, h('b', {}, 'Dynamis Island'), h('small', {}, 'Pengaturan'))),
    nav);
}

// Tombol lampu lalu lintas (tutup, kecilkan, perbesar) menggantikan title bar Windows
function wireWindow() {
  document.querySelectorAll('.tl').forEach((b) => b.addEventListener('click', () => api.winControl(b.dataset.a)));
}

async function init() {
  S = await api.getSettings();
  wireWindow();
  buildNav();
  show((location.hash || '').slice(1) || 'general');
  api.onSettingsPage((p) => show(p));
}
init();
