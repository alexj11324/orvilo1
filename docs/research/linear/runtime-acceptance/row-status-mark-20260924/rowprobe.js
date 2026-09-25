(() => {
  const sig = (el) =>
    el
      ? [...el.querySelectorAll('svg path, svg circle')]
          .map((p) => p.tagName + ':' + (p.getAttribute('d') || p.getAttribute('r')))
          .join('|')
          .slice(0, 120)
      : null;
  const marks = [...document.querySelectorAll('[data-collab-id$=":status"]')];
  return JSON.stringify(
    marks.map((m) => {
      const row = m.closest('[data-task-id], [role="row"], li, a') || m.parentElement.parentElement;
      const r = m.getBoundingClientRect();
      // walk back to preceding group header: nearest previous element with a status-like svg and a count
      let header = null,
        n = row;
      for (let i = 0; i < 400 && n; i++) {
        n = n.previousElementSibling || n.parentElement;
        if (n && n.matches && n.matches('[data-group-key], [data-group-header]')) {
          header = n;
          break;
        }
      }
      return {
        id: m.getAttribute('data-collab-id-alt'),
        text: row.innerText.replaceAll(/\s+/g, ' ').slice(0, 80),
        svgsInRow: row.querySelectorAll('svg').length,
        markSize: Math.round(r.width) + 'x' + Math.round(r.height),
        markSig: sig(m),
        header: header ? header.innerText.replaceAll(/\s+/g, ' ').slice(0, 30) : null,
        headerSig: header ? sig(header) : null,
      };
    }),
  );
})();
