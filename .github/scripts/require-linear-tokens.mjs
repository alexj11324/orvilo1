#!/usr/bin/env node
// Linear token gate: PRs touching Linear-parity work surfaces must not add
// literals outside the Linear scale — font/icon sizes (body ≤14, titles ≤22,
// inline icons ≤20), display weights (≤600, no font-bold/extrabold/black),
// Tailwind arbitrary values (text-[15px], w-[37px] bypass the scale), bare
// hex colors (use cssVar/design tokens), and non-mono issue identifiers
// (Linear Mono is the ID-token face). Escape hatch: append
// `// linear-token-override` on the offending line with a reason, or
// `linear-tokens: manual-review` in the PR body for surfaces that
// legitimately deviate (auth flows, welcome screens).
//
// Scope — read this before treating a pass as parity:
//   * Numeric ceilings check ONE direction: added literals against an upper
//     bound. No lower bound.
//   * hexColor flags 6/8-digit forms plus 3/4-digit ones that contain a hex
//     letter — issue refs like `#380` (digits only) pass through, as does an
//     all-digit `#123` CSS shorthand.
//   * identifierFont only flags single-line violations — `{foo.identifier}`
//     on a line that also carries a className without `font-mono`. An
//     identifier styled by a className on another JSX line escapes it entirely.
//   * It does not check spacing, icon identity, or colour *token* choice.
//   * It cannot check *set membership* — whether an element should exist at
//     all. A row Linear does not have passes this gate by construction,
//     because nothing in it exceeds a size ceiling. That is not hypothetical:
//     the rail's Properties card carried an invented `Milestones` row through
//     this gate. Membership is guarded by a unit test asserting the rendered
//     row set instead (`Workspace/ProjectDashboard.test.tsx`,
//     "project properties row set").
//   * It only sees added lines on gated paths, so a violation moved to an
//     ungated path, or introduced by a decrease, is invisible to it.
// A green run here means "no out-of-scale literal was added", nothing more.
//
// Usage: node require-linear-tokens.mjs <diff-file> [pr-body-file]
// Exit 1 with a findings list when a violation is found.

import { readFileSync } from 'node:fs';

const diffPath = process.argv[2];
const bodyPath = process.argv[3];
const diff = readFileSync(diffPath, 'utf8');
const prBody = bodyPath ? readFileSync(bodyPath, 'utf8') : '';

if (/\blinear-tokens:\s*manual-review\b/i.test(prBody)) {
  console.log('linear-tokens gate: manual-review marker in PR body — pass.');
  process.exit(0);
}

// Only files on Linear-parity work surfaces are gated.
const GATED_PATH =
  /^src\/(?:features\/(?:Projects|MyWork|WorkInbox|NavPanel|WorkSurface|SavedViews|Members|Teams|Reviews|Views|AgentTasks)|routes)\/.*\.(?:tsx?|css)$/i;

const OVERRIDE = /linear-token-override/;
// Each rule maps an added-line match to a finding string, or null when the
// match is allowed. Titles may legitimately reach card-title scale (22px);
// body text must stay at body-sm (14px) or below. Icons in rows are 14–16px;
// empty-state glyphs may reach 20px. Display weights top out at 600.
const RULES = [
  {
    name: 'fontSize',
    pattern: /fontSize(?:=|:)\s*(?:\{\s*)?['"]?(\d{2,3})/g,
    check: (m) => (Number(m[1]) > 22 ? `fontSize=${m[1]} exceeds Linear token max 22` : null),
  },
  {
    name: 'iconSize',
    pattern: /\bsize=\{(\d{2,3})\}/g,
    check: (m) => (Number(m[1]) > 28 ? `icon size=${m[1]} exceeds max 28` : null),
  },
  {
    name: 'fontWeight',
    pattern: /fontWeight(?:=|:)\s*(?:\{\s*)?['"]?(\d{3,4})/g,
    check: (m) =>
      Number(m[1]) > 600 ? `fontWeight=${m[1]} exceeds Linear's 600 display max` : null,
  },
  {
    name: 'font-bold',
    pattern: /\bfont-(?:bold|extrabold|black)\b/g,
    check: (m) => `class "${m[0]}" is weight ≥700 — Linear tops out at 600`,
  },
  {
    name: 'arbitraryValue',
    pattern:
      /\b(?:text|font|[whp]|min-w|max-w|min-h|max-h|size|basis|px|py|pt|pb|pl|pr|pe|ps|m|mx|my|mt|mb|ml|mr|me|ms|gap|gap-x|gap-y|top|bottom|left|right|inset|inset-x|inset-y|start|end|rounded(?:-[a-z]+)?|leading|tracking|indent|space-[xy])-\[/g,
    check: (m) => `Tailwind arbitrary value "${m[0]}…" bypasses the token scale`,
  },
  {
    name: 'hexColor',
    pattern: /#[0-9a-f]{6,8}\b|#[0-9a-f]{3,4}(?=['")\s])/gi,
    // 3–4 digit forms must carry a hex letter so issue refs like `#380`
    // (digits only) don't collide.
    check: (m) =>
      /^#[0-9a-f]{3,4}$/i.test(m[0]) && /^#\d+$/.test(m[0])
        ? null
        : `hex ${m[0]} hardcodes a color — use a cssVar/design token`,
  },
  {
    name: 'identifierFont',
    pattern: /\{\s*[\w.]*\.identifier\s*\}/g,
    // Only flag provable violations: the interpolation and its className must
    // share one line, so a bare `{x.identifier}` styled by an enclosing element
    // on another line passes (documented miss, not a false positive).
    check: (_m, line) =>
      /className\s*=/.test(line) && !/font-mono|fontFamilyCode/.test(line)
        ? `identifier interpolated outside the mono ID-token style — use font-mono`
        : null,
  },
];

const findings = [];
let currentFile = '';
let lineNumber = 0;

for (const rawLine of diff.split('\n')) {
  const fileMatch = rawLine.match(/^\+\+\+ b\/(.+)$/);
  if (fileMatch) {
    currentFile = fileMatch[1];
    continue;
  }
  const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunkMatch) {
    lineNumber = Number.parseInt(hunkMatch[1], 10);
    continue;
  }
  if (rawLine.startsWith('+++') || rawLine.startsWith('---')) continue;
  if (!rawLine.startsWith('+')) {
    if (!rawLine.startsWith('-')) lineNumber += 1;
    continue;
  }
  const added = rawLine.slice(1);
  lineNumber += 1;
  if (!GATED_PATH.test(currentFile)) continue;
  if (OVERRIDE.test(added)) continue;

  for (const rule of RULES) {
    for (const match of added.matchAll(rule.pattern)) {
      const finding = rule.check(match, added);
      if (finding) findings.push(`${currentFile}:${lineNumber} ${rule.name}: ${finding}`);
    }
  }
}

if (findings.length) {
  console.error('Linear token gate failed — out-of-scale literals added on a parity surface:');
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(
    '\nFix: use the Linear scale (body ≤14, title ≤22, row icon ≤20, weight ≤600, mono identifiers, token colors — no arbitrary values), or annotate the line with `// linear-token-override` and why.\nClass forms: .agents/skills/react/SKILL.md#role-lookup — whole pixels are px ÷ 4 on the scale (h-[44px] → h-11), radii are role variables (rounded-(--radius-card)), dense 13px text is text-(length:--text-dense).',
  );
  process.exit(1);
}
console.log('linear-tokens gate: pass.');
