#!/usr/bin/env node
// Linear token gate: PRs touching Linear-parity work surfaces must not add
// literal font/icon sizes outside the Linear scale (body ≤14, titles ≤22,
// inline icons ≤20). Escape hatch: append `// linear-token-override` on the
// offending line with a reason, or `linear-tokens: manual-review` in the PR
// body for surfaces that legitimately deviate (auth flows, welcome screens).
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
// Titles may legitimately reach card-title scale (22px); body text must stay
// at body-sm (14px) or below. Icons in rows are 14–16px; empty-state glyphs
// may reach 20px.
const RULES = [
  { name: 'fontSize', pattern: /fontSize(?:=|:)\s*(?:\{\s*)?['"]?(\d{2,3})/g, max: 22 },
  { name: 'iconSize', pattern: /\bsize=\{(\d{2,3})\}/g, max: 28 },
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
      const value = Number.parseInt(match[1], 10);
      if (value > rule.max) {
        findings.push(
          `${currentFile}:${lineNumber} ${rule.name}=${value} exceeds Linear token max ${rule.max}`,
        );
      }
    }
  }
}

if (findings.length) {
  console.error('Linear token gate failed — oversized literals added on a parity surface:');
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(
    '\nFix: use the Linear scale (body ≤14, title ≤22, row icon ≤20), or annotate the line with `// linear-token-override` and why.',
  );
  process.exit(1);
}
console.log('linear-tokens gate: pass.');
