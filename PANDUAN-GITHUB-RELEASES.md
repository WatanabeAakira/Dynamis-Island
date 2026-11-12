# Panduan GitHub Releases dan update otomatis

Panduan ini buat repo publik. Aplikasi yang sudah terpasang bakal ngecek GitHub tiap dibuka, download update di belakang layar, lalu nawarin restart buat masang versi baru.

## Struktur yang dipakai

```text
.
|-- .github/workflows/release.yml  # build installer tiap tag versi di-push
|-- helper/                        # source helper .NET
|-- lyrics/                        # folder lirik lokal; isi lirik di-ignore Git
|-- src/                           # source aplikasi Electron
|-- .gitignore
|-- package.json                   # versi aplikasi + konfigurasi build/update
|-- package-lock.json
`-- PANDUAN-GITHUB-RELEASES.md
```

`dist/`, `node_modules/`, `helper-bin/`, file lirik pribadi, dan arsip `kiraspace.zip` nggak ikut di-push. Installer bakal dibikin GitHub Actions dari source code.

## 1. Bikin repo GitHub

1. Di GitHub, bikin repo baru bernama **`dynamis-island`** dan set ke **Public**. Jangan centang opsi bikin README, `.gitignore`, atau license karena file project ini udah ada.
2. Buka `package.json`, terus ganti `GITHUB_USERNAME_LU` dengan username GitHub lu dan `NAMA_REPO_LU` dengan nama repo persisnya. Contoh: username `budi` dan repo `dynamis-island`.
3. Cek `.gitignore`: file `.lrc` dan `.elrc` dalam folder `lyrics/` otomatis dikecualikan. Kalau lu memang pengen membagikan lirik tertentu, hapus aturan ignore itu atau tambahkan file yang dipilih secara eksplisit.

## 2. Push source pertama kali

Buka PowerShell di folder project (`D:\kiraspace`), terus jalanin satu-satu:

```powershell
git add .
git status
```

Pastikan `git status` nggak nampilin `node_modules`, `dist`, `helper-bin`, file `.lrc`/`.elrc`, atau `kiraspace.zip`. Kalau udah aman:

```powershell
git commit -m "Siapkan project untuk GitHub Releases"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

Ganti `USERNAME` dan `REPO` sesuai repo lu. Kalau `origin` udah ada, jangan tambah lagi; cek dengan `git remote -v`, lalu pakai `git remote set-url origin https://github.com/USERNAME/REPO.git` kalau alamatnya keliru.

## 3. Rilis versi pertama

Versi aplikasi di `package.json` dan tag Git harus sama. Contoh pertama: `0.1.0` dan `v0.1.0`.

Kalau `package.json` masih `0.1.0`, jalanin:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions bakal jalan di tab **Actions**. Tunggu sampai statusnya hijau. Workflow Windows akan build helper .NET, bikin installer NSIS, dan nerbitin GitHub Release dengan installer serta metadata updater (`latest.yml` dan file `.blockmap`). Pastikan release-nya sudah terbit dan bukan draft.

Install versi itu dari installer yang terlampir di Release. Ini jadi pemasangan awal yang nanti menerima update otomatis.

## 4. Rilis update berikutnya

Setiap rilis wajib naikin `version` di `package.json`, commit perubahannya, lalu bikin tag yang sama persis. Contoh `0.1.0` ke `0.1.1`:

```powershell
# Edit package.json: ubah "version" dari 0.1.0 jadi 0.1.1
git add .
git status
# Pastikan file source yang memang mau dirilis ikut ter-stage, tapi file pribadi tetap di-ignore.
git commit -m "Rilis versi 0.1.1"
git push
git tag v0.1.1
git push origin v0.1.1
```

Kalau perubahan source lu belum di-commit, tambahin dan commit juga sebelum `git push`. Jangan pakai ulang tag lama; tiap versi harus punya nomor/tag baru. Jangan edit release secara manual atau hapus `latest.yml`/`.blockmap`, karena updater perlu metadata itu.

## 5. Yang dilihat pengguna

Versi installer yang lagi dipakai ngecek update sekitar 15 detik setelah dibuka, lalu tiap 4 jam. Kalau update tersedia, aplikasi download otomatis. Setelah selesai, muncul pilihan **Restart sekarang** atau **Nanti**. Installer awal perlu dipasang manual; rilis setelahnya masuk lewat updater.

## Kalau ada yang gagal

- **Workflow nggak jalan:** cek nama tag harus diawali `v` dan formatnya `vangka.angka.angka`, misalnya `v0.1.1`.
- **Build error di .NET:** cek bagian `Actions` untuk log; workflow install .NET SDK 10 dan build dari source helper.
- **Update nggak kedeteksi:** pastiin repo publik, release terbaru sudah published, `package.json` owner/repo benar, nomor versi aplikasi lebih kecil dari versi release, dan aset `latest.yml` ada.
- **Push ditolak karena remote sudah ada:** lihat `git remote -v`; gunakan `git remote set-url origin ...`, jangan jalankan `git remote add` kedua kali.
- **Git bilang tag sudah ada:** pilih versi baru, contoh `v0.1.2`, dan samakan `package.json` ke `0.1.2`.
