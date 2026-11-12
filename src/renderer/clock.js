// Tab Jam: kiri jam digital, kanan jam analog yang bergerak mulus.

const pad = (n) => String(n).padStart(2, '0');

function tzText() {
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').replace(/_/g, ' ');
  const off = -new Date().getTimezoneOffset();
  const a = Math.abs(off);
  const h = Math.floor(a / 60), m = a % 60;
  return `${tz ? tz + ', ' : ''}UTC${off >= 0 ? '+' : '-'}${h}${m ? ':' + pad(m) : ''}`;
}

function ticks() {
  let out = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i * 6 * Math.PI) / 180;
    const r1 = 94, r2 = major ? 82 : 89;
    out += `<line x1="${(Math.sin(a) * r1).toFixed(2)}" y1="${(-Math.cos(a) * r1).toFixed(2)}" x2="${(Math.sin(a) * r2).toFixed(2)}" y2="${(-Math.cos(a) * r2).toFixed(2)}" class="tk${major ? ' major' : ''}"/>`;
  }
  return out;
}

export function renderClock(container) {
  container.innerHTML = `
    <div class="view clock">
      <div class="ck-digital">
        <div class="ck-time"><span id="ck-hm">00:00</span><span class="ck-sec" id="ck-s">00</span></div>
        <div class="ck-date" id="ck-date"></div>
        <div class="ck-sub" id="ck-sub"></div>
      </div>
      <div class="ck-analog">
        <svg viewBox="-100 -100 200 200" aria-label="Jam analog">
          <circle r="97" class="face"/>
          ${ticks()}
          <g id="ck-hh"><line x1="0" y1="7" x2="0" y2="-50" class="hh"/></g>
          <g id="ck-mh"><line x1="0" y1="9" x2="0" y2="-73" class="mh"/></g>
          <g id="ck-sh"><line x1="0" y1="16" x2="0" y2="-80" class="sh"/></g>
          <circle r="4.8" class="cd"/><circle r="1.8" fill="#000"/>
        </svg>
      </div>
    </div>`;

  const q = (s) => container.querySelector(s);
  const root = q('.clock');
  const hm = q('#ck-hm'), sec = q('#ck-s'), date = q('#ck-date'), sub = q('#ck-sub');
  const hh = q('#ck-hh'), mh = q('#ck-mh'), sh = q('#ck-sh');
  let lastMin = -1, lastSec = -1, lastDay = -1;

  (function frame() {
    if (!root.isConnected) return;
    const d = new Date();
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds(), ms = d.getMilliseconds();

    // Jarum bergerak halus, bukan loncat per detik
    sh.setAttribute('transform', `rotate(${(s + ms / 1000) * 6})`);
    mh.setAttribute('transform', `rotate(${(m + s / 60) * 6})`);
    hh.setAttribute('transform', `rotate(${((h % 12) + m / 60 + s / 3600) * 30})`);

    if (h * 60 + m !== lastMin) { lastMin = h * 60 + m; hm.textContent = `${pad(h)}:${pad(m)}`; }
    if (s !== lastSec) { lastSec = s; sec.textContent = pad(s); }
    if (d.getDate() !== lastDay) {
      lastDay = d.getDate();
      date.textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      sub.textContent = tzText();
    }
    requestAnimationFrame(frame);
  })();
}
