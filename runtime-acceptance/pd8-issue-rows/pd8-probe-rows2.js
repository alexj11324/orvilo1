const statuses = [...document.querySelectorAll('[data-collab-id$=":status"]')];
const describe = (el) => {
  const r = el.getBoundingClientRect();
  const kind =
    el.querySelector?.('[data-task-workflow-state]') ||
    el.hasAttribute?.('data-task-workflow-state')
      ? 'workflow-chip'
      : (el.getAttribute?.('data-collab-id') || '').endsWith(':status')
        ? 'status'
        : el.hasAttribute?.('data-task-labels')
          ? 'labels'
          : (el.textContent || '').trim().replaceAll(/\s+/g, ' ').slice(0, 50) || el.tagName;
  return { x: Math.round(r.x), w: Math.round(r.width), kind };
};
const rows = statuses.slice(0, 8).map((s) => {
  const titleRow = s.parentElement;
  const kids = [...titleRow.children];
  const block = s.closest('div[data-collab-id^="task:"]');
  return {
    task: block?.getAttribute('data-collab-id-alt') || block?.getAttribute('data-collab-id'),
    statusTag: s.tagName,
    statusIndex: kids.indexOf(s),
    kids: kids.map(describe),
  };
});
return {
  url: location.href,
  renderedRowsWithStatus: statuses.length,
  workflowChipsOnPage: document.querySelectorAll('[data-task-workflow-state]').length,
  rows,
};
