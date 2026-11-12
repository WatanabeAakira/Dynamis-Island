// Registry tab dan placeholder untuk fitur yang belum punya tampilan khusus.

const svg = (body) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  media:    svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  timer:    svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5v3"/>'),
  weather:  svg('<path d="M17.5 19H9a6.5 6.5 0 1 1 6.2-8.4h2.3a4.2 4.2 0 0 1 0 8.4z"/>'),
  calendar: svg('<rect x="3" y="4.5" width="18" height="17" rx="3.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>'),
  clock:    svg('<circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l3.5 2"/>'),
  notif:    svg('<path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9"/><path d="M10 21h4"/>'),
  audio:    svg('<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12"/>'),
  files:    svg('<path d="M21.5 12.5h-5.5l-1.8 2.5H9.8L8 12.5H2.5"/><path d="M5.7 5h12.6l3.2 7.5V18a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2v-5.5z"/>'),
  apps:     svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  ai:       svg('<path d="M11 3.5l1.9 5.6 5.6 1.9-5.6 1.9L11 18.5l-1.9-5.6L3.5 11l5.6-1.9z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>')
};

// Metadata tab dipakai untuk judul, ikon, dan placeholder.
export const TABS = [
  { id: 'media',    title: 'Media Player',           stage: 2, hint: 'Cover album, lirik, dan kontrol pemutaran' },
  { id: 'timer',    title: 'Timer, Focus, Alarm',    stage: 4, hint: 'Tiga kartu: timer, sesi fokus, dan alarm' },
  { id: 'weather',  title: 'Cuaca',                  stage: 5, hint: 'Cuaca lokasi kamu dan perkiraan beberapa hari' },
  { id: 'calendar', title: 'Kalender',               stage: 4, hint: 'Strip 7 hari dengan tambah event' },
  { id: 'clock',    title: 'Jam',                    stage: 4, hint: 'Digital di kiri, analog di kanan' },
  { id: 'notif',    title: 'Notifikasi',             stage: 8, hint: 'Pemberitahuan dari timer, alarm, dan kalender' },
  { id: 'audio',    title: 'Kontrol Audio',          stage: 6, hint: 'Volume tiap aplikasi yang sedang bersuara' },
  { id: 'files',    title: 'File Tray',              stage: 7, hint: 'Seret file dan folder untuk disimpan sementara' },
  { id: 'apps',     title: 'Shortcut Aplikasi',      stage: 7, hint: 'Buka aplikasi favorit dengan satu klik' },
  { id: 'ai',       title: 'AI',                     stage: 9, hint: 'Asisten Groq yang bisa mengontrol island' }
];

export function renderPlaceholder(container, tab) {
  container.innerHTML = `
    <div class="view placeholder">
      <div class="big">${ICONS[tab.id]}</div>
      <h2>${tab.title}</h2>
      <p>${tab.hint}</p>
      <p>Tersedia di tahap ${tab.stage}</p>
    </div>`;
}
