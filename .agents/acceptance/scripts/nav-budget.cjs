#!/usr/bin/env node
/**
 * Would the nav survive Linear's 244px, or does Orvilo's own content need the 280 it has?
 *
 * The nav is shared by the whole product, so narrowing it to match Linear is a shell
 * decision, not a page fix: it can truncate labels on surfaces Linear has no counterpart
 * for. This script reads that question off a saved snapshot, offline, so it contends for
 * no CDP instance.
 *
 * WHAT THIS CANNOT ANSWER — and the reason the first version of this file was wrong:
 * a nav row is a *stretched* container (`width` fills the panel) carrying
 * `text-overflow: ellipsis`. Its `box.w` is a CONSEQUENCE of the panel being 280 wide, not
 * a requirement. Reading "widest element = 228, so 244 truncates" measures the same thing
 * twice and calls the difference a deficit — the box shrinks with the panel, so the check
 * can never fail. Those rows therefore get NO verdict here; only elements whose width is
 * independent of the panel (icons, short labels that do not stretch) can be judged.
 *
 * It also cannot see the future: a row that fits today at this workspace's data may not fit
 * under a longer name. The number below is a floor, never a proof.
 *
 * Usage: node nav-budget.cjs <candidate.json> [navWidth=280] [targetWidth=244]
 */
const fs = require('node:fs');

const [, , path, navArg = '280', targetArg = '244'] = process.argv;
if (!path) {
  process.stderr.write('usage: nav-budget.cjs <candidate.json> [navWidth] [targetWidth]\n');
  process.exit(2);
}
const NAV = Number(navArg);
const TARGET = Number(targetArg);

const snap = JSON.parse(fs.readFileSync(path, 'utf8'));
const els = snap.elements;

const inNav = els.filter(
  (e) => e.visible && e.box.x >= 0 && e.box.x + e.box.w <= NAV + 1 && (e.ownText || '').trim(),
);
if (!inNav.length) {
  process.stderr.write('no text-bearing visible element inside the nav — wrong snapshot?\n');
  process.exit(1);
}

// A row is "stretched" when several siblings share the same right edge: they are filling
// the panel, so their width tracks the panel and says nothing about the content.
const rightEdgeCounts = new Map();
for (const e of inNav) {
  const r = e.box.x + e.box.w;
  rightEdgeCounts.set(r, (rightEdgeCounts.get(r) || 0) + 1);
}
const STRETCH_MIN = 3;
const stretched = (e) => (rightEdgeCounts.get(e.box.x + e.box.w) || 0) >= STRETCH_MIN;

const rows = inNav.map((e) => ({
  el: e,
  text: (e.ownText || '').trim(),
  right: e.box.x + e.box.w,
  stretched: stretched(e),
  ellipsis: e.style.textOverflow === 'ellipsis',
}));

const free = rows.filter((r) => !r.stretched);
const fixed = rows.filter((r) => r.stretched);

console.log(`snapshot    ${snap.meta.url}`);
console.log(`nav width   ${NAV} measured, target ${TARGET}`);
console.log(
  `rows        ${rows.length} text-bearing (${fixed.length} stretched, ${free.length} width-independent)`,
);

if (fixed.length) {
  const w = Math.max(...fixed.map((r) => r.el.box.w));
  console.log(
    `\nSTRETCHED (no verdict): ${fixed.length} rows share a right edge and carry ` +
      `text-overflow=${fixed[0].ellipsis ? 'ellipsis' : '(none)'} at w=${w}.`,
  );
  console.log('  Their width shrinks with the panel, so they cannot show a deficit.');
  console.log('  What they DO show: the panel is already ellipsizing, so narrowing trades');
  console.log('  budget for a longer name — it does not introduce the mechanism.');
  console.log(`  Rows: ${[...new Set(fixed.map((r) => r.text.slice(0, 22)))].join(' | ')}`);
}

if (free.length) {
  console.log('\nWIDTH-INDEPENDENT (can be judged):');
  for (const r of free.sort((a, b) => b.right - a.right)) {
    const verdict = r.right <= TARGET ? 'fits' : 'EXCEEDS';
    console.log(
      `  right=${String(r.right).padStart(4)} w=${String(r.el.box.w).padStart(4)} ${verdict.padEnd(8)} ` +
        `${r.el.tag.padEnd(5)} "${r.text.slice(0, 40)}"`,
    );
  }
  const worst = Math.max(...free.map((r) => r.right));
  console.log(
    `\n  widest width-independent right edge = ${worst}; target ${TARGET} -> ${worst <= TARGET ? 'FITS' : 'EXCEEDS'}`,
  );
}

console.log('\nNOT ANSWERABLE from a snapshot: whether a stretched row truncates at 244.');
console.log("That needs the text's natural advance width (canvas measureText with the row's");
console.log(
  'computed font), which the snapshot does not record. Absent that, do not claim it fits.',
);
