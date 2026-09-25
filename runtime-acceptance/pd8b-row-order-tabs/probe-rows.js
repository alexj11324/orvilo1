// Project Issues row-structure probe — post-fix expectation:
// titleRow children order [priority svg][identifier][status span][title ...]
// row pitch ≈ 44px (measured on the live Linear reference 2026-09-24).
const statusSpans = [...document.querySelectorAll('span[data-collab-id$=":status"]')];
const describe = (el) => {
  const r = el.getBoundingClientRect();
  const hasSvg = !!el.querySelector?.('svg') || el.tagName === 'svg';
  const kind =
    el.hasAttribute?.('data-collab-id') && el.getAttribute('data-collab-id').endsWith(':status')
      ? 'status'
      : el.hasAttribute?.('data-task-workflow-state') ||
          el.querySelector?.('[data-task-workflow-state]')
        ? 'workflow-chip'
        : el.hasAttribute?.('data-task-labels')
          ? 'labels'
          : hasSvg
            ? 'icon'
            : (el.textContent || '').trim().replaceAll(/\s+/g, ' ').slice(0, 42) || el.tagName;
  return { x: Math.round(r.x), w: Math.round(r.width), kind };
};
const rows = statusSpans.slice(0, 12).map((s) => {
  const titleRow = s.parentElement;
  const kids = [...titleRow.children];
  const block = s.closest('div[data-collab-id^="task:"]');
  const br = block?.getBoundingClientRect();
  return {
    task: block?.getAttribute('data-collab-id-alt') || block?.getAttribute('data-collab-id'),
    statusIndex: kids.indexOf(s),
    rowTop: br ? Math.round(br.top) : null,
    rowH: br ? Math.round(br.height) : null,
    kids: kids.map(describe),
  };
});
// pitch = top-to-top distance between consecutive rows
const pitches = rows.slice(1).map((r, i) => r.rowTop - rows[i].rowTop);
return {
  url: location.href,
  renderedRowsWithStatus: statusSpans.length,
  workflowChipsOnPage: document.querySelectorAll('[data-task-workflow-state]').length,
  pitches,
  rows,
};
