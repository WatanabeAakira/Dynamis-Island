// Tab "Timer | Focus | Alarm": tiga kartu, lalu masuk ke tampilan masing-masing.
import { ICONS } from './tabs.js';
import { renderTimer, BACK_BTN } from './timer-view.js';
import { renderFocus } from './focus-view.js';
import { renderAlarm } from './alarm-view.js';
import { nextInfo } from './alarmkeeper.js';
import { timer, focus, fmtShort } from './timekeeper.js';

const island = document.getElementById('island');
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const ICON = {
  timer: ICONS.timer,
  focus: svg('<path d="M12 3c1 3.6 5.2 5.6 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.1 1-3.7 2.3-4.8.2 1.7 1 2.6 2.1 2.8C10.6 8.8 10.8 5.6 12 3z"/>'),
  alarm: svg('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.6 1.6M4.3 5.6l2.6-2.1M19.7 5.6l-2.6-2.1"/>')
};

let sub = 'cards';
export const openSub = (name) => { sub = name; };
export function renderTimeTab(container) { draw(container); }

function draw(c) {
  island.dataset.sub = sub === 'cards' ? '' : sub;
  if (sub === 'cards') return cards(c);
  const back = () => { sub = 'cards'; draw(c); };
  if (sub === 'timer') return renderTimer(c, back);
  if (sub === 'focus') return renderFocus(c, back);
  return renderAlarm(c, back);
}

function cards(c) {
  const defs = [
    { id: 'timer', title: 'Timer' },
    { id: 'focus', title: 'Focus' },
    { id: 'alarm', title: 'Alarm' }
  ];
  c.innerHTML = `
    <div class="view tcards">
      ${defs.map((d) => `
        <button class="tc tc-${d.id}" data-sub="${d.id}">
          <span class="tc-bg">${ICON[d.id]}</span>
          <span class="tc-ico">${ICON[d.id]}</span>
          <span class="tc-title">${d.title}</span>
          <span class="tc-sub" id="tc-sub-${d.id}"></span>
        </button>`).join('')}
    </div>`;

  const root = c.querySelector('.tcards');
  const subText = {
    timer: () => (timer.running ? `${fmtShort(timer.remaining)} tersisa` : timer.done ? 'Selesai' : 'Hitung mundur'),
    focus: () => (focus.running ? `${fmtShort(focus.remaining)} ${{ focus: 'fokus', short: 'istirahat', long: 'istirahat panjang' }[focus.mode]}` : `Sesi hari ini: ${focus.sessions}`),
    alarm: () => { const n = nextInfo(); return n ? `Berikutnya ${String(n.alarm.h).padStart(2, '0')}:${String(n.alarm.m).padStart(2, '0')}` : 'Belum ada alarm aktif'; }
  };
  const update = () => defs.forEach((d) => { c.querySelector(`#tc-sub-${d.id}`).textContent = subText[d.id](); });
  update();
  const iv = setInterval(() => { if (!root.isConnected) clearInterval(iv); else update(); }, 500);

  c.querySelectorAll('.tc').forEach((b) => b.addEventListener('click', () => { sub = b.dataset.sub; draw(c); }));
}
