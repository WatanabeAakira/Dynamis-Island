// Jangan fokuskan kolom sampai Island selesai membuka panelnya.
export function focusWhenReady(input, { select = false } = {}) {
  const focus = () => {
    if (!input.isConnected) return;

    const island = document.getElementById('island');
    const layoutReady = island
      && island.dataset.mode === 'expanded'
      && island.dataset.contentReady === 'true'
      && island.dataset.contentReadyTab === (island.dataset.tab || '')
      && island.dataset.contentReadySub === (island.dataset.sub || '');
    if (!layoutReady) {
      document.addEventListener('island:contentready', focus, { once: true });
      return;
    }

    window.api.focusWindow();
    input.focus({ preventScroll: true });
    if (select) input.select();
  };

  focus();
}
