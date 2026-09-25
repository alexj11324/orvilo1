(async () => {
  for (let i = 0; i < 60 && document.body.innerText.length < 400; i++)
    await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 1500));
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.textContent.trim();
    if (!t || t.length < 2) continue;
    const el = n.parentElement;
    const r = el.getBoundingClientRect();
    if (!r.width || r.top < 0 || r.top > 1200 || r.left < 240) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    out.push({
      t: t.slice(0, 40),
      x: Math.round(r.left),
      y: Math.round(r.top),
      fs: cs.fontSize,
      fw: cs.fontWeight,
      lh: cs.lineHeight,
      c: cs.color,
    });
  }
  // header icon
  return JSON.stringify(out.slice(0, 90));
})();
