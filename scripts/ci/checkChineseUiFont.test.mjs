import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

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

// Execute the actual guard declarations against real current owner sources.
// Only the file-read boundary is substituted; no AST verification is duplicated.
const producerFiles = [
  'src/styles/resolvedThemeRoles.ts',
  'src/styles/themeRoles.ts',
  'src/layout/GlobalProvider/AppTheme.tsx',
  'src/layout/GlobalProvider/NativeAppTheme.tsx',
  'src/layout/GlobalProvider/NativeThemeProvider.tsx',
  'src/styles/nativeTheme.ts',
  'src/features/AuthShell/AuthThemeLite.tsx',
];
function checkActualNativeProducer(changes = []) {
  const source = readFileSync(guard, 'utf8');
  const owner = ts.createSourceFile(guard, source, ts.ScriptTarget.Latest, true);
  const declarations = ['importedNames', 'verifyNativeFontProducer'].map((name) => {
    const node = owner.statements.find(
      (statement) =>
        (ts.isFunctionDeclaration(statement) && statement.name?.text === name) ||
        (ts.isVariableStatement(statement) &&
          statement.declarationList.declarations.some(
            (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
          )),
    );
    assert(node, `Actual guard function ${name} must exist`);
    return node.getText(owner);
  });
  const root = path.resolve(import.meta.dirname, '../..');
  const files = new Map(
    producerFiles.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]),
  );
  for (const [file, change] of changes) {
    const original = files.get(file);
    assert.equal(typeof original, 'string');
    const next = change(original);
    assert.notEqual(next, original, `Mutation must actually change ${file}`);
    files.set(file, next);
  }
  return JSON.parse(
    runInNewContext(
      declarations.join('\n') +
        `
    const sites = new Map();
    const valid = verifyNativeFontProducer(sites);
    JSON.stringify({ valid, sites: [...sites].map(([file, positions]) => [file, positions.size]) });
  `,
      {
        ts,
        path,
        root,
        readFileSync: (file) => {
          const relative = path.relative(root, file).replaceAll('\\', '/');
          assert(files.has(relative), `Unexpected producer read ${relative}`);
          return files.get(relative);
        },
      },
    ),
  );
}

const app = 'src/layout/GlobalProvider/AppTheme.tsx';
const auth = 'src/features/AuthShell/AuthThemeLite.tsx';
const frame = 'src/layout/GlobalProvider/NativeAppTheme.tsx';
const provider = 'src/layout/GlobalProvider/NativeThemeProvider.tsx';
const resolver = 'src/styles/nativeTheme.ts';
const publisher = 'src/styles/resolvedThemeRoles.ts';
const legacy = 'src/styles/themeRoles.ts';
const replace = (before, after) => (source) => source.replace(before, after);

test('verifies the complete actual generator, native publisher and real compatibility chain', () => {
  assert.deepEqual(checkActualNativeProducer(), {
    valid: true,
    sites: [
      [app, 2],
      [auth, 2],
    ],
  });
});

test('keeps official named aliases and deep-default SDK provider identities', () => {
  const aliasedSDK = (source) =>
    source
      .replaceAll(/\bThemeProvider\b/g, 'RootTheme')
      .replace('{ ConfigProvider, RootTheme }', '{ ConfigProvider, ThemeProvider as RootTheme }');
  assert.equal(checkActualNativeProducer([[app, aliasedSDK]]).valid, true);
  assert.equal(
    checkActualNativeProducer([
      [
        app,
        replace(
          "import { ConfigProvider, ThemeProvider } from '@lobehub/ui';",
          "import { ConfigProvider } from '@lobehub/ui';\nimport ThemeProvider from '@lobehub/ui/es/ThemeProvider/ThemeProvider';",
        ),
      ],
    ]).valid,
    true,
  );
  const aliasedNative = (source) =>
    source
      .replaceAll(/\bNativeAppTheme\b/g, 'DocumentTheme')
      .replace(
        "import { DocumentTheme } from './DocumentTheme'",
        "import { NativeAppTheme as DocumentTheme } from './NativeAppTheme'",
      );
  assert.equal(checkActualNativeProducer([[app, aliasedNative]]).valid, true);
  const aliasedGenerator = (source) =>
    source
      .replace(
        'import { genFontFamily, genFontFamilyCode }',
        'import { genFontFamily as getUiFont, genFontFamilyCode }',
      )
      .replace('genFontFamily({', 'getUiFont({');
  assert.equal(checkActualNativeProducer([[app, aliasedGenerator]]).valid, true);
});

const brokenChains = [
  ['unowned UI generator', app, replace('genFontFamily({', 'localFontFamily({')],
  ['unowned code generator import', app, replace("from '@/const/font'", "from './unowned-font'")],
  [
    'missing canonical memo dependency',
    app,
    replace('[customFontFamily, language, userFontFamily]', '[customFontFamily, userFontFamily]'),
  ],
  ['literal SDK token', app, replace(/(token:\s*\{\s*)fontFamily,/, "$1fontFamily: 'SimSun',")],
  ['literal native prop', app, replace('fontFamily={fontFamily}', 'fontFamily="SimSun"')],
  ['spread native prop override', app, replace('<NativeAppTheme', '<NativeAppTheme {...override}')],
  [
    'duplicate native font prop',
    app,
    replace('fontFamily={fontFamily}', 'fontFamily={fontFamily} fontFamily="SimSun"'),
  ],
  [
    'swapped native code prop',
    app,
    replace('fontFamilyCode={fontFamilyCode}', 'fontFamilyCode={fontFamily}'),
  ],
  [
    'unowned native frame import',
    app,
    replace("from './NativeAppTheme'", "from './unowned-theme'"),
  ],
  [
    'unowned SDK provider import',
    app,
    replace(
      "import { ConfigProvider, ThemeProvider } from '@lobehub/ui'",
      "import { ConfigProvider, ThemeProvider } from './local-ui'",
    ),
  ],
  [
    'spread override in real native frame',
    frame,
    replace(
      '<NativeThemeProvider {...options}>',
      '<NativeThemeProvider {...options} fontFamily="SimSun">',
    ),
  ],
  [
    'disconnected native frame return',
    frame,
    (source) =>
      source
        .replace('<NativeThemeProvider {...options}>', '<div>')
        .replace('</NativeThemeProvider>', '</div>'),
  ],
  [
    'unowned native provider import',
    frame,
    replace("from './NativeThemeProvider'", "from './unowned-provider'"),
  ],
  [
    'unowned resolver import',
    provider,
    replace("from '@/styles/nativeTheme'", "from './unowned-resolver'"),
  ],
  [
    'literal light resolver font',
    provider,
    replace(/(appearance: 'light',[\s\S]*?)fontFamily,/, "$1fontFamily: 'SimSun',"),
  ],
  [
    'missing provider memo dependency',
    provider,
    replace(
      '[primaryColor, neutralColor, fontFamily, fontFamilyCode, animationMode]',
      '[primaryColor, neutralColor, fontFamily, animationMode]',
    ),
  ],
  [
    'wrong current-theme context',
    provider,
    replace("appearance === 'dark' ? dark : light", "appearance === 'dark' ? light : dark"),
  ],
  [
    'wrong SSR dark sheet',
    provider,
    replace(
      'createThemeRoleStyles(light) + createThemeRoleStyles(dark)',
      'createThemeRoleStyles(light) + createThemeRoleStyles(light)',
    ),
  ],
  [
    'unowned publisher import',
    provider,
    replace("from '@/styles/resolvedThemeRoles'", "from './unowned-roles'"),
  ],
  [
    'spread resolver return override',
    resolver,
    replace('    isDarkMode: dark,', '    ...options,\n    isDarkMode: dark,'),
  ],
  [
    'literal resolver return font',
    resolver,
    replace(/(isDarkMode: dark,\s*)fontFamily,/, "$1fontFamily: 'SimSun',"),
  ],
  [
    'swapped resolver code return',
    resolver,
    replace(/(isDarkMode: dark,\s*fontFamily,\s*)fontFamilyCode,/, '$1fontFamilyCode: fontFamily,'),
  ],
  [
    'changed canonical CSS mono field',
    publisher,
    replace('--font-mono: ${theme.fontFamilyCode}', '--font-mono: ${theme.fontFamily}'),
  ],
  [
    'unexported canonical publisher',
    publisher,
    replace('export const createThemeRoleStyles', 'const createThemeRoleStyles'),
  ],
  [
    'disconnected legacy style publication',
    publisher,
    replace('createThemeRoleStyles(theme)', 'unownedStyles(theme)'),
  ],
  [
    'fake compatibility re-export',
    legacy,
    replace("export * from './resolvedThemeRoles'", "export * from './unowned-roles'"),
  ],
  [
    'fake compatibility delegate',
    legacy,
    replace(
      "import { ResolvedThemeRoles } from './resolvedThemeRoles'",
      "import { ResolvedThemeRoles } from './unowned-roles'",
    ),
  ],
  ['changed legacy context', legacy, replace('use(ThemeContext)', 'use(UnownedThemeContext)')],
  ['changed legacy forwarded theme', legacy, replace('{ theme }', '{ theme: {} }')],
];
for (const [name, file, change] of brokenChains) {
  test(`rejects broken producer chain: ${name}`, () => {
    assert.deepEqual(checkActualNativeProducer([[file, change]]), { valid: false, sites: [] });
  });
}

test('never grants a JSX font prop exemption outside the verified returned owner', () => {
  const result = checkFixture(`
    import { NativeAppTheme } from '@/layout/GlobalProvider/NativeAppTheme';
    const fontFamily = 'SimSun';
    const local = <NativeAppTheme fontFamily={fontFamily} fontFamilyCode="Inter" />;
  `);
  assert.match(result, /local font-family override: \{fontFamily\}/);
});

test('auth accepts actual canonical generator and native-provider aliases', () => {
  const alias = (source) =>
    source
      .replace(
        'import { genFontFamily, genFontFamilyCode }',
        'import { genFontFamily as getUiFont, genFontFamilyCode }',
      )
      .replace('genFontFamily({', 'getUiFont({')
      .replace(
        'import { NativeThemeProvider }',
        'import { NativeThemeProvider as AuthNativeTheme }',
      )
      .replace('<NativeThemeProvider', '<AuthNativeTheme')
      .replace('</NativeThemeProvider>', '</AuthNativeTheme>');
  assert.equal(checkActualNativeProducer([[auth, alias]]).valid, true);
});

for (const [name, change] of [
  ['unowned generator', replace("from '@/const/font'", "from './local-font'")],
  ['unowned language source', replace("from 'react-i18next'", "from './local-i18n'")],
  ['fixed language overriding real locale', replace('locale: i18n.language', "locale: 'en-US'")],
  ['literal native font', replace('fontFamily={fontFamily}', 'fontFamily="SimSun"')],
  [
    'swapped native code font',
    replace('fontFamilyCode={fontFamilyCode}', 'fontFamilyCode={fontFamily}'),
  ],
  [
    'spread native font override',
    replace('<NativeThemeProvider', '<NativeThemeProvider {...override}'),
  ],
  [
    'duplicate native font',
    replace('fontFamily={fontFamily}', 'fontFamily={fontFamily} fontFamily="SimSun"'),
  ],
  ['literal SDK token', replace(/(token:\s*\{\s*)fontFamily,/, "$1fontFamily: 'SimSun',")],
  [
    'unowned native import',
    replace("from '@/layout/GlobalProvider/NativeThemeProvider'", "from './local-theme'"),
  ],
  ['unowned SDK import', replace("from '@lobehub/ui'", "from './local-ui'")],
  [
    'disconnected returned tree',
    (source) =>
      source.replace('<NativeThemeProvider', '<div').replace('</NativeThemeProvider>', '</div>'),
  ],
]) {
  test(`auth rejects broken canonical chain: ${name}`, () => {
    assert.deepEqual(checkActualNativeProducer([[auth, change]]), { valid: false, sites: [] });
  });
}

for (const [name, wrap] of [
  ['false short-circuit', (sheet) => `{false && ${sheet}}`],
  ['dynamic conditional', (sheet) => `{appearance === 'light' ? ${sheet} : null}`],
  ['uninvoked callback', (sheet) => `{() => ${sheet}}`],
]) {
  test(`rejects native CSS that is only a descendant AST match: ${name}`, () => {
    const hideSheet = (source) =>
      source.replace(/<style data-orvilo-native-theme="">[\s\S]*?<\/style>/, wrap);
    assert.deepEqual(checkActualNativeProducer([[provider, hideSheet]]), {
      valid: false,
      sites: [],
    });
  });
}
