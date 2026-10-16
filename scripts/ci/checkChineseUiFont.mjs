#!/usr/bin/env node
// Keep the original simplified-Chinese UI stack and reject local UI font overrides.
// This is a source guard; browser font availability and glyph fallback need runtime checks.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { genFontFamily, genFontFamilyCode } from '../../src/const/font.ts';

const root = path.resolve(import.meta.dirname, '../..');
const fontSource = readFileSync(path.join(root, 'src/const/font.ts'), 'utf8');
const source = ts.createSourceFile('font.ts', fontSource, ts.ScriptTarget.Latest, true);
const originalScStack = [
  'HarmonyOS Sans SC',
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei UI',
  'Microsoft YaHei',
  'Source Han Sans SC',
  'Noto Sans CJK SC',
];

const scDeclaration = source.statements.find(
  (statement) =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(
      (declaration) => declaration.name.getText(source) === 'FONT_SC',
    ),
);
const scValues = scDeclaration?.declarationList.declarations
  .find((declaration) => declaration.name.getText(source) === 'FONT_SC')
  ?.initializer?.elements?.map((element) => (ts.isStringLiteral(element) ? element.text : null));
const findings = [];
if (JSON.stringify(scValues) !== JSON.stringify(originalScStack)) {
  findings.push(
    'src/const/font.ts: FONT_SC must match the original simplified-Chinese fallback order',
  );
}

const originalDefault = [
  'Geist',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI Variable Display',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  ...originalScStack,
  'ui-sans-serif',
  'system-ui',
  'sans-serif',
  'Apple Color Emoji',
  'Segoe UI Emoji',
  'Segoe UI Symbol',
  'Noto Color Emoji',
];
const stripQuotes = (value) => value.trim().replaceAll(/^["']|["']$/g, '');
const family = genFontFamily({ locale: 'zh-CN' }).split(',').map(stripQuotes);
if (JSON.stringify(family) !== JSON.stringify(originalDefault)) {
  findings.push('genFontFamily(zh-CN): default UI family must match the initial commit');
}
const originalCodeDefault = [
  'Geist Mono',
  'ui-monospace',
  'SFMono-Regular',
  'SF Mono',
  'Menlo',
  'Cascadia Code',
  'Consolas',
  'Liberation Mono',
  ...originalScStack,
  'monospace',
  'Apple Color Emoji',
  'Segoe UI Emoji',
  'Segoe UI Symbol',
  'Noto Color Emoji',
];
if (
  JSON.stringify(genFontFamilyCode({ locale: 'zh-CN' }).split(',').map(stripQuotes)) !==
  JSON.stringify(originalCodeDefault)
) {
  findings.push(
    'genFontFamilyCode(zh-CN): code family must retain the canonical Chinese fallback stack',
  );
}
if (
  stripQuotes(genFontFamily({ locale: 'zh-CN', userFontFamily: 'User Choice' }).split(',')[0]) !==
  'User Choice'
) {
  findings.push('genFontFamily(zh-CN): explicit user font preference must stay first');
}
if (
  stripQuotes(genFontFamilyCode({ locale: 'zh-CN', userFontFamily: 'User Code' }).split(',')[0]) !==
  'User Code'
) {
  findings.push('genFontFamilyCode(zh-CN): explicit user code font preference must stay first');
}

const importedNames = (parsed, module, exported) =>
  new Set(
    parsed.statements.flatMap((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== module ||
        !statement.importClause
      )
        return [];
      if (exported === 'default')
        return statement.importClause.name ? [statement.importClause.name.text] : [];
      const bindings = statement.importClause.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) return [];
      return bindings.elements
        .filter((binding) => (binding.propertyName ?? binding.name).text === exported)
        .map((binding) => binding.name.text);
    }),
  );

// These two native roles are resolved by the real document publisher. Never
// treat an arbitrary custom property, local generator or font stack as a role.
const THEME_ROLES_MODULE = '@/styles/themeRoles';
const NATIVE_ROLE_PROPS = { '--font-mono': 'fontFamilyCode', '--font-sans': 'fontFamily' };

// `const x = gen(...)` or `const x = useMemo(() => gen(...), deps)`, where gen is imported.
const generatorCall = (declaration, generators, memoizers) => {
  if (!declaration.initializer || !(declaration.parent.flags & ts.NodeFlags.Const)) return;
  let call = declaration.initializer;
  if (
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    memoizers.has(call.expression.text)
  ) {
    const callback = call.arguments[0];
    call = callback && ts.isArrowFunction(callback) ? callback.body : undefined;
  }
  return call &&
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    generators.has(call.expression.text)
    ? call
    : undefined;
};

function verifyNativeFontProducer() {
  const roles = ts.createSourceFile(
    'themeRoles.ts',
    readFileSync(path.join(root, 'src/styles/themeRoles.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const producer = roles.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find(
      (declaration) => declaration.name.getText(roles) === 'createThemeRoleStyles',
    )?.initializer;
  const input = producer && ts.isArrowFunction(producer) ? producer.parameters[0]?.name : undefined;
  if (!input || !ts.isObjectBindingPattern(input) || !ts.isBlock(producer.body)) return false;
  const bound = new Set(
    input.elements
      .filter((element) => !element.propertyName && ts.isIdentifier(element.name))
      .map((element) => element.name.text),
  );
  if (!Object.values(NATIVE_ROLE_PROPS).every((name) => bound.has(name))) return false;

  // Each role is declared exactly once in the whole module, as `--font-x: ${prop};`.
  if ([...roles.text.matchAll(/--font-(?:sans|mono)\s*:/g)].length !== 2) return false;
  const mappings = new Map();
  let malformed = false;
  const collect = (node) => {
    if (ts.isTemplateExpression(node)) {
      let literal = node.head.text;
      for (const span of node.templateSpans) {
        const key = literal.match(/(--font-(?:sans|mono)):\s*$/)?.[1];
        if (key) {
          if (mappings.has(key) || !span.literal.text.startsWith(';')) malformed = true;
          mappings.set(key, span.expression.getText(roles));
        }
        literal = span.literal.text;
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(producer.body);
  if (
    malformed ||
    Object.entries(NATIVE_ROLE_PROPS).some(([role, prop]) => mappings.get(role) !== prop)
  )
    return false;

  const app = ts.createSourceFile(
    'AppTheme.tsx',
    readFileSync(path.join(root, 'src/layout/GlobalProvider/AppTheme.tsx'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const publishers = importedNames(app, THEME_ROLES_MODULE, 'ThemeRoles');
  const memoizers = importedNames(app, 'react', 'useMemo');
  const generators = new Map([
    ['fontFamily', importedNames(app, '@/const/font', 'genFontFamily')],
    ['fontFamilyCode', importedNames(app, '@/const/font', 'genFontFamilyCode')],
  ]);
  const expectedParams = {
    fontFamily: {
      customFontFamily: 'customFontFamily',
      locale: 'resolveUILocale(language).normalizedLocale',
      userFontFamily: 'userFontFamily',
    },
    fontFamilyCode: {
      locale: 'resolveUILocale(language).normalizedLocale',
      userFontFamily: 'userFontFamilyCode',
    },
  };
  const verifiedValues = new Set();
  let boundary = false;
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && generators.has(node.name.getText(app))) {
      const name = node.name.getText(app);
      const call = generatorCall(node, generators.get(name), memoizers);
      const params = call?.arguments[0];
      const expected = expectedParams[name];
      if (
        params &&
        ts.isObjectLiteralExpression(params) &&
        params.properties.length === Object.keys(expected).length &&
        Object.entries(expected).every(([key, value]) =>
          params.properties.some(
            (property) =>
              (ts.isShorthandPropertyAssignment(property) &&
                property.name.text === key &&
                key === value) ||
              (ts.isPropertyAssignment(property) &&
                property.name.getText(app) === key &&
                property.initializer.getText(app) === value),
          ),
        )
      )
        verifiedValues.add(name);
    }
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      publishers.has(node.tagName.text)
    ) {
      boundary = [...generators.keys()].every((name) =>
        node.attributes.properties.some(
          (property) =>
            ts.isJsxAttribute(property) &&
            property.name.text === name &&
            property.initializer &&
            ts.isJsxExpression(property.initializer) &&
            property.initializer.expression?.getText(app) === name,
        ),
      );
    }
    ts.forEachChild(node, walk);
  };
  walk(app);
  return boundary && verifiedValues.size === 2;
}
const nativeFontProducerVerified = verifyNativeFontProducer();
if (!nativeFontProducerVerified)
  findings.push(
    'Native font roles must retain the canonical generator -> AppTheme token -> ThemeRoles publisher chain',
  );

// Narrow exceptions for content rendering and UI outside ThemeProvider.
const allowedByFile = new Map([
  ['src/components/Loading/BrandTextLoading/index.module.css', [/^ui-monospace,.*monospace$/s]], // debug output
  ['src/features/Conversation/Messages/User/components/PageSelections.tsx', [/^Georgia, serif$/]], // quote mark
  ['src/features/ChatTerminal/xtermManager.ts', [/^fontFamily$/]], // terminal preference
  [
    'src/features/ResourceManager/components/Explorer/ListView/ListItem/TruncatedFileName.tsx',
    [/^window\.getComputedStyle\(container\)\.font$/],
  ], // canvas text measurement
  [
    'src/features/Portal/LocalFile/xlsx/SheetGrid.tsx',
    [/^`"\$\{style\.ff\}", var\(--font-family, sans-serif\)`$/],
  ], // spreadsheet cell
  [
    'src/features/Settings/appearance/features/Font/FallbackFontList.tsx',
    [/^(?:item\.id|fallbackFont)$/],
  ], // font preview
  ['src/features/Settings/appearance/features/Font/index.tsx', [/^joinFontStack\(stack\)$/]], // saved preference
  ['src/spa/router/authRouter.config.tsx', [/^sans-serif$/]], // fallback before theme mounts
]);
const sourceDirs =
  process.argv[2] === '--scan-dir'
    ? [path.resolve(process.argv[3])]
    : ['src/components', 'src/features', 'src/layout', 'src/routes', 'src/spa'].map((dir) =>
        path.join(root, dir),
      );
const extensions = /\.(?:ts|tsx|css|scss|less)$/;
const allowed =
  /^(?:inherit|cssVar\.fontFamily(?:Code)?|theme\.fontFamily(?:Code)?|var\(--(?:lobe|orvilo)-font-family(?:-code)?\))$/;
const intentionalMonospaceFiles = new Set([
  'src/components/FileParsingStatus/EmbeddingStatus.tsx',
  'src/components/FileParsingStatus/index.tsx',
  'src/features/Conversation/ChatList/components/AutoScroll/DebugInspector.tsx',
  'src/routes/(main)/agent/channel/detail/Footer.tsx',
  'src/features/Settings/creds/features/style.ts',
  'src/features/PluginDevModal/PluginPreview/ApiVisualizer.tsx',
  'src/features/Settings/system-tools/features/CliTestSection.tsx',
  'src/features/Auth/OAuthCallback/Error.tsx',
  'src/features/Auth/OAuthDevice/DeviceCodeInput.tsx',
  'src/features/Auth/OAuthDevice/DeviceCodeConfirm.tsx',
  'src/features/MCP/MCPInstallProgress/InstallError/ErrorDetails.tsx',
]);

function checkValue(file, position, raw) {
  const value = stripQuotes(
    raw
      .trim()
      .replace(/^\$\{([\s\S]*)\}$/, '$1')
      .trim(),
  );
  if (
    allowed.test(value) ||
    (nativeFontProducerVerified && /^(?:var\(--font-sans\)|var\(--font-mono\))$/.test(value)) ||
    ((value === 'monospace' || value === 'ui-monospace') && intentionalMonospaceFiles.has(file)) ||
    allowedByFile.get(file)?.some((pattern) => pattern.test(value))
  )
    return;
  findings.push(`${file}:${position} local font-family override: ${value}`);
}

function visitFile(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visitFile(absolute);
      continue;
    }
    if (!extensions.test(entry.name) || /\.(?:test|spec)\.[jt]sx?$/.test(entry.name)) continue;
    const file = path.relative(root, absolute).replaceAll('\\', '/');
    const text = readFileSync(absolute, 'utf8');
    const lineAt = (offset) => text.slice(0, offset).split('\n').length;

    // Scan CSS text, rather than TypeScript source, so `font: string` type
    // annotations cannot masquerade as CSS shorthand declarations.
    const scanCss = (css, sourceOffset) => {
      for (const match of css.matchAll(/(?:\b(?:font-family|font)|--font-(?:sans|mono))\s*:/gi)) {
        const start = match.index + match[0].length;
        // Tailwind arbitrary properties end at their matching square bracket,
        // not at the end of the complete class list. Keep scanning later ones.
        const arbitrary = css[match.index - 1] === '[';
        let end = start;
        let interpolationDepth = 0;
        let bracketDepth = arbitrary ? 1 : 0;
        let quote;
        while (end < css.length) {
          const char = css[end];
          if (char === '\\') {
            end += 2;
            continue;
          }
          if (quote) {
            if (char === quote) quote = undefined;
            end += 1;
            continue;
          }
          if (char === '"' || char === "'") {
            quote = char;
            end += 1;
            continue;
          }
          if (char === '$' && css[end + 1] === '{') {
            interpolationDepth += 1;
            end += 2;
            continue;
          }
          if (char === '}' && interpolationDepth > 0) {
            interpolationDepth -= 1;
          } else if (interpolationDepth === 0 && arbitrary && char === '[') {
            bracketDepth += 1;
          } else if (interpolationDepth === 0 && arbitrary && char === ']') {
            bracketDepth -= 1;
            if (bracketDepth === 0) break;
          } else if (interpolationDepth === 0 && !arbitrary && (char === ';' || char === '}')) {
            break;
          }
          end += 1;
        }
        if (match[0].startsWith('--font-')) {
          findings.push(
            `${file}:${lineAt(sourceOffset + match.index)} local native font role override: ${css.slice(start, end).trim()}`,
          );
        } else {
          checkValue(file, lineAt(sourceOffset + match.index), css.slice(start, end));
        }
      }
    };
    if (!/\.[jt]sx?$/.test(entry.name)) {
      scanCss(text, 0);
      continue;
    }
    const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const publishers = importedNames(parsed, THEME_ROLES_MODULE, 'ThemeRoles');
    const fontGenerators = importedNames(parsed, '@/const/font', 'genFontFamily');
    const memoizers = importedNames(parsed, 'react', 'useMemo');
    const generatedFonts = new Set();
    const collectGenerated = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        generatorCall(node, fontGenerators, memoizers)
      )
        generatedFonts.add(node.name.text);
      ts.forEachChild(node, collectGenerated);
    };
    collectGenerated(parsed);
    // `<ThemeRoles fontFamily={x}>` where x comes from the canonical generator.
    const isPublishedFont = (attribute) => {
      const element = attribute.parent.parent;
      const value = attribute.initializer;
      return (
        attribute.name.text === 'fontFamily' &&
        (ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)) &&
        ts.isIdentifier(element.tagName) &&
        publishers.has(element.tagName.text) &&
        !!value &&
        ts.isJsxExpression(value) &&
        !!value.expression &&
        ts.isIdentifier(value.expression) &&
        generatedFonts.has(value.expression.text)
      );
    };
    const walk = (node) => {
      if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        scanCss(node.getText(parsed).slice(1, -1), node.getStart(parsed) + 1);
      } else if (
        ts.isStringLiteral(node) &&
        /(?:\b(?:font-family|font)|--font-(?:sans|mono))\s*:/i.test(node.text)
      ) {
        scanCss(node.text, node.getStart(parsed) + 1);
      }
      if (
        ts.isPropertyAssignment(node) &&
        ['fontFamily', 'font'].includes(node.name.getText(parsed).replaceAll(/["']/g, ''))
      ) {
        checkValue(file, lineAt(node.getStart(parsed)), node.initializer.getText(parsed));
      }
      if (
        ts.isPropertyAssignment(node) &&
        ['--font-sans', '--font-mono'].includes(node.name.getText(parsed).replaceAll(/["']/g, ''))
      ) {
        findings.push(
          `${file}:${lineAt(node.getStart(parsed))} local native font role override: ${node.initializer.getText(parsed)}`,
        );
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'setProperty' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        ['--font-sans', '--font-mono'].includes(node.arguments[0].text)
      ) {
        findings.push(
          `${file}:${lineAt(node.getStart(parsed))} local native font role override: ${node.arguments[1]?.getText(parsed)}`,
        );
      }
      if (
        ts.isJsxAttribute(node) &&
        ['fontFamily', 'font'].includes(node.name.text) &&
        node.initializer &&
        !isPublishedFont(node)
      ) {
        checkValue(file, lineAt(node.getStart(parsed)), node.initializer.getText(parsed));
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        ['fontFamily', 'font'].includes(node.left.name.text)
      ) {
        checkValue(file, lineAt(node.getStart(parsed)), node.right.getText(parsed));
      }
      ts.forEachChild(node, walk);
    };
    walk(parsed);
  }
}

for (const dir of sourceDirs) visitFile(dir);
if (findings.length) {
  console.error(
    'Chinese UI font guard failed:\n' + findings.map((finding) => `  ${finding}`).join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log('Chinese UI font guard passed.');
}
