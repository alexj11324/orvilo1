#!/usr/bin/env node
// parity-diff.cjs — diff two cdp-dom-probe.cjs captures and report the Linear-parity
// gap in the shape the issue contract asks for (left join):
//
//   * reference-only  → we are MISSING something Linear has
//   * candidate-only  → we have EXTRA something Linear does not have
//   * style deltas    → typography/color histogram differences
//
// It deliberately reports observations, never verdicts: a row in this output is a
// question to resolve against the page, not a proven defect. Screenshots, behavior
// probes and pixel comparison remain separate gates.
//
// ── HOW THIS CONJOINS, AND WHAT THAT COSTS ──────────────────────────────────────
// The left join is keyed on NORMALISED TEXT. `Description` exists on both sides, so
// it matches, so it is not reported — and its colour, size, weight, icon and geometry
// were never part of the key, so they were never compared.
//
// Consequence: this can only find (a) labels present on one side only and (b) coarse
// font-scale deltas. "Both sides have the element; its styling differs" — the defect
// class users actually report — is structurally invisible to it.
//
// When that matters, pair elements explicitly instead: take a cdp-snapshot.cjs dump
// of each side, name the element in each, and compare the specific properties. A
// parity claim is only worth as much as its pairing key.
//
// Usage:
//   node parity-diff.cjs --reference linear.json --candidate orvilo.json [--out diff.json]

const fs = require('node:fs');

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : process.argv[i + 1];
};

const REF = arg('--reference');
const CAND = arg('--candidate');
const OUT = arg('--out', '/tmp/parity-diff.json');

if (!REF || !CAND) {
  console.error(
    'usage: parity-diff.cjs --reference <probe.json> --candidate <probe.json> [--out diff.json]',
  );
  process.exit(2);
}

const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
const cand = JSON.parse(fs.readFileSync(CAND, 'utf8'));

// Normalise a visible text label for set comparison: collapse whitespace, trim,
// drop trailing ellipsis so "Add label" and "Add label…" do not read as different.
const normLabel = (s) =>
  String(s || '')
    .replaceAll(/\s+/g, ' ')
    .replace(/[.．…]+$/, '')
    .trim()
    .toLowerCase();

// Labels that belong to the harness rather than the product surface. Counting these
// compares a dev instrument against a shipped UI: the DevDock bar, its perf readout,
// the window URL and bare counters all leak into text extraction.
const NOISE_PATTERNS = [
  /^\d+(\.\d+)?\s*fps$/i,
  /^cls\s/i,
  /^r\d+(\.\d+)?m$/i,
  /^j\d+(\.\d+)?m$/i,
  /^cpu\b/i,
  /^gpu\b/i,
  /^\d+(\.\d+)?%$/,
  /^(agent mock|feature flags|render gallery|tab routers|collapse devdock|more tools)$/i,
  /^\d+\/\d+$/,
  /^(app|chrome-error):\/\//i,
  /^https?:\/\//i,
  /^\/[\w./-]*$/, // bare route fragments echoed into the DOM
];

const isNoise = (label) => NOISE_PATTERNS.some((re) => re.test(label));

const collect = (probe) => {
  const labels = new Map(); // normalised label -> first raw sample
  const roles = new Map(); // role/aria -> count
  const styles = probe.styles || [];
  const histo = new Map(); // "fs|fw" -> count  (color separated: too noisy to join)

  for (const s of styles) {
    const l = normLabel(s.x);
    if (l && !isNoise(l) && !labels.has(l)) labels.set(l, s.x);
    // Style histogram also skips harness chrome: its 11-13px readouts would distort
    // the typographic scale on the candidate side only.
    if (isNoise(l)) continue;
    const k = `${s.fs}|${s.fw}`;
    histo.set(k, (histo.get(k) || 0) + 1);
  }

  const walkRoles = (n) => {
    if (!n) return;
    const key = n.r || (n.a ? `aria:${normLabel(n.a)}` : null);
    if (key) {
      const k = key.toLowerCase();
      roles.set(k, (roles.get(k) || 0) + 1);
    }
    for (const c of n.c || []) walkRoles(c);
  };
  walkRoles(probe.structure);

  return { labels, roles, histo, probe };
};

const R = collect(ref);
const C = collect(cand);

const onlyIn = (a, b) => [...a.keys()].filter((k) => !b.has(k)).sort();

const refOnlyLabels = onlyIn(R.labels, C.labels);
const candOnlyLabels = onlyIn(C.labels, R.labels);
const refOnlyRoles = onlyIn(R.roles, C.roles);
const candOnlyRoles = onlyIn(C.roles, R.roles);

// Style deltas: compare the typographic scale each side actually renders.
const styleKeys = [...new Set([...R.histo.keys(), ...C.histo.keys()])].sort();
const styleDeltas = styleKeys
  .map((k) => ({ scale: k, reference: R.histo.get(k) || 0, candidate: C.histo.get(k) || 0 }))
  .filter((d) => d.reference !== d.candidate);

const report = {
  reference: {
    url: ref.url,
    viewport: ref.viewport,
    nodes: ref.nodeCount,
    visibleTexts: ref.textNodes,
  },
  candidate: {
    url: cand.url,
    viewport: cand.viewport,
    nodes: cand.nodeCount,
    visibleTexts: cand.textNodes,
  },
  viewportMatch: JSON.stringify(ref.viewport) === JSON.stringify(cand.viewport),
  missingInCandidate: refOnlyLabels.map((k) => ({ label: R.labels.get(k), count: 0 })),
  extraInCandidate: candOnlyLabels.map((k) => ({ label: C.labels.get(k), count: 0 })),
  rolesMissingInCandidate: refOnlyRoles,
  rolesExtraInCandidate: candOnlyRoles,
  styleDeltas,
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

const line = (s) => process.stdout.write(s + '\n');
line(`reference  ${report.reference.url}`);
line(`candidate  ${report.candidate.url}`);
line(
  `viewport   ${report.viewportMatch ? 'MATCH' : `DIFFERENT  ref=${ref.viewport} cand=${cand.viewport}`}`,
);
line(
  `texts      ref=${ref.textNodes} cand=${cand.textNodes}   nodes ref=${ref.nodeCount} cand=${cand.nodeCount}`,
);
line('');
line(`MISSING in candidate (Linear has, we do not) : ${refOnlyLabels.length}`);
for (const k of refOnlyLabels.slice(0, 40)) line(`  - ${R.labels.get(k)}`);
line('');
line(`EXTRA in candidate (we have, Linear does not) : ${candOnlyLabels.length}`);
for (const k of candOnlyLabels.slice(0, 40)) line(`  + ${C.labels.get(k)}`);
line('');
line(`style scale deltas : ${styleDeltas.length}`);
for (const d of styleDeltas.slice(0, 30))
  line(`  ~ ${d.scale}  ref=${d.reference} cand=${d.candidate}`);
line('');
line(`written: ${OUT}`);
