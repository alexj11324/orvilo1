#!/usr/bin/env node
// Tests for require-linear-tokens.mjs — run with `node --test`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('./require-linear-tokens.mjs', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'lin-tokens-'));

const run = (diff, body = '') => {
  const diffFile = join(tmp, `d${Math.random()}.patch`);
  const bodyFile = join(tmp, `b${Math.random()}.txt`);
  writeFileSync(diffFile, diff);
  writeFileSync(bodyFile, body);
  try {
    execFileSync('node', [SCRIPT, diffFile, bodyFile], { stdio: 'pipe' });
    return { ok: true };
  } catch (error) {
    return { ok: false, stderr: String(error.stderr) };
  }
};

const header = (file) =>
  `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,1 +1,1 @@\n`;

test('passes on changes outside gated surfaces', () => {
  const diff = `${header('src/features/Auth/Login.tsx')}+  <Text fontSize={24}>x</Text>\n`;
  const r = run(diff);
  if (!r.ok) throw new Error(r.stderr);
});

test('passes on in-scale sizes on gated surfaces', () => {
  const diff = `${header('src/features/Projects/List/index.tsx')}+  <Text fontSize={14}>x</Text>\n+  <Icon size={16} />\n`;
  const r = run(diff);
  if (!r.ok) throw new Error(r.stderr);
});

test('fails on oversized fontSize on a gated surface', () => {
  const diff = `${header('src/features/Projects/List/index.tsx')}+  <Text fontSize={30}>x</Text>\n`;
  const r = run(diff);
  if (r.ok) throw new Error('expected failure');
  if (!/fontSize=30/.test(r.stderr)) throw new Error(`missing finding: ${r.stderr}`);
});

test('fails on oversized icon size on a gated surface', () => {
  const diff = `${header('src/features/MyWork/index.tsx')}+  <Icon size={48} />\n`;
  const r = run(diff);
  if (r.ok) throw new Error('expected failure');
});

test('inline override comment silences a finding', () => {
  const diff = `${header('src/features/Projects/List/index.tsx')}+  <Text fontSize={30}>x</Text> // linear-token-override: empty state\n`;
  const r = run(diff);
  if (!r.ok) throw new Error(r.stderr);
});

test('PR body manual-review marker passes', () => {
  const diff = `${header('src/features/Projects/List/index.tsx')}+  <Text fontSize={30}>x</Text>\n`;
  const r = run(diff, 'checking tokens\n\nlinear-tokens: manual-review');
  if (!r.ok) throw new Error(r.stderr);
});
