#!/usr/bin/env node
/**
 * Native-controls gate: product surfaces must be assembled from the repo's
 * design system (ReUI components under `@/components/ui/*` + `@/components/reui/*`
 * and sanctioned feature components), not from raw HTML form controls or
 * one-off control kits.
 *
 * Rules (all scoped to src/features/**, src/routes/** .tsx):
 *   native-control          — literal <select>/<input>/<textarea>/<button> JSX.
 *                             `<input type="hidden">` is plumbing, not a control, and is ignored.
 *   adhoc-button            — raw div/span role=button bypasses shared hover controls.
 *   hover-feedback-override — caller removes hover fill/shadow without measured local coverage.
 *   adhoc-select-style      — `appearance-none` / `form-select` class hacks that
 *                             restyle a raw control into looking like a component.
 *   lobehub-form-control    — form-control imports from `@lobehub/ui/base-ui`
 *                             (Select/Segmented/Input/Button/…) instead of the
 *                             ReUI equivalents.
 *
 * Legitimate owners of raw controls are declared in
 * scripts/ci/nativeControlsAllowlist.json — every entry carries a `reason`
 * (and optionally a `rules` subset) so exemptions stay reviewable rather than
 * becoming a blanket hole.
 *
 * Usage:
 *   node scripts/ci/checkNativeControls.mjs              # scan all product surfaces
 *   node scripts/ci/checkNativeControls.mjs <file...>    # scan specific files
 *   node scripts/ci/checkNativeControls.mjs --scan-dir <dir>  # scan a directory (tests)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ALLOWLIST_PATH = path.join(ROOT, 'scripts/ci/nativeControlsAllowlist.json');

const SCAN_ROOTS = ['src/features', 'src/routes'];
const FILE_EXT = '.tsx';
const SKIP_SEGMENTS = new Set(['__fixtures__', '__mocks__', '__tests__', 'e2e']);
const SKIP_FILE = /\.(?:test|spec|stories)\.[jt]sx?$/;

const NATIVE_TAG = /<(select|input|textarea|button)(?=[\s>/])[^>]*/g;
const HIDDEN_INPUT = /\btype\s*=\s*(?:['"`]|\{\s*['"`])hidden['"`}]/;
const ADHOC_STYLE = /\b(?:appearance-none|form-select)\b/;
const LOBEHUB_BASE_UI = /import\s*\{([^}]*)\}\s*from\s*['"]@lobehub\/ui\/base-ui['"]/g;
const BANNED_LOBEHUB_CONTROLS = new Set([
  'AutoComplete',
  'Button',
  'Cascader',
  'Checkbox',
  'DatePicker',
  'Form',
  'FormItem',
  'Input',
  'InputNumber',
  'Mentions',
  'Radio',
  'Rate',
  'Segmented',
  'Select',
  'Slider',
  'Switch',
  'TextArea',
  'Transfer',
  'TreeSelect',
  'Upload',
]);

/** Strip // line comments and slash-star block comments so prose never flags. */
const stripComments = (source) =>
  source.replaceAll(/\/\*.*?\*\//gs, (m) => ' '.repeat(m.length)).replaceAll(/\/\/[^\n]*/g, '');

/** Glob → RegExp supporting ** and * (same semantics as scripts/slimming/census.mjs). */
const globToRegex = (glob) => {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 1;
        if (glob[i + 1] === '/') i += 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replaceAll(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
};

const loadAllowlist = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    const entries = [];
    for (const [file, rule] of Object.entries(raw.files ?? {})) {
      entries.push({ test: (p) => p === file, ...rule });
    }
    for (const [pattern, rule] of Object.entries(raw.patterns ?? {})) {
      const regex = globToRegex(pattern);
      entries.push({ test: (p) => regex.test(p), ...rule });
    }
    return entries;
  } catch {
    return [];
  }
};

/**
 * Tally how many violations of `rule` `relPath` may still carry (per-file
 * reason + full exemption via `rules`, or a shrinking cap via `counts`).
 * Returns Infinity for a full exemption, a number cap, or -1 when no entry
 * covers the file/rule.
 */
const allowance = (relPath, rule, allowlist) => {
  let cap = -1;
  for (const entry of allowlist) {
    if (!entry.test(relPath)) continue;
    if (entry.rules?.includes(rule)) return Infinity;
    if (typeof entry.counts?.[rule] === 'number') cap = Math.max(cap, entry.counts[rule]);
  }
  return cap;
};

/** Scan one file's text; returns [{line, rule, detail}]. */
export const scanSource = (relPath, source) => {
  const violations = [];
  const clean = stripComments(source);

  for (const match of clean.matchAll(NATIVE_TAG)) {
    const tag = match[1];
    // `<input type="hidden">` is form plumbing, not a rendered control.
    if (tag === 'input' && HIDDEN_INPUT.test(match[0])) continue;
    violations.push({
      detail: `native <${tag}> — use the ReUI component (@/components/ui/*) instead`,
      line: clean.slice(0, match.index).split('\n').length,
      rule: 'native-control',
    });
  }

  // Parse JSX attributes at their owning node: arrows, strings, nested JSX
  // and prop order must not truncate the control's opening tag.
  const tree = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const feedbackNames = new Set();
  const buttonNames = new Set(['Button', 'ActionIcon', 'button']);
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const owner = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (owner === '@/components/ActionIcon' && clause?.name) buttonNames.add(clause.name.text);
    if (
      owner !== '@/components/ui/button' ||
      !clause?.namedBindings ||
      !ts.isNamedImports(clause.namedBindings)
    )
      continue;
    for (const item of clause.namedBindings.elements) {
      const imported = item.propertyName?.text ?? item.name.text;
      if (imported === 'buttonHoverFeedback') feedbackNames.add(item.name.text);
      if (imported === 'Button') buttonNames.add(item.name.text);
    }
  }
  const containsFeedback = (node) => {
    if (!node) return false;
    if (ts.isIdentifier(node) && feedbackNames.has(node.text)) return true;
    return ts.forEachChild(node, containsFeedback) === true;
  };
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      const attributes = new Map(
        node.attributes.properties
          .filter(ts.isJsxAttribute)
          .map((attr) => [attr.name.getText(tree), attr.initializer]),
      );
      const role = attributes.get('role')?.getText(tree) ?? '';
      const rawRole = tag === tag.toLowerCase() && tag !== 'button' && /['"]button['"]/.test(role);
      const shared = containsFeedback(attributes.get('className'));
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      if (rawRole && !shared)
        violations.push({
          detail:
            'raw role=button — use Button or a measured design-system trigger with visible hover feedback',
          line,
          rule: 'adhoc-button',
        });
      if (rawRole || buttonNames.has(tag)) {
        const className = attributes.get('className')?.getText(tree) ?? '';
        const style = attributes.get('style');
        const expression = style && ts.isJsxExpression(style) ? style.expression : undefined;
        const paintKeys =
          expression && ts.isObjectLiteralExpression(expression)
            ? expression.properties
                .filter(ts.isPropertyAssignment)
                .map((property) =>
                  ts.isStringLiteral(property.name)
                    ? property.name.text
                    : property.name.getText(tree),
                )
            : [];
        const suppressed =
          /hover:!?bg-transparent!?/.test(className) ||
          paintKeys.some((key) => ['background', 'backgroundColor'].includes(key));
        const shadow = attributes.get('data-hover-paint');
        const shadowValue =
          shadow && ts.isStringLiteral(shadow)
            ? shadow.text
            : shadow &&
                ts.isJsxExpression(shadow) &&
                shadow.expression &&
                ts.isStringLiteral(shadow.expression)
              ? shadow.expression.text
              : undefined;
        const ownsShadow =
          shared &&
          shadowValue === 'shadow' &&
          !paintKeys.includes('boxShadow') &&
          !/hover:!?shadow-none!?/.test(className);
        if (suppressed && !ownsShadow)
          violations.push({
            detail:
              'button caller suppresses shared hover paint — provide verified local feedback before overriding it',
            line,
            rule: 'hover-feedback-override',
          });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);

  clean.split('\n').forEach((line, index) => {
    if (ADHOC_STYLE.test(line)) {
      violations.push({
        detail: 'ad-hoc appearance-none/form-select control styling — use the ReUI component',
        line: index + 1,
        rule: 'adhoc-select-style',
      });
    }
  });

  for (const match of clean.matchAll(LOBEHUB_BASE_UI)) {
    const names = match[1]
      .split(',')
      .map((part) =>
        part
          .trim()
          .replace(/^type\s+/, '')
          .replace(/\s+as\s+\w+$/, ''),
      )
      .filter(Boolean);
    const banned = names.filter((name) => BANNED_LOBEHUB_CONTROLS.has(name));
    if (banned.length === 0) continue;
    const line = clean.slice(0, match.index).split('\n').length;
    violations.push({
      detail: `@lobehub/ui/base-ui form controls (${banned.join(', ')}) — use the ReUI component (@/components/ui/*) instead`,
      line,
      rule: 'lobehub-form-control',
    });
  }

  return violations;
};

const isScannable = (relPath) => {
  if (!relPath.endsWith(FILE_EXT) || SKIP_FILE.test(relPath)) return false;
  if (relPath.split('/').some((segment) => SKIP_SEGMENTS.has(segment))) return false;
  return true;
};

const walk = (dir, base, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else {
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (isScannable(rel)) out.push({ full, rel });
    }
  }
  return out;
};

export const run = (argv) => {
  const allowlist = loadAllowlist();
  let targets = [];

  const scanDirIndex = argv.indexOf('--scan-dir');
  const scanDirValue = scanDirIndex >= 0 ? argv[scanDirIndex + 1] : undefined;
  const fileArgs = argv.filter((arg) => !arg.startsWith('--') && arg !== scanDirValue);

  if (scanDirIndex >= 0 && scanDirValue) {
    const dir = path.resolve(scanDirValue);
    targets = walk(dir, dir);
  } else if (fileArgs.length > 0) {
    // Per-file mode (lint-staged / bun run check): only product-surface .tsx —
    // design-system implementation files legitimately own native controls.
    targets = fileArgs
      .map((file) => ({ full: path.resolve(process.cwd(), file), rel: file.split('\\').join('/') }))
      .map(({ full, rel }) => ({ full, rel: rel.replace(/^\.\//, '') }))
      .filter(
        ({ rel }) => isScannable(rel) && SCAN_ROOTS.some((root) => rel.startsWith(`${root}/`)),
      );
  } else {
    for (const root of SCAN_ROOTS) {
      targets.push(...walk(path.join(ROOT, root), ROOT));
    }
  }

  let failed = 0;
  const usage = new Map();
  for (const { full, rel } of targets) {
    if (!fs.existsSync(full)) continue;
    for (const violation of scanSource(rel, fs.readFileSync(full, 'utf8'))) {
      const key = `${rel}${violation.rule}`;
      const seen = (usage.get(key) ?? 0) + 1;
      usage.set(key, seen);
      if (seen <= allowance(rel, violation.rule, allowlist)) continue;
      failed += 1;
      console.error(`✗ ${rel}:${violation.line} [${violation.rule}] ${violation.detail}`);
    }
  }

  if (failed > 0) {
    console.error(
      `\n${failed} native-control violation(s) in product surfaces (src/features, src/routes).\n` +
        `Build the control from the design system (@/components/ui/* or @/components/reui/*).\n` +
        `If a file legitimately owns a raw control, add it to scripts/ci/nativeControlsAllowlist.json\n` +
        `with a reason (and a count cap for pre-existing debt — additions still fail).`,
    );
    return 1;
  }
  console.log(`✓ no native/ad-hoc controls in product surfaces (${targets.length} files scanned)`);
  return 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
