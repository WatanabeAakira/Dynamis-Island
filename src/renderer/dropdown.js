const island = document.getElementById('island');
let portal;
const openDropdowns = new Set();

function getPortal() {
  if (!portal || !portal.isConnected) {
    portal = document.createElement('div');
    portal.id = 'island-dropdown-portal';
    portal.setAttribute('aria-live', 'off');
    island.append(portal); // outside .clip so menus can extend beyond the media panel
  }
  return portal;
}

const reportOverlayBounds = () => document.dispatchEvent(new Event('island:dropdownchange'));

function closeAll(except) {
  for (const dropdown of openDropdowns) if (dropdown !== except) dropdown.close();
}

document.addEventListener('pointerdown', (event) => {
  for (const dropdown of [...openDropdowns]) {
    if (dropdown.trigger.contains(event.target) || dropdown.menu.contains(event.target)) continue;
    dropdown.close();
  }
}, true);

export function createIslandDropdown(select, { className = '', ariaLabel } = {}) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `island-dropdown-trigger ${className}`.trim();
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', ariaLabel || select.getAttribute('aria-label') || 'Pilih opsi');
  trigger.innerHTML = '<span class="island-dropdown-label"></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
  select.before(trigger);
  select.classList.add('island-dropdown-source');

  const menu = document.createElement('div');
  menu.className = 'island-dropdown-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  menu.tabIndex = -1;
  getPortal().append(menu);

  let activeIndex = -1;
  const label = trigger.querySelector('.island-dropdown-label');
  const options = () => [...select.options].filter((option) => !option.disabled);

  function refresh() {
    const selected = select.selectedOptions?.[0] || select.options[select.selectedIndex];
    label.textContent = selected?.textContent || select.getAttribute('aria-label') || '';
    trigger.title = label.textContent;
    trigger.hidden = select.hidden;
    trigger.disabled = select.disabled || !select.options.length;
    if (!menu.hidden) { paintOptions(); positionMenu(); reportOverlayBounds(); }
  }

  function paintOptions() {
    const list = options();
    menu.replaceChildren(...list.map((option, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'island-dropdown-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === select.value));
      item.textContent = option.textContent;
      if (option.value === select.value) item.classList.add('selected');
      item.addEventListener('mouseenter', () => { activeIndex = index; markActive(); });
      item.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
        close();
      });
      return item;
    }));
    activeIndex = Math.max(0, list.findIndex((option) => option.value === select.value));
    markActive();
  }

  function markActive() {
    [...menu.querySelectorAll('.island-dropdown-option')].forEach((item, index) => {
      item.classList.toggle('active', index === activeIndex);
    });
  }

  function positionMenu() {
    const anchor = trigger.getBoundingClientRect();
    const root = island.getBoundingClientRect();
    const maxWidth = Math.min(340, window.innerWidth - 16);
    const width = Math.min(maxWidth, Math.max(anchor.width, Math.min(300, menu.scrollWidth + 12)));
    const maxHeight = Math.min(240, window.innerHeight - 16);
    menu.style.width = `${Math.max(120, width)}px`;
    menu.style.maxHeight = `${maxHeight}px`;
    menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)) - root.left}px`;
    menu.style.top = '0px';
    const height = Math.min(menu.scrollHeight, maxHeight);
    const below = window.innerHeight - anchor.bottom;
    const top = below >= height + 8 || anchor.top < height + 8 ? anchor.bottom + 6 : anchor.top - height - 6;
    menu.style.top = `${Math.max(8, top) - root.top}px`;
  }

  function open() {
    if (trigger.disabled || trigger.hidden) return;
    closeAll(api);
    paintOptions();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    openDropdowns.add(api);
    positionMenu();
    reportOverlayBounds();
  }

  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    openDropdowns.delete(api);
    reportOverlayBounds();
  }

  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); trigger.focus(); return; }
    const list = options();
    if (!list.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length;
      markActive();
      menu.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); activeIndex = event.key === 'Home' ? 0 : list.length - 1; markActive();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); menu.querySelectorAll('.island-dropdown-option')[activeIndex]?.click();
    }
  }

  const api = { trigger, menu, close, refresh };
  trigger.addEventListener('click', () => menu.hidden ? open() : close());
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (menu.hidden && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); open(); }
    else if (!menu.hidden) keydown(event);
  });
  menu.addEventListener('keydown', keydown);
  const observer = new MutationObserver(refresh);
  observer.observe(select, { childList: true, subtree: true, attributes: true });
  api.positionMenu = positionMenu;
  refresh();
  return { refresh, destroy() { close(); observer.disconnect(); trigger.remove(); menu.remove(); } };
}

window.addEventListener('resize', () => {
  for (const dropdown of openDropdowns) dropdown.positionMenu();
  if (openDropdowns.size) reportOverlayBounds();
});
