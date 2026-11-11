/** One page-local state controls the sleeve, tracklist, button and sidebar together. */
export function initRecord(root: HTMLElement) {
  if (root.dataset.recordReady === 'true') return;
  const button = root.querySelector<HTMLButtonElement>('[data-record-toggle]');
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-record-panel]'));
  const faces = Array.from(root.querySelectorAll<HTMLElement>('[data-record-face]'));
  const status = root.querySelector<HTMLOutputElement>('#record-status');
  if (!button || panels.length !== 2) return;
  let activeIndex = 0;

  const render = (index: number, announce = true) => {
    const active = panels[index];
    const next = panels[(index + 1) % panels.length];
    const id = active.dataset.recordPanel!;
    root.dataset.recordSide = id;
    for (const panel of panels) {
      const selected = panel === active;
      panel.inert = !selected;
      panel.setAttribute('aria-hidden', String(!selected));
    }
    for (const face of faces) {
      const selected = face.dataset.recordFace === id;
      face.inert = !selected;
      face.setAttribute('aria-hidden', String(!selected));
    }
    button.setAttribute('aria-pressed', String(index === 1));
    button.title = `翻至 ${next.dataset.sideLabel} — ${next.dataset.sideName}`;
    root.querySelectorAll<HTMLElement>('[data-record-button-label], [data-now-playing-side]').forEach(label => { label.textContent = active.dataset.sideLabel!; });
    root.querySelectorAll<HTMLElement>('[data-now-playing-name]').forEach(label => { label.textContent = active.dataset.sideName!; });
    root.querySelectorAll<HTMLElement>('[data-now-playing-heading]').forEach(label => { label.textContent = active.dataset.sideHeading!; });
    root.querySelectorAll<HTMLElement>('[data-now-playing-count]').forEach(label => { label.textContent = `${active.dataset.sideCount} 个专栏`; });
    if (announce && status) status.textContent = `当前 ${active.dataset.sideLabel}，${active.dataset.sideName}，${active.dataset.sideCount} 个专栏。`;
  };

  // Default to Side A on every visit, independent of theme or previous visits.
  render(0, false);
  root.dataset.recordReady = 'true';
  button.disabled = false;
  button.addEventListener('click', () => {
    activeIndex = (activeIndex + 1) % panels.length;
    render(activeIndex);
  });
  // CSS transitions reverse naturally on rapid clicks; no timers can leave stale state.
}

document.querySelectorAll<HTMLElement>('[data-record-home]').forEach(initRecord);
