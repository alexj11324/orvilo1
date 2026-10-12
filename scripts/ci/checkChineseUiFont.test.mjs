import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const guard = path.resolve(import.meta.dirname, 'checkChineseUiFont.mjs');

function checkFixture(source, fileName = 'ProjectPage.tsx') {
  const dir = mkdtempSync(path.join(tmpdir(), 'orvilo-font-guard-'));
  try {
    writeFileSync(path.join(dir, fileName), source);
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

test('accepts the canonical font generator at the theme-provider token boundary', () => {
  assert.match(
    checkFixture(`
      import { ThemeProvider as RootTheme } from '@lobehub/ui';
      import { genFontFamily as getUiFont } from '@/const/font';
      const app = <RootTheme theme={{ token: {
        fontFamily: getUiFont({ locale: 'zh-CN' }),
      } }} />;
    `),
    /Chinese UI font guard passed/,
  );
});

test('still rejects generated local styles, literal theme fonts and unowned generators', () => {
  assert.match(
    checkFixture(`
      import { ThemeProvider } from '@lobehub/ui';
      import { genFontFamily } from '@/const/font';
      const local = { fontFamily: genFontFamily({ locale: 'zh-CN' }) };
      const app = <ThemeProvider theme={{ token: { fontFamily: 'SimSun' } }} />;
    `),
    /local font-family override: genFontFamily/,
  );
  assert.match(
    checkFixture(`
      import { ThemeProvider } from '@lobehub/ui';
      import { genFontFamily } from '@/const/font';
      const app = <ThemeProvider theme={{ token: { fontFamily: 'SimSun' } }} />;
    `),
    /local font-family override: SimSun/,
  );
  assert.match(
    checkFixture(`
      import { ThemeProvider } from '@lobehub/ui';
      import { genFontFamily } from './local-font';
      const app = <ThemeProvider theme={{ token: {
        fontFamily: genFontFamily({ locale: 'zh-CN' }),
      } }} />;
    `),
    /local font-family override: genFontFamily/,
  );
});

test('accepts inherited Tailwind arbitrary properties without consuming the class-list tail', () => {
  assert.match(
    checkFixture(`
      const input = 'h-9 [font-family:inherit] [font-weight:inherit] text-inherit focus-visible:outline-2';
      const path = \`truncate [font-family:inherit] [font-size:inherit] text-muted-foreground\`;
    `),
    /Chinese UI font guard passed/,
  );
});

test('accepts only the two verified canonical native font roles', () => {
  assert.match(
    checkFixture(`
      const code = { fontFamily: 'var(--font-mono)' };
      const body = css\`font-family: var(--font-sans);\`;
      const path = '[font-family:var(--font-mono)] text-xs';
    `),
    /Chinese UI font guard passed/,
  );
  assert.match(
    checkFixture(
      '.code { font-family: var(--font-mono); } .body { font-family: var(--font-sans); }',
      'FontRoles.css',
    ),
    /Chinese UI font guard passed/,
  );
});

test('still rejects local Tailwind families, font shorthand and later overrides', () => {
  const result = checkFixture(`
    const first = '[font-family:inherit] text-sm [font-family:SimSun] text-foreground';
    const inter = '[font-family:Inter_Variable] focus-visible:outline-2';
    const shorthand = '[font:400_16px/1.5_SimSun] text-sm';
  `);
  assert.match(result, /local font-family override: SimSun/);
  assert.match(result, /Inter_Variable/);
  assert.match(result, /400_16px\/1.5_SimSun/);
});

test('rejects unknown and legacy font tokens and fallback stacks', () => {
  const result = checkFixture(`
    const arbitrary = { fontFamily: 'var(--custom-font)' };
    const legacy = { fontFamily: 'var(--ant-font-family-code)' };
    const fallback = css\`font-family: var(--font-sans, SimSun);\`;
  `);
  assert.match(result, /var\(--custom-font\)/);
  assert.match(result, /var\(--ant-font-family-code\)/);
  assert.match(result, /var\(--font-sans, SimSun\)/);
});

test('rejects local canonical-role redefinition in CSS, arbitrary properties and style objects', () => {
  const result = checkFixture(`
    const cssOverride = css\`--font-sans: SimSun; font-family: var(--font-sans);\`;
    const classOverride = '[--font-mono:Inter_Variable] [font-family:var(--font-mono)]';
    const inlineOverride = { '--font-sans': 'SimSun', fontFamily: 'var(--font-sans)' };
    element.style.setProperty('--font-mono', 'Inter Variable');
  `);
  assert.match(result, /local native font role override: SimSun/);
  assert.match(result, /local native font role override: Inter_Variable/);
  assert.match(result, /local native font role override: 'SimSun'/);
  assert.match(result, /local native font role override: 'Inter Variable'/);
});
