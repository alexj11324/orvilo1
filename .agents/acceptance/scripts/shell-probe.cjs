#!/usr/bin/env node
/**
 * Answer "where does the main column's x come from" from two saved snapshots, offline.
 *
 * The 9px shell offset (ref 304 / cand 313) is the one cross-cutting difference every page
 * inherits, so it has to be decided once rather than six times. Reading it off snapshots
 * instead of the live pages costs nothing and does not contend for a CDP instance.
 *
 * Usage: node shell-probe.cjs <ref.json> <cand.json>
 */
const fs = require('node:fs');

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const probe = (label, path) => {
  const s = load(path);
  const els = s.elements;
  console.log(`\n=== ${label} — ${path}`);
  console.log(`  url=${s.meta.url}`);
  console.log(`  ${els.length} elements, viewport ${s.meta.viewport.w}x${s.meta.viewport.h}`);

  const cols = (title, rows) => {
    console.log(`  -- ${title}`);
    for (const e of rows) {
      console.log(
        `     x=${String(e.box.x).padStart(4)} w=${String(e.box.w).padStart(4)} ` +
          `h=${String(e.box.h).padStart(4)} y=${String(e.box.y).padStart(4)} ` +
          `${e.tag.padEnd(5)} ${(e.cls || e.id || '').slice(0, 50)}`,
      );
    }
  };

  // The shell's structural columns: full-height boxes starting at the top.
  const shell = els
    .filter((e) => e.visible && e.box.y <= 4 && e.box.w > 80 && e.box.h > 400)
    .sort((a, b) => a.box.x - b.box.x);
  cols('structural columns (y<=4, h>400)', shell.slice(0, 8));

  // The first element that could be the main content column.
  const main = els
    .filter((e) => e.visible && e.box.x > 150 && e.box.w > 300 && e.box.h > 200 && e.box.y < 60)
    .sort((a, b) => a.box.x - b.box.x);
  cols('main-column candidates (x>150, w>300, y<60)', main.slice(0, 5));

  // Anything whose left edge is the number we are arguing about.
  for (const target of [304, 313]) {
    const hits = els.filter((e) => e.visible && e.box.x === target && e.box.w > 100);
    if (hits.length) cols(`visible boxes with box.x === ${target} and w>100`, hits.slice(0, 5));
  }
};

const [refPath, candPath] = process.argv.slice(2);
if (!refPath || !candPath) {
  process.stderr.write('usage: shell-probe.cjs <ref.json> <cand.json>\n');
  process.exit(2);
}
probe('REFERENCE', refPath);
probe('CANDIDATE', candPath);
