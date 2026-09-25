import { chromium } from 'playwright';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 90000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = { steps: {} };
const dump = (k, v) => {
  result.steps[k] = v;
  fs.writeFileSync(`${DIR}/linear-deep2.json`, JSON.stringify(result, null, 1));
};
const shot = (n) => page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {});
const popContent = async () =>
  page.evaluate(() => {
    // grab any visible popover/dialog/listbox/menu content
    const sels = [
      '[role="dialog"]',
      '[role="menu"]',
      '[role="listbox"]',
      '[data-radix-popper-content-wrapper]',
      '[class*="popover"]',
    ];
    const out = [];
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) {
        const r = el.getBoundingClientRect();
        if (r.width < 5 || r.height < 5) continue;
        const items = [
          ...el.querySelectorAll(
            '[role="menuitem"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],button,a,input,[role="textbox"],[contenteditable]',
          ),
        ]
          .map((i) => {
            const ir = i.getBoundingClientRect();
            return {
              tag: i.tagName,
              role: i.getAttribute('role'),
              aria: i.getAttribute('aria-label'),
              text: i.textContent.trim().slice(0, 60),
              placeholder: i.getAttribute('placeholder'),
              y: Math.round(ir.y),
              w: Math.round(ir.width),
            };
          })
          .filter((i) => i.text || i.aria || i.placeholder);
        out.push({
          sel: s,
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: el.textContent.trim().slice(0, 200),
          items,
        });
      }
    }
    return out;
  });
try {
  await page.goto(
    'https://linear.app/bdiverifier/project/orvilo-linear-parity-3eb13143d468/overview',
    { waitUntil: 'load', timeout: 30000 },
  );
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => document.body.innerText.slice(0, 300));
    if (t && !t.startsWith('Loading') && t.includes('Overview')) break;
  }

  // === Add document or link… ===
  try {
    await page.click('text=/Add document or link/');
    await page.waitForTimeout(1200);
    dump('resourcesMenu', await popContent());
    await shot('linear-resources-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    dump('resourcesMenuErr', e.message.slice(0, 300));
  }

  // === "Write first project update" composer ===
  try {
    const w = page
      .locator('text=/Write first project update|Write an update|project update/i')
      .first();
    await w.click();
    await page.waitForTimeout(1200);
    dump('updateComposer', await popContent());
    // also dump composer area dom
    const comp = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[contenteditable], textarea, [role="textbox"]')];
      return els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          tag: e.tagName,
          ce: e.getAttribute('contenteditable'),
          ph: e.getAttribute('placeholder') || e.getAttribute('aria-label'),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
    });
    dump('composerFields', comp);
    await shot('linear-update-composer');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    dump('updateComposerErr', e.message.slice(0, 300));
  }

  // === Milestones empty state "Add milestones" / Learn more ===
  const ms = await page.evaluate(() => {
    const els = [...document.querySelectorAll('a,button')];
    return els
      .map((e) => {
        const r = e.getBoundingClientRect();
        const t = (e.getAttribute('aria-label') || e.textContent || '').trim();
        return {
          tag: e.tagName,
          aria: e.getAttribute('aria-label'),
          text: t.slice(0, 60),
          href: e.getAttribute('href'),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((e) => e.y > 430 && e.y < 560 && e.x > 780);
  });
  dump('milestonesEmptyArea', ms);

  // === Progress section DOM ===
  const prog = await page.evaluate(() => {
    const hdr = [...document.querySelectorAll('span,div,h3')].find(
      (e) =>
        e.children.length === 0 &&
        e.textContent.trim() === 'Progress' &&
        e.getBoundingClientRect().x > 700,
    );
    if (!hdr) return null;
    let card = hdr;
    for (let i = 0; i < 8 && card.parentElement; i++) card = card.parentElement;
    const r = card.getBoundingClientRect();
    const kids = [...card.querySelectorAll('*')]
      .filter((e) => e.children.length === 0 && e.textContent.trim())
      .map((e) => {
        const rr = e.getBoundingClientRect();
        return {
          tag: e.tagName,
          text: e.textContent.trim().slice(0, 60),
          x: Math.round(rr.x),
          y: Math.round(rr.y),
        };
      });
    const links = [...card.querySelectorAll('a,button')].map((e) => ({
      tag: e.tagName,
      aria: e.getAttribute('aria-label'),
      text: e.textContent.trim().slice(0, 40),
      href: e.getAttribute('href'),
    }));
    const svg = card.querySelectorAll('svg').length;
    return {
      box: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      texts: kids.slice(0, 60),
      links,
      svgCount: svg,
    };
  });
  dump('progressCard', prog);

  // === Activity card (See all link target) ===
  const act = await page.evaluate(() => {
    const hdr = [...document.querySelectorAll('span,div,h3')].find(
      (e) =>
        e.children.length === 0 &&
        e.textContent.trim() === 'Activity' &&
        e.getBoundingClientRect().x > 700,
    );
    if (!hdr) return null;
    let card = hdr;
    for (let i = 0; i < 8 && card.parentElement; i++) card = card.parentElement;
    const links = [...card.querySelectorAll('a,button')].map((e) => ({
      tag: e.tagName,
      aria: e.getAttribute('aria-label'),
      text: e.textContent.trim().slice(0, 40),
      href: e.getAttribute('href'),
    }));
    return { links, text: card.innerText.slice(0, 600) };
  });
  dump('activityCard', act);

  // === Description: click to inspect editor affordances (do NOT type) ===
  const desc = await page.evaluate(() => {
    const hdr = [...document.querySelectorAll('*')].find(
      (e) =>
        e.children.length === 0 &&
        e.textContent.trim() === 'Description' &&
        e.getBoundingClientRect().x < 700 &&
        e.getBoundingClientRect().y > 400,
    );
    if (!hdr) return null;
    const r = hdr.getBoundingClientRect();
    const parent = hdr.parentElement;
    const chev = parent?.querySelector('svg,button,[role="button"]');
    const editable = document.querySelector('[contenteditable="true"]');
    const er = editable?.getBoundingClientRect();
    return {
      label: { x: Math.round(r.x), y: Math.round(r.y) },
      chev: !!chev,
      editableBox: er
        ? {
            x: Math.round(er.x),
            y: Math.round(er.y),
            w: Math.round(er.width),
            h: Math.round(er.height),
          }
        : null,
    };
  });
  dump('description', desc);
  fs.writeFileSync(`${DIR}/linear-deep2.json`, JSON.stringify(result, null, 1));
} catch (e) {
  dump('fatal', e.message.slice(0, 800));
}
