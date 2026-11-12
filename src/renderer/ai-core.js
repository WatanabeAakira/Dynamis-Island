// Logika AI yang murni (tanpa DOM): pesan, alat, validasi argumen, dan teks konteks.

export const MODELS = {
  'llama-3.1-8b-instant': { label: 'Ringan', hint: 'Cepat, untuk pertanyaan singkat' },
  'llama-3.3-70b-versatile': { label: 'Lebih pintar', hint: 'Lebih lambat, jawaban lebih lengkap' }
};
export const DEFAULT_MODEL = 'llama-3.1-8b-instant';

export const SYSTEM_PROMPT = [
  'Kamu asisten ringan di Dynamis Island, aplikasi di Windows.',
  'Jawab singkat, jelas, dan ramah dalam bahasa yang dipakai pengguna (default Indonesia).',
  'Bantu hal sehari-hari saja: pertanyaan ringan, terjemahan singkat, merangkum, dan merapikan tulisan.',
  'Untuk tugas berat (menulis panjang, coding besar, analisis data), sarankan aplikasi yang tepat.',
  'Gunakan alat hanya jika pengguna memintanya. Jangan mengarang data yang tidak ada di konteks.'
].join(' ');

export const TOOLS = [
  { type: 'function', function: { name: 'set_timer', description: 'Atur dan mulai timer hitung mundur.', parameters: { type: 'object', properties: { minutes: { type: 'integer', minimum: 1, maximum: 600, description: 'Durasi dalam menit' } }, required: ['minutes'] } } },
  { type: 'function', function: { name: 'set_alarm', description: 'Atur alarm sekali bunyi pada jam tertentu.', parameters: { type: 'object', properties: { time: { type: 'string', description: 'Jam format HH:MM 24 jam' } }, required: ['time'] } } },
  { type: 'function', function: { name: 'add_event', description: 'Tambahkan event ke kalender.', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Nama event' }, date: { type: 'string', description: 'Tanggal YYYY-MM-DD' }, time: { type: 'string', description: 'Jam HH:MM, kosongkan untuk seharian' } }, required: ['title', 'date'] } } },
  { type: 'function', function: { name: 'media_control', description: 'Kontrol pemutaran musik: toggle (putar/jeda), next (berikutnya), prev (sebelumnya).', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['toggle', 'next', 'prev'] } }, required: ['action'] } } }
];

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// Memeriksa argumen dari model sebelum dijalankan
export function validate(name, args) {
  if (!args || typeof args !== 'object') return { ok: false, error: 'argumen tidak valid' };
  switch (name) {
    case 'set_timer': {
      const m = Number(args.minutes);
      if (!Number.isInteger(m) || m < 1 || m > 600) return { ok: false, error: 'durasi harus 1 sampai 600 menit' };
      return { ok: true, value: { minutes: m } };
    }
    case 'set_alarm': {
      const t = String(args.time || '').trim();
      if (!HM.test(t)) return { ok: false, error: 'jam harus format HH:MM' };
      return { ok: true, value: { time: t } };
    }
    case 'add_event': {
      const title = String(args.title || '').trim().slice(0, 60);
      const date = String(args.date || '').trim();
      const time = args.time ? String(args.time).trim() : null;
      if (!title) return { ok: false, error: 'nama event kosong' };
      if (!YMD.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00'))) return { ok: false, error: 'tanggal harus YYYY-MM-DD' };
      if (time && !HM.test(time)) return { ok: false, error: 'jam harus format HH:MM' };
      return { ok: true, value: { title, date, time } };
    }
    case 'media_control': {
      if (!['toggle', 'next', 'prev'].includes(args.action)) return { ok: false, error: 'aksi media tidak dikenal' };
      return { ok: true, value: { action: args.action } };
    }
    default:
      return { ok: false, error: `alat "${name}" tidak dikenal` };
  }
}

// Menggabungkan potongan tool_calls yang datang per bagian (streaming)
export function mergeToolCalls(acc, deltas) {
  for (const d of deltas || []) {
    const i = d.index ?? acc.length;
    if (!acc[i]) acc[i] = { id: '', type: 'function', function: { name: '', arguments: '' } };
    if (d.id) acc[i].id = d.id;
    if (d.type) acc[i].type = d.type;
    if (d.function) {
      if (d.function.name) acc[i].function.name += d.function.name;
      if (d.function.arguments) acc[i].function.arguments += d.function.arguments;
    }
  }
  return acc;
}

// Perintah singkat dari clipboard
export const QUICK = {
  ringkas: { label: 'Ringkas', prompt: (t) => `Ringkas teks berikut dalam 2 sampai 3 kalimat, dalam bahasa aslinya:\n\n${t}` },
  terjemah: { label: 'Terjemahkan', prompt: (t) => `Terjemahkan teks berikut. Jika berbahasa Indonesia, terjemahkan ke Inggris; jika bukan, terjemahkan ke Indonesia. Keluarkan hanya hasil terjemahannya:\n\n${t}` },
  perbaiki: { label: 'Perbaiki tulisan', prompt: (t) => `Perbaiki ejaan dan tata bahasa teks berikut tanpa mengubah maksudnya. Keluarkan hanya hasil perbaikannya:\n\n${t}` },
  jelaskan: { label: 'Jelaskan', prompt: (t) => `Jelaskan isi teks berikut secara sederhana dalam 2 sampai 3 kalimat:\n\n${t}` }
};

// Teks konteks ringkas (hanya yang diizinkan pengguna di Pengaturan)
export function contextText({ now, media, weather, events, timer }) {
  const lines = [];
  if (now) lines.push(`Sekarang: ${now}`);
  if (media && media.title) lines.push(`Musik: "${media.title}"${media.artist ? ' oleh ' + media.artist : ''}`);
  if (weather) lines.push(`Cuaca: ${weather.temp}°C, ${weather.label}`);
  if (events && events.length) lines.push('Jadwal hari ini: ' + events.slice(0, 5).map((e) => `${e.time || 'seharian'} ${e.title}`).join('; '));
  if (timer) lines.push(`Timer berjalan: sisa ${timer}`);
  return lines.join('\n');
}

// Susunan pesan yang dikirim: sistem, konteks (opsional), lalu riwayat terbaru
export function buildMessages(history, ctx, limit = 20) {
  const out = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (ctx) out.push({ role: 'system', content: `Konteks saat ini:\n${ctx}` });
  const recent = history.slice(-Math.max(2, limit));
  // Pesan pertama harus dari pengguna setelah sistem
  const start = recent.findIndex((m) => m.role === 'user');
  return out.concat(start >= 0 ? recent.slice(start) : []);
}

// Batas panjang riwayat yang disimpan di penyimpanan lokal
export function trimHistory(list, limit = 20) {
  return list.length > limit ? list.slice(list.length - limit) : list;
}
