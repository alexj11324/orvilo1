(async () => {
  const want = ['Active', 'Backlog', 'All issues'];
  const t0 = Date.now();
  let els = [];
  while (Date.now() - t0 < 20000) {
    els = want.map((w) =>
      [...document.querySelectorAll('a,button,[role=tab]')].find(
        (e) => e.textContent.trim() === w && e.getBoundingClientRect().y < 150,
      ),
    );
    if (els.every(Boolean)) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 800));
  const r = (e) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return {
      tag: e.tagName,
      text: e.textContent.trim().slice(0, 20),
      aria:
        e.getAttribute('aria-label') ||
        e.getAttribute('aria-current') ||
        e.getAttribute('aria-selected'),
      x: +b.x.toFixed(1),
      y: +b.y.toFixed(1),
      w: +b.width.toFixed(1),
      h: +b.height.toFixed(1),
      bg: cs.backgroundColor,
      color: cs.color,
      radius: cs.borderRadius,
      fs: cs.fontSize,
      fw: cs.fontWeight,
      border: cs.borderTop,
    };
  };
  const add = [...document.querySelectorAll('button,a')].find((e) =>
    /add new view|new view/i.test(e.getAttribute('aria-label') || ''),
  );
  const main = els[0]?.closest('main') || document.querySelector('main');
  const mb = main?.getBoundingClientRect();
  const icon = add?.querySelector('svg')?.getBoundingClientRect();
  return {
    url: location.href,
    vw: innerWidth,
    vh: innerHeight,
    dpr: devicePixelRatio,
    lang: document.documentElement.lang,
    waitedMs: Date.now() - t0,
    mainTop: mb && +mb.y.toFixed(1),
    mainLeft: mb && +mb.x.toFixed(1),
    scopes: els.map(r),
    addView: r(add),
    addIcon: icon && [icon.width, icon.height],
  };
})();
