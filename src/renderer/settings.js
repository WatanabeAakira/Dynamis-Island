import { reloadLyrics } from './lyrics.js';

const ACCENTS = ['#8b9bff', '#6ee7b7', '#fbbf77', '#f7a1c4', '#7dd3fc', '#c4b5fd'];

export async function renderSettings(container, onChange) {
  const s = await window.api.getSettings();

  container.innerHTML = `
    <div class="view settings">
      <h2>Pengaturan</h2>

      <div class="row">
        <div>Warna aksen</div>
        <div class="swatches">
          ${ACCENTS.map(c => `<button class="swatch ${c === s.accent ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Warna ${c}"></button>`).join('')}
        </div>
      </div>

      <div class="row">
        <div>Ikuti warna cover lagu<small>Warna pilihan dipakai jika cover tidak tersedia</small></div>
        <label class="switch"><input type="checkbox" id="s-accent-cover" aria-label="Ikuti warna cover lagu" ${s.accentFromCover ? 'checked' : ''}><span></span></label>
      </div>

      <div class="row">
        <div>Buka saat kursor di atas island<small>Jika mati, island dibuka dengan klik</small></div>
        <label class="switch"><input type="checkbox" id="s-hover" ${s.openOnHover ? 'checked' : ''}><span></span></label>
      </div>

      <div class="row">
        <div>Jeda sebelum menutup<small id="s-delay-val">${s.collapseDelay} ms</small></div>
        <input type="range" id="s-delay" min="0" max="1500" step="50" value="${s.collapseDelay}">
      </div>

      <div class="row">
        <div>Jalankan saat Windows menyala<small>Berlaku setelah aplikasi di-build</small></div>
        <label class="switch"><input type="checkbox" id="s-auto" ${s.autoStart ? 'checked' : ''}><span></span></label>
      </div>

      <div class="row">
        <div>Folder lirik tambahan<small>${s.lyricsDir || 'Opsional. Nama file: Artis - Judul.lrc'}</small></div>
        <div class="btns"><button class="btn" id="s-ldir">Pilih</button>${s.lyricsDir ? '<button class="btn" id="s-ldir-x">Hapus</button>' : ''}</div>
      </div>

      <div class="row">
        <div>Salinan lirik tersimpan<small id="s-lm-count">Memuat...</small></div>
        <button class="btn" id="s-lm">Kelola</button>
      </div>

      <div class="row"><div></div><button class="btn danger" id="s-quit">Keluar dari aplikasi</button></div>
    </div>`;

  const save = async (patch) => onChange(await window.api.setSettings(patch));

  container.querySelectorAll('.swatch').forEach(b => b.addEventListener('click', () => {
    container.querySelectorAll('.swatch').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    save({ accent: b.dataset.color });
  }));
  container.querySelector('#s-accent-cover').addEventListener('change', e => save({ accentFromCover: e.target.checked }));
  container.querySelector('#s-hover').addEventListener('change', e => save({ openOnHover: e.target.checked }));
  container.querySelector('#s-auto').addEventListener('change', e => save({ autoStart: e.target.checked }));
  container.querySelector('#s-delay').addEventListener('input', e => {
    container.querySelector('#s-delay-val').textContent = `${e.target.value} ms`;
  });
  container.querySelector('#s-delay').addEventListener('change', e => save({ collapseDelay: Number(e.target.value) }));
  container.querySelector('#s-ldir').addEventListener('click', async () => {
    const d = await window.api.pickLyricsDir();
    if (d) { await save({ lyricsDir: d }); renderSettings(container, onChange); }
  });
  const clr = container.querySelector('#s-ldir-x');
  if (clr) clr.addEventListener('click', async () => { await save({ lyricsDir: '' }); renderSettings(container, onChange); });
  container.querySelector('#s-lm').addEventListener('click', () => renderManager(container, onChange));
  window.api.listLyrics().then((l) => {
    const sm = container.querySelector('#s-lm-count');
    if (sm) sm.textContent = `${l.length} file`;
  });
  container.querySelector('#s-quit').addEventListener('click', () => window.api.quit());
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Daftar lirik yang tersimpan di folder lyrics/. Hapus butuh dua klik supaya tidak tak sengaja.
async function renderManager(container, onChange) {
  const items = await window.api.listLyrics();
  container.innerHTML = `
    <div class="view lm">
      <div class="lm-head">
        <button class="btn" id="lm-back">Kembali</button>
        <h2>Salinan lirik (${items.length})</h2>
        <button class="btn" id="lm-open">Buka folder</button>
      </div>
      <div class="lm-list">
        ${items.length
          ? items.map((it, i) => `<div class="lm-item"><span class="lm-name" title="${esc(it.name)}">${esc(it.name)}</span><button class="lm-del" data-i="${i}" aria-label="Hapus ${esc(it.name)}">×</button></div>`).join('')
          : '<p class="lm-empty">Belum ada salinan. Lirik yang dipilih atau diseret ke panel lirik akan tersimpan di sini.</p>'}
      </div>
    </div>`;

  container.querySelector('#lm-back').addEventListener('click', () => renderSettings(container, onChange));
  container.querySelector('#lm-open').addEventListener('click', () => window.api.openLyricsDir());
  container.querySelectorAll('.lm-del').forEach((b) => {
    let armed = 0;
    b.addEventListener('click', async () => {
      if (!armed) {
        b.classList.add('arm');
        b.textContent = 'Hapus?';
        armed = setTimeout(() => { armed = 0; b.classList.remove('arm'); b.textContent = '×'; }, 2500);
        return;
      }
      clearTimeout(armed);
      await window.api.deleteLyrics(items[Number(b.dataset.i)].name);
      reloadLyrics();
      renderManager(container, onChange);
    });
  });
}
