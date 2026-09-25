#!/usr/bin/env node
// Keep the original simplified-Chinese UI stack and reject local UI font overrides.
// This is a source guard; browser font availability and glyph fallback need runtime checks.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { genFontFamily } from '../../src/const/font.ts';

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
if (
  stripQuotes(genFontFamily({ locale: 'zh-CN', userFontFamily: 'User Choice' }).split(',')[0]) !==
  'User Choice'
) {
  findings.push('genFontFamily(zh-CN): explicit user font preference must stay first');
}

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
  ['src/features/Settings/appearance/features/Font/FallbackFontList.tsx', [/^item\.id$/]], // font preview
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
      for (const match of css.matchAll(/\b(?:font-family|font)\s*:/gi)) {
        const start = match.index + match[0].length;
        let end = start;
        let interpolationDepth = 0;
        while (end < css.length) {
          const char = css[end];
          if (char === '$' && css[end + 1] === '{') {
            interpolationDepth += 1;
            end += 2;
            continue;
          }
          if (char === '}' && interpolationDepth > 0) {
            interpolationDepth -= 1;
          } else if (interpolationDepth === 0 && (char === ';' || char === '}')) {
            break;
          }
          end += 1;
        }
        checkValue(file, lineAt(sourceOffset + match.index), css.slice(start, end));
      }
    };
    if (!/\.[jt]sx?$/.test(entry.name)) {
      scanCss(text, 0);
      continue;
    }
    const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const walk = (node) => {
      if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        scanCss(node.getText(parsed).slice(1, -1), node.getStart(parsed) + 1);
      } else if (ts.isStringLiteral(node) && /\b(?:font-family|font)\s*:/i.test(node.text)) {
        scanCss(node.text, node.getStart(parsed) + 1);
      }
      if (
        ts.isPropertyAssignment(node) &&
        ['fontFamily', 'font'].includes(node.name.getText(parsed).replaceAll(/["']/g, ''))
      ) {
        checkValue(file, lineAt(node.getStart(parsed)), node.initializer.getText(parsed));
      }
      if (
        ts.isJsxAttribute(node) &&
        ['fontFamily', 'font'].includes(node.name.text) &&
        node.initializer
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
