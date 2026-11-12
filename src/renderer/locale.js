const EN = {
  Pengaturan: 'Settings', Umum: 'General', Tampilan: 'Appearance', Perilaku: 'Behavior',
  'Pintasan Aplikasi': 'App Shortcuts', 'Asisten AI': 'AI Assistant', Notifikasi: 'Notifications',
  'File Tray': 'File Tray', Lirik: 'Lyrics', Fitur: 'Features',
  'Pengaturan dasar aplikasi.': 'Basic app settings.', 'Warna dan gaya island.': 'Island colors and style.',
  'Kapan island terbuka dan tertutup.': 'When the island opens and closes.',
  'Aplikasi favorit, tampilan, dan perilaku di island.': 'Favorite apps, appearance, and island behavior.',
  'Kunci API Groq, model, dan konteks yang dipakai asisten.': 'Groq API key, model, and assistant context.',
  'Durasi banner, riwayat, dan isi pesan notifikasi.': 'Banner duration, history, and notification message content.',
  'Tampilan, urutan, dan lencana item di File Tray.': 'File Tray item display, order, and badges.',
  'Sumber, waktu, dan salinan lirik di tab Media.': 'Lyrics sources, timing, and saved lyrics in the Media tab.',
  Tutup: 'Close', Kecilkan: 'Minimize', Perbesar: 'Maximize',
  'Pilih bahasa': 'Choose a language', Bahasa: 'Language',
  'Bahasa aplikasi': 'App language', 'Atur bahasa yang dipakai aplikasi.': 'Choose the language used by the app.',
  'Pilih bahasa yang dipakai di aplikasi. Perubahan langsung diterapkan.': 'Choose the language used in the app. Changes apply immediately.',
  'Indonesia': 'Indonesian', 'Inggris': 'English',
  'Jalankan saat Windows menyala': 'Launch when Windows starts',
  'Keluar dari aplikasi': 'Quit the app', 'Warna aksen': 'Accent color',
  'Ikuti warna cover lagu': 'Match the album art color',
  'Buka island saat kursor di atasnya': 'Open the island on hover',
  'Jeda sebelum menutup': 'Delay before closing', 'Info lagu di mode collapse': 'Track info while collapsed',
  'Folder data': 'Data folder', 'Buka folder': 'Open folder', Keluar: 'Quit',
  'Kecil': 'Small', Sedang: 'Medium', Besar: 'Large', Terbaru: 'Recent', Nama: 'Name', Jenis: 'Type',
  Grid: 'Grid', Daftar: 'List', Garis: 'Outline', Isi: 'Filled', Tumpuk: 'Stack',
  'Simpan': 'Save', Hapus: 'Delete', 'Hapus semua': 'Delete all', 'Yakin?': 'Are you sure?',
  'Pilih': 'Choose', 'Memuat...': 'Loading...', 'Memeriksa...': 'Checking...',
  'Selalu aktif': 'Always on', 'Tidak ada item yang hilang.': 'No missing items.',
  'Belum ada salinan. Lirik yang dipilih atau diseret ke panel lirik akan tersimpan di sini.': 'No saved lyrics yet. Lyrics selected or dropped into the lyrics panel will appear here.',
  'Versi': 'Version', 'Bahasa Indonesia': 'Indonesian',
  'Media Player': 'Media Player', 'Timer, Focus, Alarm': 'Timer, Focus, Alarm',
  Cuaca: 'Weather', Kalender: 'Calendar', Jam: 'Clock',
  'Kontrol Audio': 'Audio Controls', 'Shortcut Aplikasi': 'App Shortcuts',
  'Cover album, lirik, dan kontrol pemutaran': 'Album art, lyrics, and playback controls',
  'Tiga kartu: timer, sesi fokus, dan alarm': 'Three cards: timer, focus session, and alarm',
  'Cuaca lokasi kamu dan perkiraan beberapa hari': 'Local weather and a multi-day forecast',
  'Strip 7 hari dengan tambah event': 'A 7-day strip with event creation',
  'Digital di kiri, analog di kanan': 'Digital on the left, analog on the right',
  'Pemberitahuan dari timer, alarm, dan kalender': 'Alerts from timers, alarms, and calendar',
  'Volume tiap aplikasi yang sedang bersuara': 'Volume for each app playing audio',
  'Seret file dan folder untuk disimpan sementara': 'Drop files and folders here for temporary access',
  'Buka aplikasi favorit dengan satu klik': 'Open favorite apps with one click',
  'Asisten Groq yang bisa mengontrol island': 'A Groq assistant that can control the island',
  'Tersedia di tahap': 'Available in stage'
};

export function tr(text, language = 'id') {
  if (language !== 'en') return text;
  return EN[text] || text;
}

export function localizeTree(root, language = 'id') {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const source = node.__localeSource ?? node.data;
    node.__localeSource = source;
    node.data = tr(source, language);
  }
  for (const el of root.querySelectorAll?.('[title], [aria-label], [placeholder]') || []) {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const value = el.getAttribute(attr);
      if (value != null) {
        const source = el.getAttribute(`data-locale-${attr}`) ?? value;
        el.setAttribute(`data-locale-${attr}`, source);
        el.setAttribute(attr, tr(source, language));
      }
    }
  }
}
