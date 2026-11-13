import { getLanguage } from './locale.js';

const STARTED_AT = Date.now();
const pad = (n) => String(n).padStart(2, '0');
const DEFAULTS = {
  timeFormat: '24h',
  dateFormat: 'long',
  showSeconds: true,
  showAdditionalInfo: true,
  analogSecondHand: true
};

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

function numerals() {
  let out = '';
  for (let i = 1; i <= 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    out += `<text x="${(Math.sin(a) * 69).toFixed(2)}" y="${(-Math.cos(a) * 69).toFixed(2)}">${i}</text>`;
  }
  return out;
}

function isoWeek(date) {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil((((day - yearStart) / 86400000) + 1) / 7);
}

function dateLabel(date, format, language) {
  if (format === 'numeric') return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const locale = language === 'en' ? 'en-US' : 'id-ID';
  const options = {
    weekday: format === 'abbreviated' ? 'short' : 'long',
    day: 'numeric',
    month: format === 'abbreviated' ? 'short' : 'long',
    year: 'numeric'
  };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

function timeParts(date, format, language) {
  if (format === '12h') {
    const parts = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'id-ID', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).formatToParts(date);
    return {
      time: `${parts.find((part) => part.type === 'hour').value}:${parts.find((part) => part.type === 'minute').value}`,
      period: parts.find((part) => part.type === 'dayPeriod')?.value || ''
    };
  }
  return { time: `${pad(date.getHours())}:${pad(date.getMinutes())}`, period: '' };
}

function uptimeLabel(now) {
  const elapsed = Math.floor((now - STARTED_AT) / 1000);
  return `${pad(Math.floor(elapsed / 3600))}:${pad(Math.floor(elapsed / 60) % 60)}:${pad(elapsed % 60)}`;
}

export function renderClock(container, settings = {}) {
  const clock = { ...DEFAULTS, ...(settings.clock || {}) };
  container.innerHTML = `
    <div class="view clock">
      <header class="ck-head">
        <div class="ck-id">
          <div class="ck-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l3.5 2"/></svg>
          </div>
          <div class="ck-title">
            <b>Jam</b>
            <small id="ck-head-date"></small>
          </div>
        </div>
        <div class="ck-controls">
          <button class="ck-control" id="ck-date-format" type="button" aria-label="Ubah format tanggal" title="Ubah format tanggal">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M8 14h2M14 14h2M8 17h2"/></svg>
          </button>
          <button class="ck-format" id="ck-format" type="button" aria-pressed="${clock.timeFormat === '12h'}"></button>
          <button class="ck-control" id="ck-more" type="button" aria-label="Pengaturan jam" title="Pengaturan jam">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
          </button>
        </div>
      </header>
      <div class="ck-main">
        <div class="ck-digital">
          <div class="ck-time" role="timer">
            <span id="ck-hm"></span><span class="ck-sec" id="ck-s"></span><span class="ck-period" id="ck-period"></span>
          </div>
          <div class="ck-date" id="ck-date"></div>
          <div class="ck-stats" id="ck-stats">
            <div class="ck-stat">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>
              <span><small>Minggu ke-</small><b id="ck-week"></b></span>
            </div>
            <div class="ck-stat">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <span><small>Hari ke-</small><b id="ck-year-day"></b></span>
            </div>
            <div class="ck-stat">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <span><small>Waktu aktif</small><b id="ck-uptime"></b></span>
            </div>
          </div>
        </div>
        <div class="ck-analog">
          <svg viewBox="-100 -100 200 200" role="img" aria-label="Jam analog">
            <circle r="97" class="face"/>
            ${ticks()}
            ${numerals()}
            <g id="ck-hh"><line x1="0" y1="7" x2="0" y2="-48" class="hh"/></g>
            <g id="ck-mh"><line x1="0" y1="9" x2="0" y2="-69" class="mh"/></g>
            <g id="ck-sh"><line x1="0" y1="16" x2="0" y2="-78" class="sh"/></g>
            <circle r="5" class="cd"/><circle r="1.8" class="ck-center"/>
          </svg>
        </div>
      </div>
    </div>`;

  const q = (selector) => container.querySelector(selector);
  const root = q('.clock');
  const hm = q('#ck-hm'), sec = q('#ck-s'), period = q('#ck-period');
  const date = q('#ck-date'), headDate = q('#ck-head-date');
  const week = q('#ck-week'), yearDay = q('#ck-year-day'), uptime = q('#ck-uptime');
  const hh = q('#ck-hh'), mh = q('#ck-mh'), sh = q('#ck-sh');
  const formatButton = q('#ck-format');
  let lastMinute = -1, lastSecond = -1, lastDate = '';

  const updateFormatButton = () => {
    formatButton.textContent = clock.timeFormat === '12h' ? '12H' : '24H';
    formatButton.setAttribute('aria-pressed', String(clock.timeFormat === '12h'));
  };
  updateFormatButton();
  q('#ck-date-format').addEventListener('click', async () => {
    const formats = ['long', 'abbreviated', 'numeric'];
    const next = formats[(formats.indexOf(clock.dateFormat) + 1) % formats.length];
    await window.api.setSettings({ clock: { ...clock, dateFormat: next } });
  });
  q('#ck-more').addEventListener('click', () => window.api.openSettings('clock'));
  formatButton.addEventListener('click', async () => {
    const timeFormat = clock.timeFormat === '12h' ? '24h' : '12h';
    await window.api.setSettings({ clock: { ...clock, timeFormat } });
  });
  q('#ck-stats').hidden = !clock.showAdditionalInfo;
  sh.setAttribute('visibility', clock.analogSecondHand ? 'visible' : 'hidden');

  (function frame() {
    if (!root.isConnected) return;
    const now = new Date();
    const hour = now.getHours(), minute = now.getMinutes(), second = now.getSeconds();
    const milliseconds = now.getMilliseconds();
    sh.setAttribute('transform', `rotate(${(second + milliseconds / 1000) * 6})`);
    mh.setAttribute('transform', `rotate(${(minute + second / 60) * 6})`);
    hh.setAttribute('transform', `rotate(${((hour % 12) + minute / 60 + second / 3600) * 30})`);

    if (hour * 60 + minute !== lastMinute) {
      lastMinute = hour * 60 + minute;
      const { time, period: periodLabel } = timeParts(now, clock.timeFormat, getLanguage());
      hm.textContent = time;
      period.textContent = periodLabel;
      period.hidden = !periodLabel;
      sec.hidden = !clock.showSeconds;
    }
    if (second !== lastSecond) {
      lastSecond = second;
      sec.textContent = pad(second);
      uptime.textContent = uptimeLabel(now.getTime());
      const dayNumber = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 0)) / 86400000);
      const daysInYear = (Date.UTC(now.getFullYear() + 1, 0, 1) - Date.UTC(now.getFullYear(), 0, 1)) / 86400000;
      week.textContent = isoWeek(now);
      yearDay.textContent = `${dayNumber} / ${daysInYear}`;
    }
    const language = getLanguage();
    const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${language}-${clock.dateFormat}`;
    if (dateKey !== lastDate) {
      lastDate = dateKey;
      const label = dateLabel(now, clock.dateFormat, language);
      date.textContent = label;
      headDate.textContent = label;
    }
    requestAnimationFrame(frame);
  })();
}
