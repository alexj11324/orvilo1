(async () => {
  const want = ['Active', 'Backlog', 'All issues', '进行中', '待办', '所有问题'];
  const bar = () => {
    const b = [...document.querySelectorAll('button')].find((e) =>
      /new view|add new view|新建视图|添加新视图|savedViews.addNewView/i.test(
        (e.getAttribute('aria-label') || '') + e.textContent,
      ),
    );
    let n = b;
    for (let i = 0; n && i < 6; i++) {
      n = n.parentElement;
      if (n && [...n.querySelectorAll('*')].some((c) => want.includes(c.textContent.trim())))
        return n;
    }
    return document.body;
  };
  const find = () =>
    [...bar().querySelectorAll('button,[role=radio],label,div,span')].filter(
      (e) =>
        want.includes(e.textContent.trim()) &&
        e.children.length <= 1 &&
        e.getBoundingClientRect().width > 0,
    );
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    if (find().length >= 3 && document.querySelector('[data-insp-path*="TeamIssuesSurface"]'))
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 800));
  const r = (e) => {
    const b = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return {
      tag: e.tagName,
      role: e.getAttribute('role'),
      aria:
        e.getAttribute('aria-label') ||
        e.getAttribute('aria-current') ||
        e.getAttribute('aria-checked'),
      text: e.textContent.trim().slice(0, 30),
      x: +b.x.toFixed(1),
      y: +b.y.toFixed(1),
      w: +b.width.toFixed(1),
      h: +b.height.toFixed(1),
      bg: cs.backgroundColor,
      color: cs.color,
      radius: cs.borderRadius,
      fs: cs.fontSize,
      fw: cs.fontWeight,
    };
  };
  // keep the innermost match per label
  const scopes = want
    .map((w) => find().find((e) => e.textContent.trim() === w))
    .filter(Boolean)
    .map(r);
  const addView = [...document.querySelectorAll('button,[role=button]')]
    .filter((e) =>
      /new view|add new view|新建视图|添加新视图|savedViews.addNewView/i.test(
        (e.getAttribute('aria-label') || '') + ' ' + e.textContent,
      ),
    )
    .map(r);
  const surface = document.querySelector('[data-insp-path*="TeamIssuesSurface"]');
  return {
    url: location.href,
    vw: innerWidth,
    vh: innerHeight,
    dpr: devicePixelRatio,
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    theme: document.documentElement.dataset.theme || document.body.className.slice(0, 40),
    lang: document.documentElement.lang,
    waitedMs: Date.now() - t0,
    inspSample: surface?.dataset.inspPath,
    scopes,
    addView,
  };
})();
