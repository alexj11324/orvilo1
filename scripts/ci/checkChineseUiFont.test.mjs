import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const guard = path.resolve(import.meta.dirname, 'checkChineseUiFont.mjs');

function checkFixture(source) {
  const dir = mkdtempSync(path.join(tmpdir(), 'orvilo-font-guard-'));
  try {
    writeFileSync(path.join(dir, 'ProjectPage.tsx'), source);
    try {
      return execFileSync(process.execPath, ['--import', 'tsx', guard, '--scan-dir', dir], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      return error.stderr;
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

test('rejects a local Chinese family and a project-specific Inter family', () => {
  const result = checkFixture(`
    const chinese = { fontFamily: 'Noto Sans SC' };
    const project = css\`font-family: 'Inter Variable';\`;
    style.fontFamily = 'SimSun';
  `);
  assert.match(result, /Noto Sans SC/);
  assert.match(result, /Inter Variable/);
  assert.match(result, /SimSun/);
});

test('keeps theme inheritance and intentional code fonts', () => {
  assert.match(
    checkFixture(`
      const ui = { fontFamily: 'inherit' };
      const code = { fontFamily: cssVar.fontFamilyCode };
      const terminal = css\`font-family: \${cssVar.fontFamilyCode};\`;
    `),
    /Chinese UI font guard passed/,
  );
});

test('rejects semicolon-less CSS family overrides', () => {
  assert.match(checkFixture('const ui = css`font-family: SimSun`'), /SimSun/);
});

test('rejects the CSS font shorthand', () => {
  assert.match(checkFixture('const ui = css`font: 16px SimSun;`'), /16px SimSun/);
});

test('rejects inherited-stack resets and UI monospace', () => {
  assert.match(checkFixture("const ui = { fontFamily: 'initial' };"), /initial/);
  assert.match(checkFixture("const ui = { fontFamily: 'monospace' };"), /monospace/);
});

test('rejects numeric-weight CSS font shorthand', () => {
  assert.match(checkFixture('const ui = css`font: 400 16px/1.5 SimSun;`'), /400 16px\/1.5 SimSun/);
});
