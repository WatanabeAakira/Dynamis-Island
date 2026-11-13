# Dynamis Island

> A Windows dynamic island for media controls, timers, weather, notifications, and productivity tools.

## Latest release — v0.1.3

Updated the Clock tab with a redesigned digital and analog display, locale-aware date formats, optional seconds, and additional time information. Indonesian remains the default language.

Project ini bisa bikin installer Windows dan update otomatis dari GitHub Releases. Setup repo dan cara nerbitin versi baru ada di [PANDUAN-GITHUB-RELEASES.md](PANDUAN-GITHUB-RELEASES.md).

## Menjalankan
```
npm install
npm start
```
Butuh Node.js 18+ (Windows 10 / 11).

## Build installer Windows
```powershell
npm run build:win
```
Hasil installer ada di `dist/Dynamis-Island-Setup-<versi>.exe`. Perintah ini membangun helper .NET 10 secara self-contained, jadi perangkat tujuan tidak perlu memasang runtime .NET terpisah. Installer per pengguna menyediakan opsi folder pemasangan, shortcut Start Menu dan Desktop, serta pilihan menjalankan aplikasi setelah instalasi. Build ini belum ditandatangani sertifikat code-signing.

## Isi tahap ini
- Window transparan, frameless, always-on-top, menempel di y = 0 tengah layar (monitor utama)
- Island half-pill: sisi atas lurus, sudut bawah melengkung; lebar, tinggi, dan radius dianimasikan bersamaan
- Tiga mode: collapsed -> hover (tab bar) -> expanded (isi tab)
- Click-through di area transparan
- 10 tab ikon (placeholder) + halaman pengaturan (warna aksen, buka saat hover, jeda tutup, auto-start)
- Event `island:modechange` di `document` untuk dipakai fitur berikutnya (mis. mini lyrics)

## Struktur
```
src/main.js            main process (window, posisi, settings, IPC)
src/preload.js         jembatan aman ke renderer
src/renderer/app.js    state mode, tab bar, click-through
src/renderer/tabs.js   registry 10 tab + ikon
src/renderer/settings.js
```
Pengaturan tersimpan di `%APPDATA%/windows-island/settings.json`.

## Tahap 3.1: Gradient cover
- Tab Media dan mini lyrics punya gradient bawah ke atas dari 3 warna cover (crossfade saat lagu berganti)
- Warna aksen bisa diatur untuk mengikuti warna cover lagu melalui Pengaturan
- Mini lyrics hanya berisi ikon musik dan lirik

## Tahap 3: Lirik
- Tombol "Pilih file .lrc" menyalin file ke folder `lyrics/` di project dengan nama `Artis - Judul`, jadi lagu yang sama otomatis memakainya
- Ikon lirik di tab Media membuka tampilan dua panel (kiri: cover dan kontrol, kanan: 3 baris lirik)
- Sumber: file lokal (folder diatur di pengaturan; nama `Artis - Judul.lrc` atau `.elrc`) lalu LRCLIB
- Mini lyrics: buka tab Media, tekan ikon lirik, lalu keluarkan kursor dari island

## Helper C# + Media Player
```
npm run build:helper    # membangun helper self-contained untuk Windows x64
npm start
```
Helper tampil di `helper-bin/IslandHelper.exe`. Protokol: JSON per baris lewat stdout/stdin.

## Audio Control dan pin island
- Perangkat output dapat diganti dari Audio Control. Pergantian memakai antarmuka Windows `IPolicyConfig` yang tidak terdokumentasi resmi, sehingga perilakunya dapat berubah antarversi Windows.
- Menu opsi pada baris aplikasi audio mencoba mengaktifkan jendela aplikasi yang sedang berjalan; jika belum ada jendela, helper mencoba menjalankan file aplikasinya.
- Tombol pin di tab bar menahan island tetap terbuka saat pointer keluar. Pin bersifat sementara dan direset saat island ditampilkan ulang dari menu tray.
