// Ikon item File Tray bergaya datar (per jenis file) dan ikon folder untuk pill compact.

const wrap = (b) => `<svg viewBox="0 0 48 48" aria-hidden="true">${b}</svg>`;
const PAGE = 'M10 5h20l10 10v26a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z';
const CORNER = 'M30 5v8a2 2 0 0 0 2 2h8z';
const page = (fill, corner) => `<path d="${PAGE}" fill="${fill}"/><path d="${CORNER}" fill="${corner}"/>`;
const label = (t, fill = '#fff', size = 11) => `<text x="24" y="34" font-size="${size}" font-weight="800" fill="${fill}" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif">${t}</text>`;
const tile = (fill) => `<rect x="6" y="6" width="36" height="36" rx="8" fill="${fill}"/>`;

const ICONS = {
  folder: wrap('<path d="M4 13a4 4 0 0 1 4-4h10l4 5h18a4 4 0 0 1 4 4v1H4z" fill="#e89b00"/><path d="M4 18a3 3 0 0 1 3-3h34a3 3 0 0 1 3 3v19a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#ffc83d"/><path d="M4 22h40" stroke="#ffd96b" stroke-width="2"/>'),
  file: wrap(page('#f1f4fa', '#c9d1e3') + '<rect x="14" y="22" width="20" height="2.4" rx="1.2" fill="#a9b3ca"/><rect x="14" y="28" width="20" height="2.4" rx="1.2" fill="#a9b3ca"/><rect x="14" y="34" width="13" height="2.4" rx="1.2" fill="#a9b3ca"/>'),
  text: wrap(page('#f1f4fa', '#c9d1e3') + '<rect x="14" y="21" width="20" height="2.4" rx="1.2" fill="#8d98b3"/><rect x="14" y="27" width="20" height="2.4" rx="1.2" fill="#8d98b3"/><rect x="14" y="33" width="20" height="2.4" rx="1.2" fill="#8d98b3"/>'),
  image: wrap(tile('#3d8bff') + '<rect x="6" y="6" width="36" height="20" rx="8" fill="#7ab8ff"/><circle cx="31" cy="17" r="4" fill="#ffe066"/><path d="M6 36l10-12 8 9 6-6 12 11v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="#e9f3ff"/>'),
  pdf: wrap(page('#ec4b4f', '#b92f34') + label('PDF')),
  word: wrap(tile('#2b6cd8') + '<rect x="6" y="6" width="36" height="36" rx="8" fill="#2b6cd8"/>' + '<text x="24" y="33" font-size="22" font-weight="800" fill="#fff" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif">W</text>'),
  excel: wrap(tile('#1f9d55') + '<text x="24" y="33" font-size="22" font-weight="800" fill="#fff" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif">X</text>'),
  ppt: wrap(tile('#e8590c') + '<text x="24" y="33" font-size="22" font-weight="800" fill="#fff" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif">P</text>'),
  video: wrap(tile('#7c5cf5') + '<path d="M19 15l15 9-15 9z" fill="#fff"/>'),
  audio: wrap(page('#efeaff', '#c9bdf5') + '<path d="M21 20v13.2a3.4 3.4 0 1 1-2-3.1V19l11-2.6v11.8a3.4 3.4 0 1 1-2-3.1V20.9z" fill="#7c5cf5"/>'),
  archive: wrap('<rect x="7" y="6" width="34" height="36" rx="5" fill="#d33b3b"/><rect x="7" y="6" width="34" height="6" fill="#f2a900"/><rect x="7" y="12" width="34" height="6" fill="#3d8bff"/><rect x="7" y="18" width="34" height="6" fill="#23a55a"/><rect x="7" y="24" width="34" height="6" fill="#f2a900"/><rect x="7" y="30" width="34" height="6" fill="#3d8bff"/><rect x="20" y="6" width="8" height="26" rx="2" fill="#f4f6fb"/><rect x="21.5" y="26" width="5" height="8" rx="1.5" fill="#8d98b3"/>'),
  code: wrap(page('#f1f4fa', '#c9d1e3') + '<path d="M19.5 22l-5 5.5 5 5.5M28.5 22l5 5.5-5 5.5M25.5 21l-3 13" stroke="#3b4160" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  exe: wrap('<rect x="5" y="9" width="38" height="30" rx="5" fill="#4a90e2"/><rect x="5" y="9" width="38" height="8" rx="5" fill="#2f6fbf"/><rect x="5" y="14" width="38" height="3" fill="#2f6fbf"/><circle cx="11" cy="13" r="1.4" fill="#fff"/><circle cx="16" cy="13" r="1.4" fill="#fff"/><rect x="11" y="23" width="26" height="3" rx="1.5" fill="#bcd6f6"/><rect x="11" y="29" width="16" height="3" rx="1.5" fill="#bcd6f6"/>')
};

const EXT = {
  image: 'png jpg jpeg gif webp bmp svg ico avif heic tif tiff',
  pdf: 'pdf', word: 'doc docx rtf odt', excel: 'xls xlsx csv ods', ppt: 'ppt pptx odp',
  video: 'mp4 mkv avi mov webm wmv flv m4v',
  audio: 'mp3 wav flac ogg m4a aac wma opus',
  archive: 'zip rar 7z tar gz bz2 xz iso',
  code: 'js mjs ts tsx jsx py json html htm css cs cpp c h java sh bat cmd ps1 xml yml yaml go rs php sql',
  text: 'txt md log ini cfg',
  exe: 'exe msi lnk url'
};
const MAP = {};
for (const [k, list] of Object.entries(EXT)) for (const e of list.split(' ')) MAP[e] = k;

export const categoryOf = ({ dir, ext }) => (dir ? 'folder' : MAP[String(ext || '').toLowerCase()] || 'file');
export const fileIcon = (item) => ICONS[categoryOf(item)] || ICONS.file;
export const ICON_KEYS = Object.keys(ICONS);
export const iconByKey = (k) => ICONS[k];

// Ikon folder untuk pill compact (memakai warna teks)
const FOLDER = 'M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h3.6l2 2.4H18a2.5 2.5 0 0 1 2.5 2.5v7.6A2.5 2.5 0 0 1 18 19.5H6a2.5 2.5 0 0 1-2.5-2.5z';
const sv = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
export const COMPACT_ICONS = {
  outline: sv(`<path d="${FOLDER}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`),
  filled: sv(`<path d="${FOLDER}" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`),
  stack: sv(`<path d="M6.5 3.5h6l1.6 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/><path d="M5.5 8a2.2 2.2 0 0 1 2.2-2.2h3l1.8 2H18a2.2 2.2 0 0 1 2.2 2.2v7.2a2.2 2.2 0 0 1-2.2 2.2H7.7a2.2 2.2 0 0 1-2.2-2.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`)
};
export const compactIcon = (v) => COMPACT_ICONS[v] || COMPACT_ICONS.outline;
