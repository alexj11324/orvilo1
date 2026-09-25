// Shared CDP helpers for the parity audit.
// dumpOverlays: find every element that looks like a floating overlay/menu/popup
// (fixed/absolute positioned, high z-index, recently appeared) and dump its rows.
export const OVERLAY_DUMP_JS = `() => {
  const isOverlay = (el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) return false;
    const z = parseInt(cs.zIndex || '0', 10);
    return z >= 10 || el.getAttribute('data-radix-popper-content-wrapper') !== null || r.top < 900;
  };
  const overlays = [];
  document.querySelectorAll('body > div, body > span, [data-radix-popper-content-wrapper], [role="dialog"], [role="menu"], [role="listbox"], [class*="popover" i], [class*="popup" i], [class*="overlay" i], [class*="menu" i]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    // rows inside
    const rows = [];
    el.querySelectorAll('[role="menuitem"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="switch"], [role="tab"], button, input, [data-list-grid-column], a').forEach((item) => {
      const ir = item.getBoundingClientRect();
      if (ir.width === 0 || ir.height === 0) return;
      rows.push({
        role: item.getAttribute('role') || item.tagName.toLowerCase(),
        aria: item.getAttribute('aria-label') || undefined,
        text: (item.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 70),
        checked: item.getAttribute('aria-checked') ?? undefined,
        selected: item.getAttribute('aria-selected') ?? undefined,
        disabled: item.getAttribute('aria-disabled') ?? (item.disabled ? 'true' : undefined),
        expanded: item.getAttribute('aria-expanded') ?? undefined,
      });
    });
    overlays.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      cls: (el.className || '').toString().slice(0, 80),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      pos: cs.position,
      z: cs.zIndex,
      textHead: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
      rowCount: rows.length,
      rows: rows.slice(0, 80),
    });
  });
  return overlays;
}`;
