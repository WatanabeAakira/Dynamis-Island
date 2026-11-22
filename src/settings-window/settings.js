// Window pengaturan untuk preferensi aplikasi dan fitur.
import { compactIcon } from '../renderer/tray-icons.js';
import { MODELS, DEFAULT_MODEL } from '../renderer/ai-core.js';
import { localizeTree, setLanguage, watchLocale } from '../renderer/locale.js';

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
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l3.5 2"/>'),
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

// Native selects remain the source of truth for existing settings logic, while
// this button/listbox pair provides a fully custom and keyboard-accessible UI.
function customDropdown(select, { searchable = false } = {}) {
  select.classList.add('native-select-proxy');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  const wrap = h('div', { class: 'dropdown' });
  const trigger = h('button', { type: 'button', class: 'dropdown-trigger', role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  const menu = h('div', { class: 'dropdown-menu', tabindex: '0', hidden: '' });
  const menuId = `dropdown-${Math.random().toString(36).slice(2)}`;
  const listId = `${menuId}-options`;
  menu.id = menuId;
  trigger.setAttribute('aria-controls', listId);
  const search = searchable ? h('input', { class: 'dropdown-search', type: 'search', placeholder: 'Search…', 'aria-label': 'Search options' }) : null;
  if (search) menu.append(search);
  const optionsBox = h('div', { class: 'dropdown-options', role: 'listbox', id: listId, 'aria-label': select.getAttribute('aria-label') || 'Options' });
  menu.append(optionsBox);
  wrap.append(select, trigger);
  wrap.append(menu);
  let active = -1;
  const options = () => [...select.options].filter((option) => option.value !== '');
  const selectableOptions = () => options().filter((option) => !option.disabled);
  const paint = () => {
    const list = options();
    const selected = select.selectedOptions[0];
    trigger.replaceChildren(h('span', { class: 'dropdown-value' }, selected?.textContent || select.getAttribute('placeholder') || 'Select…'), h('span', { class: 'dropdown-arrow', html: IC.chev }));
    trigger.disabled = select.disabled;
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || selected?.textContent || 'Choose an option');
    optionsBox.replaceChildren();
    const filtered = list.filter((option) => !search || option.textContent.toLowerCase().includes(search.value.toLowerCase()));
    if (!filtered.length) optionsBox.append(h('div', { class: 'dropdown-empty', role: 'status' }, 'No options found'));
    filtered.forEach((option, i) => {
      const item = h('button', { type: 'button', role: 'option', id: `${menuId}-item-${i}`, class: `dropdown-option${option.disabled ? ' is-disabled' : ''}`, 'aria-disabled': String(option.disabled), 'aria-selected': String(option.value === select.value), 'data-value': option.value },
        h('span', {}, option.textContent), h('span', { class: 'dropdown-check', 'aria-hidden': 'true' }, option.value === select.value ? '✓' : ''));
      item.disabled = option.disabled;
      item.addEventListener('mouseenter', () => { active = filtered.filter((candidate) => !candidate.disabled).findIndex((candidate) => candidate.value === option.value); markActive(); });
      item.addEventListener('click', () => choose(option));
      optionsBox.append(item);
    });
    if (active >= filtered.length) active = filtered.length - 1;
    markActive();
  };
  const markActive = () => {
    const items = [...optionsBox.querySelectorAll('.dropdown-option:not(:disabled)')];
    items.forEach((item, i) => item.classList.toggle('highlight', i === active));
    if (items[active]) optionsBox.setAttribute('aria-activedescendant', items[active].id);
    else optionsBox.removeAttribute('aria-activedescendant');
  };
  const position = () => {
    const rect = trigger.getBoundingClientRect();
    menu.style.minWidth = `${rect.width}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8))}px`;
    menu.style.maxHeight = `${Math.max(120, Math.min(320, innerHeight - 24))}px`;
    menu.style.maxHeight = `${Math.max(120, Math.min(320, innerHeight - 24))}px`;
    const roomBelow = innerHeight - rect.bottom;
    menu.style.top = roomBelow < 240 && rect.top > roomBelow ? 'auto' : `${rect.bottom + 6}px`;
    if (menu.style.top === 'auto') menu.style.bottom = `${innerHeight - rect.top + 6}px`;
    else menu.style.bottom = 'auto';
  };
  const close = (restore = false) => {
    if (menu.hidden) return;
    menu.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    if (restore) trigger.focus();
  };
  const choose = (option) => {
    if (!option || option.disabled) return;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    paint(); close(true);
  };
  const open = () => {
    if (select.disabled) return;
    document.querySelectorAll('.dropdown-menu:not([hidden])').forEach((other) => { if (other !== menu) other.hidden = true; });
    paint(); menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); position();
    active = Math.max(0, selectableOptions().findIndex((option) => option.value === select.value)); markActive();
    if (search) { search.value = ''; paint(); search.focus(); } else menu.focus?.();
  };
  trigger.addEventListener('click', () => menu.hidden ? open() : close());
  trigger.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); open(); }
  });
  menu.addEventListener('keydown', (event) => {
    const items = [...optionsBox.querySelectorAll('.dropdown-option:not(:disabled)')];
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; markActive(); items[active]?.scrollIntoView({ block: 'nearest' }); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); active = event.key === 'Home' ? 0 : items.length - 1; markActive(); items[active]?.scrollIntoView({ block: 'nearest' }); }
    else if (event.key === 'Enter' || (event.key === ' ' && event.target === menu)) { event.preventDefault(); choose(selectableOptions().filter((option) => !search || option.textContent.toLowerCase().includes(search.value.toLowerCase()))[active]); }
    else if (event.key === 'Tab') close();
  });
  search?.addEventListener('input', () => { active = 0; paint(); });
  select.addEventListener('change', paint);
  select.addEventListener('disabled-change', paint);
  new MutationObserver(paint).observe(select, { childList: true, subtree: true, attributes: true });
  paint();
  return wrap;
}

function repositionOpenDropdowns() {
  for (const menu of document.querySelectorAll('.dropdown-menu:not([hidden])')) {
    const trigger = document.getElementById(menu.id)?.parentElement?.querySelector('.dropdown-trigger');
    if (!trigger) continue;
    const rect = trigger.getBoundingClientRect();
    menu.style.minWidth = `${rect.width}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8))}px`;
    const roomBelow = innerHeight - rect.bottom;
    menu.style.top = roomBelow < 240 && rect.top > roomBelow ? 'auto' : `${rect.bottom + 6}px`;
    menu.style.bottom = menu.style.top === 'auto' ? `${innerHeight - rect.top + 6}px` : 'auto';
  }
}
document.addEventListener('pointerdown', (event) => {
  for (const trigger of document.querySelectorAll('.dropdown-trigger[aria-expanded="true"]')) {
    const menu = document.getElementById(trigger.getAttribute('aria-controls'));
    if (!trigger.parentElement.contains(event.target) && !menu?.contains(event.target)) {
      if (menu) menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  }
});
window.addEventListener('resize', repositionOpenDropdowns);
document.getElementById('main')?.addEventListener('scroll', repositionOpenDropdowns, true);

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
  const element = h('div', { class: 'row', tabindex: '-1', 'data-setting-title': title, 'data-setting-description': desc instanceof Node ? desc.textContent : (desc || '') },
    h('div', { class: 'rt' }, h('b', {}, title), desc instanceof Node ? desc : desc ? h('small', {}, desc) : ''),
    h('div', { class: 'rc' }, control || ''));
  return element;
}
const card = (...rows) => h('div', { class: 'card' }, rows);
const group = (title, description, icon, ...rows) => h('section', { class: 'settings-group' },
  h('div', { class: 'group-head' }, h('i', { html: icon }), h('div', {}, h('b', {}, title), h('small', {}, description))),
  card(...rows));

// ---------- Data ----------
let S = {};
async function save(patch) { S = await api.setSettings(patch); }
api.onSettings((s) => {
  const changed = S.language !== s.language;
  S = s;
  document.documentElement.style.setProperty('--accent', /^#[0-9a-f]{6}$/i.test(S.accent || '') ? S.accent : '#ff9f0a');
  if (changed) { buildNav(); show(current); }
});

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

function pageLanguage(root) {
  const select = h('select', { 'aria-label': 'Bahasa aplikasi' });
  select.append(h('option', { value: 'id' }, 'Bahasa Indonesia'), h('option', { value: 'en' }, 'English'));
  select.value = S.language === 'en' ? 'en' : 'id';
  select.addEventListener('change', async () => {
    S = await api.setSettings({ language: select.value });
    setLanguage(S.language);
    buildNav();
    show('language');
  });
  root.append(card(row('Bahasa aplikasi', 'Pilih bahasa yang dipakai di aplikasi. Perubahan langsung diterapkan.', customDropdown(select))));
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
  root.append(
    group('Island Visibility', 'Control when the island appears and hides on your screen.', IC.general,
      row('Auto Full Closed saat aplikasi fullscreen', 'Island jadi strip tipis saat aplikasi foreground memenuhi layar, lalu kembali compact setelah fullscreen berakhir.', toggle(S.autoFullClosed !== false, (v) => save({ autoFullClosed: v }))),
      row('Buka island saat kursor di atasnya', 'Jika dimatikan, island dibuka dengan klik.', toggle(S.openOnHover, (v) => save({ openOnHover: v })))),
    group('Interaction', 'Customize the island’s response to your mouse movement.', IC.behavior,
      row('Jeda sebelum menutup', 'Waktu tunggu setelah kursor meninggalkan island sebelum island menutup.', h('div', { class: 'rg' }, range, out)),
      row('Info lagu di mode collapse', 'Saat lagu berganti, island yang tertutup menampilkan cover dan judul sebentar.', toggle(S.trackToast !== false, (v) => save({ trackToast: v }))))
  );
}

const CLOCK_DEFAULTS = { timeFormat: '24h', dateFormat: 'long', showSeconds: true, showAdditionalInfo: true, analogSecondHand: true };
const CT = () => ({ ...CLOCK_DEFAULTS, ...(S.clock || {}) });
const saveClock = (patch) => save({ clock: { ...CT(), ...patch } });

function pageClock(root) {
  const c = CT();
  const dates = h('select', { 'aria-label': 'Format tanggal' });
  const sample = new Date(2026, 10, 6);
  const locale = S.language === 'en' ? 'en-US' : 'id-ID';
  const longDate = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(sample);
  const shortDate = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(sample);
  const labels = S.language === 'en'
    ? [`Long (${longDate})`, `Abbreviated (${shortDate})`, 'Numeric (2026-11-06)']
    : [`Panjang (${longDate})`, `Singkat (${shortDate})`, 'Numerik (2026-11-06)'];
  dates.append(
    h('option', { value: 'long' }, labels[0]),
    h('option', { value: 'abbreviated' }, labels[1]),
    h('option', { value: 'numeric' }, labels[2])
  );
  dates.value = c.dateFormat;
  dates.addEventListener('change', () => saveClock({ dateFormat: dates.value }));
  root.append(card(
    row('Format waktu', 'Pilih format 12 jam atau 24 jam.', segmented([['24h', '24-Jam'], ['12h', '12-Jam']], c.timeFormat, (v) => saveClock({ timeFormat: v }))),
    row('Format tanggal', 'Bahasa mengikuti bahasa aplikasi dan lokal Windows.', customDropdown(dates)),
    row('Tampilkan detik digital', 'Tampilkan detik pada jam digital.', toggle(c.showSeconds, (v) => saveClock({ showSeconds: v }))),
    row('Tampilkan info tambahan', 'Minggu, hari ke-, dan waktu aktif aplikasi.', toggle(c.showAdditionalInfo, (v) => saveClock({ showAdditionalInfo: v }))),
    row('Jarum detik analog', 'Gerakan jarum detik yang halus dan terus-menerus.', toggle(c.analogSecondHand, (v) => saveClock({ analogSecondHand: v })))
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
  const paintCount = (total) => {
    countDesc.textContent = `${total} notifikasi tersimpan.`;
  };
  api.notifCount().then(paintCount);
  api.onNotifCount(paintCount);
  const capture = toggle(n.captureWindows !== false, (v) => saveN({ captureWindows: v }));
  const captureStatus = h('small', {}, 'Memeriksa status...');
  const paintCaptureStatus = (s) => {
    captureStatus.textContent = !s?.available
      ? 'Helper belum siap. Buat build helper lalu buka ulang island.'
      : s.enabled ? 'Penangkapan notif aktif.' : 'Penangkapan notif nonaktif.';
  };
  api.windowsNotificationsStatus().then(paintCaptureStatus);
  api.onWindowsNotificationsStatus(paintCaptureStatus);
  let armed = 0;
  const clearBtn = h('button', { class: 'btn danger', type: 'button' }, 'Hapus semua notifikasi');
  clearBtn.addEventListener('click', () => {
    if (!armed) { clearBtn.textContent = 'Yakin hapus semua?'; clearBtn.classList.add('arm'); armed = setTimeout(() => { armed = 0; clearBtn.textContent = 'Hapus semua notifikasi'; clearBtn.classList.remove('arm'); }, 2500); return; }
    clearTimeout(armed); armed = 0;
    api.notifClear();
    clearBtn.textContent = 'Hapus semua notifikasi'; clearBtn.classList.remove('arm');
    paintCount(0);
  });
  root.append(
    card(
      row('Notifikasi aplikasi Windows', 'Masukkan toast Windows dari aplikasi seperti Discord dan WhatsApp ke tab Notifikasi. Isi pesan disimpan di perangkat ini. Island harus berjalan untuk menangkapnya. Banner kanan bawah Windows tetap bisa muncul.', capture),
      row('Status penangkapan', '', captureStatus),
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

function pageTranslation(root) {
  const current = { sourceLanguage: 'auto', targetLanguage: '', autoDetect: true, autoTranslate: true, provider: 'auto', ...(S.translation || {}) };
  const source = h('select', { 'aria-label': 'Source language' });
  source.append(h('option', { value: 'auto' }, 'Auto-detect'));
  source.value = current.autoDetect ? 'auto' : current.sourceLanguage;

  const target = h('select', { 'aria-label': 'Target language' });
  api.translateDefaults().then((defaults) => {
    for (const language of (defaults?.languages || [])) {
      source.append(h('option', { value: language.code }, `${language.name} · ${language.native}`));
      target.append(h('option', { value: language.code }, `${language.name} · ${language.native}`));
    }
    const localeTarget = defaults?.systemLanguage || 'id';
    source.value = current.autoDetect ? 'auto' : current.sourceLanguage;
    target.value = current.targetLanguage || localeTarget;
    if (!current.targetLanguage) target.title = `Following Windows display language (${target.value})`;
  });
  target.value = current.targetLanguage || 'id';

  const saveTranslation = async (patch) => {
    const next = { ...current, ...patch };
    Object.assign(current, next);
    await save({ translation: next });
  };
  const autoDetect = toggle(current.autoDetect, (value) => {
    void saveTranslation({ autoDetect: value, sourceLanguage: value ? 'auto' : (source.value === 'auto' ? 'en' : source.value) });
    source.disabled = value;
    source.dispatchEvent(new Event('disabled-change'));
    if (!value && source.value === 'auto') source.value = 'en';
  });
  source.disabled = current.autoDetect;
  source.addEventListener('change', () => void saveTranslation({ sourceLanguage: source.value, autoDetect: false }));
  target.addEventListener('change', () => void saveTranslation({ targetLanguage: target.value }));

  const autoTranslate = toggle(current.autoTranslate, (value) => void saveTranslation({ autoTranslate: value }));
  const provider = h('select', { 'aria-label': 'Translation provider' },
    h('option', { value: 'auto' }, 'Automatic · Groq first, MyMemory if no key'),
    h('option', { value: 'groq' }, 'Prefer Groq'),
    h('option', { value: 'mymemory' }, 'MyMemory · no key required'));
  provider.value = current.provider;
  provider.addEventListener('change', () => void saveTranslation({ provider: provider.value }));
  const shortcut = h('code', { class: 'keycap' }, 'Ctrl + Alt + Y');

  root.append(
    card(
      row('Automatically detect source language', 'Detect the language as you type. You can turn this off to choose a source language.', autoDetect),
      row('Source language', 'Used when automatic detection is off.', customDropdown(source, { searchable: true })),
      row('Target language', 'Defaults to the Windows display language. Choose another language to keep it as your preference.', customDropdown(target, { searchable: true })),
      row('Translate while typing', 'Waits briefly after you stop typing before sending a request.', autoTranslate),
      row('Translation provider', 'Automatic prioritizes Groq when its API key is saved. Without a key, it uses MyMemory; you can also choose either provider.', customDropdown(provider)),
      row('Screen selection shortcut', 'Select text from anywhere on screen and translate it.', shortcut)
    ),
    h('p', { class: 'note' }, 'OCR and screenshots stay on this device. Only the text you enter, paste, or extract is sent to the selected translation provider. MyMemory works without setup and has an anonymous daily quota of 5,000 characters; longer input is sent in small segments.')
  );
}

// ---------- Navigasi ----------
const PAGES = {
  general: { title: 'Umum', desc: 'Pengaturan dasar aplikasi.', icon: IC.general, build: pageGeneral },
  language: { title: 'Bahasa', desc: 'Atur bahasa yang dipakai aplikasi.', icon: IC.general, build: pageLanguage },
  appearance: { title: 'Tampilan', desc: 'Warna dan gaya island.', icon: IC.appearance, build: pageAppearance },
  behavior: { title: 'Perilaku', desc: 'Kapan island terbuka dan tertutup.', icon: IC.behavior, build: pageBehavior },
  clock: { title: 'Jam', desc: 'Format waktu, tanggal, dan tampilan jam.', icon: IC.clock, build: pageClock },
  apps: { title: 'Pintasan Aplikasi', desc: 'Aplikasi favorit, tampilan, dan perilaku di island.', icon: IC.apps, build: pageApps },
  ai: { title: 'Asisten AI', desc: 'Kunci API Groq, model, dan konteks yang dipakai asisten.', icon: IC.ai, build: pageAi },
  translation: { title: 'Terjemahan', desc: 'Bahasa, deteksi otomatis, dan cara kerja Translate Anything.', icon: IC.ai, build: pageTranslation },
  notif: { title: 'Notifikasi', desc: 'Durasi banner, riwayat, dan isi pesan notifikasi.', icon: IC.notif, build: pageNotif },
  clipboard: { title: 'Clipboard Manager', desc: 'Capture and manage local clipboard history.', icon: IC.tray, build: (root) => {
    const c = S.clipboard || {};
    root.append(group('General', 'Capture supported clipboard content locally on this device.', IC.features,
      row('Enable Clipboard Manager', 'Capture changes through the native Windows clipboard listener.', toggle(c.enabled !== false, async (v) => { S = await save({ clipboard: { ...c, enabled: v } }); api.helperSend({ cmd: 'clipboard-config', enabled: v, capture: c.capture !== false, maxItems: c.maxItems || 200 }); })),
      row('Automatic capture', 'Pause and resume clipboard history capture.', toggle(c.capture !== false, async (v) => { S = await save({ clipboard: { ...c, capture: v } }); api.helperSend({ cmd: 'clipboard-config', enabled: c.enabled !== false, capture: v, maxItems: c.maxItems || 200 }); })),
      row('Maximum history items', 'Keeps pinned items and trims older unpinned items.', stepper({ value: c.maxItems || 200, min: 50, max: 500, step: 50, unit: ' items' }, async (v) => { S = await save({ clipboard: { ...c, maxItems: v } }); api.helperSend({ cmd: 'clipboard-config', enabled: c.enabled !== false, capture: c.capture !== false, maxItems: v }); }))));
  } },
  notes: { title: 'Quick Notes', desc: 'Local note storage and editor behavior.', icon: IC.lyrics, build: (root) => {
    const n = S.notes || {};
    root.append(group('General', 'Notes are stored locally in the application data folder.', IC.features,
      row('Enable Quick Notes', 'Show Quick Notes in Dynamis Island.', toggle(n.enabled !== false, async (v) => { S = await save({ notes: { ...n, enabled: v } }); })),
      row('Automatic saving', 'Save edits shortly after typing stops.', toggle(n.autosave !== false, async (v) => { S = await save({ notes: { ...n, autosave: v } }); }))));
  } },
  'quick-settings': { title: 'Quick Settings', desc: 'Configure Windows controls shown in the Island.', icon: IC.general, build: (root) => {
    const q = S.quickSettings || {}, controls = q.controls || {};
    const controlRows = [['wifi','Wi-Fi'],['bluetooth','Bluetooth'],['airplane','Airplane Mode'],['doNotDisturb','Do Not Disturb'],['battery','Battery Saver'],['microphone','Microphone'],['brightness','Brightness'],['nightLight','Night Light'],['theme','Theme'],['volume','Master Volume']].map(([key,label]) => row(label, 'Show this control in Quick Settings.', toggle(controls[key] !== false, async (v) => { const current=S.quickSettings||{}; S=await save({quickSettings:{...current,controls:{...(current.controls||{}),[key]:v}}}); })));
    root.append(group('General', 'Control the Quick Settings feature and its compact indicator.', IC.general,
      row('Enable Quick Settings', 'Show the feature tab in Dynamis Island.', toggle(q.enabled !== false, async (v) => { S=await save({quickSettings:{...(S.quickSettings||{}),enabled:v}}); })),
      row('Compact status indicator', 'Show current connectivity status where available.', toggle(q.compactStatus !== false, async (v) => { S=await save({quickSettings:{...(S.quickSettings||{}),compactStatus:v}}); }))),
      group('Controls', 'Choose which Windows controls appear in the feature.', IC.features, ...controlRows),
      group('Integrations', 'System volume uses the existing Audio Control backend.', IC.ai,
        row('Reuse Audio Control master volume', 'Volume and mute changes use the shared Windows Core Audio service.', h('span',{class:'tag'},'Integrated'))));
  } },
  'system-monitor': { title: 'System Monitor', desc: 'Configure sampling, process list, and performance alerts.', icon: IC.behavior, build: (root) => {
    const m=S.systemMonitor||{}, metrics=m.metrics||{};
    const metricRows=[['cpu','CPU'],['ram','RAM'],['gpu','GPU'],['disk','Disk'],['temperature','Temperature'],['network','Network']].map(([key,label])=>row(label, key==='gpu'||key==='temperature'?'Displayed only when a supported provider is available.':'Include this metric in the monitor display.',toggle(metrics[key]!==false,async(v)=>{const current=S.systemMonitor||{};S=await save({systemMonitor:{...current,metrics:{...(current.metrics||{}),[key]:v}}});})));
    root.append(group('General', 'Enable monitoring and select the compact summary metric.', IC.general,
      row('Enable System Monitor', 'Show the feature tab and collect metrics when requested.', toggle(m.enabled!==false,async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),enabled:v}});})),
      row('Compact Mode metric', 'The compact indicator uses this cached value.', segmented([['cpu','CPU'],['ram','RAM']],m.compactMetric||'cpu',async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),compactMetric:v}});}))),
      group('Monitoring', 'Metrics are sampled once and shared with visible components.', IC.features, ...metricRows),
      group('Graphs & processes', 'Tune refresh intervals and the compact top process list.', IC.behavior,
        row('Update interval (ms)', 'Expanded monitoring sample interval.', stepper({value:m.intervalMs||1000,min:500,max:10000,step:500,unit:' ms'},async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),intervalMs:v}});})),
        row('Graph history (seconds)', 'Bounded in-memory history window.', segmented([[30,'30s'],[60,'60s'],[120,'120s']],m.graphHistorySeconds||60,async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),graphHistorySeconds:v}});})),
        row('Top process monitoring', 'Sample process CPU and working memory every three seconds while expanded.', toggle(m.processMonitoring!==false,async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),processMonitoring:v}});})),
        row('Top processes', 'Maximum number of processes shown.', stepper({value:m.processCount||5,min:3,max:10,step:1,unit:' processes'},async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),processCount:v}});})),
        row('Default process sorting', 'Sort by CPU use or working memory.', segmented([['cpu','CPU'],['memory','RAM']],m.sort||'cpu',async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),sort:v}});}))));
    root.append(group('Notifications', 'Use the existing Dynamis Island notification list with a cooldown.', IC.notif,
      row('Performance alerts', 'Alert when CPU or RAM exceeds its threshold.', toggle(m.alertsEnabled===true,async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),alertsEnabled:v}});})),
      row('CPU alert threshold', 'Trigger when CPU usage reaches this level.', stepper({value:m.cpuThreshold||95,min:50,max:100,step:5,unit:' %'},async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),cpuThreshold:v}});})),
      row('RAM alert threshold', 'Trigger when memory usage reaches this level.', stepper({value:m.ramThreshold||90,min:50,max:99,step:5,unit:' %'},async(v)=>{S=await save({systemMonitor:{...(S.systemMonitor||{}),ramThreshold:v}});})),
      h('p',{class:'note'},'GPU utilization, GPU memory, disk activity, and temperature sensors are marked unavailable until a reliable hardware provider is available.')));
  } },
  tray: { title: 'File Tray', desc: 'Tampilan, urutan, dan lencana item di File Tray.', icon: IC.tray, build: pageTray },
  lyrics: { title: 'Lirik', desc: 'Sumber, waktu, dan salinan lirik di tab Media.', icon: IC.lyrics, build: pageLyrics }
};
const NAV = [
  { id: 'general' }, { id: 'language' }, { id: 'appearance' }, { id: 'behavior' },
  { group: 'Fitur', icon: IC.features, kids: ['ai', 'translation', 'notif', 'apps', 'tray', 'lyrics', 'clock'] }
];

// Warna ikon per halaman (gaya ikon sistem macOS)
const TILE = { general: '#8e8e93', language: '#5e5ce6', appearance: '#0a84ff', behavior: '#ff9f0a', clock: '#0a84ff', ai: '#bf5af2', translation: '#5d9a73', notif: '#ff453a', apps: '#30b0c7', tray: '#5e5ce6', lyrics: '#ff375f', clipboard: '#8b5cf6', notes: '#c084fc', 'quick-settings':'#38bdf8','system-monitor':'#22d3ee' };
const SECTIONS = [{ id: 'general' }, { id: 'language' }, { id: 'appearance' }, { id: 'behavior' }, { sec: 'Fitur', ids: ['ai', 'translation', 'notif', 'apps', 'tray', 'lyrics', 'clock', 'clipboard', 'notes','quick-settings','system-monitor'] }];

let current = 'general';
function show(id) {
  if (!PAGES[id]) id = 'general';
  current = id;
  setLanguage(S.language);
  const p = PAGES[id];
  document.documentElement.style.setProperty('--accent', /^#[0-9a-f]{6}$/i.test(S.accent || '') ? S.accent : '#ff9f0a');
  document.getElementById('bt').textContent = p.title;
  const main = document.getElementById('main');
  main.replaceChildren(h('div', { class: 'phead' },
    h('i', { html: p.icon, style: `background:${TILE[id]}` }),
    h('div', {}, h('h1', {}, p.title), h('p', {}, p.desc))));
  p.build(main);
  main.dataset.page = id;
  document.documentElement.lang = S.language === 'en' ? 'en' : 'id';
  document.title = S.language === 'en' ? 'Dynamis Island Settings' : 'Pengaturan Dynamis Island';
  localizeTree(document.body, S.language);
  main.scrollTop = 0;
  document.querySelectorAll('.nav button[data-page]').forEach((b) => b.classList.toggle('on', b.dataset.page === id));
}

let searchCatalog;
function buildNav() {
  const item = (id) => h('button', { type: 'button', 'data-page': id, onclick: () => show(id) },
    h('span', { class: 'ti', style: `background:${TILE[id]}`, html: PAGES[id].icon }),
    h('span', { class: 'tn' }, PAGES[id].title));
  const nav = h('nav', { class: 'nav' });
  for (const sct of SECTIONS) {
    if (sct.id) { nav.append(item(sct.id)); continue; }
    nav.append(h('div', { class: 'sec' }, sct.sec), ...sct.ids.map(item));
  }
  const searchInput = h('input', { class: 'settings-search-input', type: 'search', placeholder: 'Search settings...', 'aria-label': 'Search settings' });
  const resultBox = h('div', { class: 'search-results', role: 'listbox', hidden: '' });
  const searchWrap = h('div', { class: 'settings-search' }, h('span', { html: svg('<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/>') }), searchInput, h('kbd', {}, 'Ctrl K'), resultBox);
  if (!searchCatalog) {
    searchCatalog = [];
    for (const [id, page] of Object.entries(PAGES)) {
      const scratch = h('div');
      try { page.build(scratch); } catch {}
      for (const setting of scratch.querySelectorAll('.row')) searchCatalog.push({ id, title: setting.dataset.settingTitle || '', desc: setting.dataset.settingDescription || '' });
    }
  }
  const renderResults = () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    resultBox.replaceChildren();
    if (!query) { resultBox.hidden = true; return; }
    const matches = [
      ...Object.entries(PAGES).filter(([, page]) => `${page.title} ${page.desc}`.toLocaleLowerCase().includes(query)).map(([id, page]) => ({ id, title: page.title, desc: page.desc, category: true })),
      ...searchCatalog.filter((item) => `${item.title} ${item.desc} ${PAGES[item.id].title}`.toLocaleLowerCase().includes(query))
    ].slice(0, 12);
    if (!matches.length) resultBox.append(h('div', { class: 'search-empty' }, 'No matching settings'));
    matches.forEach((item) => {
      const result = h('button', { type: 'button', role: 'option', class: 'search-result' }, h('b', {}, item.title), h('small', {}, item.category ? 'Category' : PAGES[item.id].title));
      result.addEventListener('click', () => {
        searchInput.value = ''; resultBox.hidden = true; show(item.id);
        if (!item.category) {
          const target = [...document.querySelectorAll(`#main .row`)].find((candidate) => candidate.dataset.settingTitle === item.title);
          target?.scrollIntoView({ behavior: S.reducedMotion ? 'instant' : 'smooth', block: 'center' });
          target?.classList.add('search-target'); target?.focus({ preventScroll: true });
          setTimeout(() => target?.classList.remove('search-target'), 1800);
        }
      });
      resultBox.append(result);
    });
    resultBox.hidden = false;
  };
  searchInput.addEventListener('input', renderResults);
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { searchInput.value = ''; renderResults(); }
    if (event.key === 'ArrowDown' && !resultBox.hidden) { event.preventDefault(); resultBox.querySelector('.search-result')?.focus(); }
  });
  searchWrap.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const results = [...resultBox.querySelectorAll('.search-result')];
    const index = results.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? Math.min(results.length - 1, index + 1) : Math.max(0, index - 1);
    if (results.length) { event.preventDefault(); results[next]?.focus(); }
  });
  const version = h('small', {}, 'Loading version…');
  const updateStatus = h('small', { class: 'update-status' }, '');
  const updateButton = h('button', { class: 'update-button', type: 'button', onclick: async () => { updateButton.disabled = true; updateStatus.textContent = 'Checking…'; const result = await api.checkUpdates(); updateStatus.textContent = result.message; updateButton.disabled = false; } }, '↻  Check for Updates');
  api.appInfo().then((info) => { version.textContent = `v${info.version}`; });
  document.getElementById('side').replaceChildren(
    h('div', { class: 'sidebar-top' }, h('div', { class: 'profile' }, h('i', { html: IC.brand }), h('div', {}, h('b', {}, 'Dynamis Island'), h('small', {}, 'Settings'))), searchWrap, nav),
    h('div', { class: 'sidebar-footer' }, h('div', { class: 'footer-brand' }, h('i', { html: IC.brand }), h('div', {}, h('b', {}, 'Dynamis Island'), version)), updateStatus, updateButton));
  searchInput.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.focus(); } });
  document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.focus(); } });
  localizeTree(document.body, S.language);
}

// Tombol lampu lalu lintas (tutup, kecilkan, perbesar) menggantikan title bar Windows
function wireWindow() {
  document.querySelectorAll('.tl').forEach((b) => b.addEventListener('click', () => api.winControl(b.dataset.a)));
}

async function init() {
  wireWindow();
  try {
    S = await api.getSettings();
    setLanguage(S.language);
    watchLocale(document.body, () => S.language);
    buildNav();
    show((location.hash || '').slice(1) || 'general');
    api.onSettingsPage((p) => show(p));
  } catch (error) {
    console.error('[settings] initialization failed:', error);
    const main = document.getElementById('main');
    main.replaceChildren(h('section', { class: 'settings-init-error', role: 'alert' },
      h('h1', {}, 'Settings could not be loaded'),
      h('p', {}, error?.message || 'The settings bridge did not respond. Close this window and try again.')));
  }
}
init();
