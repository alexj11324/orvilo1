import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const { dirname, resolve, sep } = path;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeSource = resolve(root, 'packages/agent-manager-runtime/src');

export function inspectRuntimeSource(file, text) {
  const failures = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function report(node, message) {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    failures.push(`${file}:${line + 1}: ${message}`);
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      const parent = node.parent;
      const isImport =
        (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
        parent.moduleSpecifier === node;
      const isCall =
        ts.isCallExpression(parent) &&
        parent.arguments[0] === node &&
        (parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
          parent.expression.getText(source) === 'require');
      const isImportType = ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent);
      if (isImport || isCall || isImportType) {
        const specifier = node.text;
        const escapesPackage =
          specifier.startsWith('.') &&
          !resolve(dirname(file), specifier).startsWith(runtimeSource + sep);
        if (
          specifier.startsWith('@/') ||
          /^(?:react|react-dom|zustand)(?:\/|$)/.test(specifier) ||
          /^@orvilo\/server(?:\/|$)/.test(specifier) ||
          specifier.startsWith('/') ||
          escapesPackage
        ) {
          report(node, `host dependency ${specifier}`);
        }
      }
    }
    if (
      ts.isIdentifier(node) &&
      /^(?:window|document|localStorage|sessionStorage|navigator)$/.test(node.text) && // A property in an interface is a host capability, not global access.
      !ts.isPropertySignature(node.parent) &&
      !ts.isPropertyAssignment(node.parent)
    ) {
      report(node, `browser global ${node.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return failures;
}

function inspect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : inspect(file);
    if (!/\.tsx?$/.test(file) || /\.(?:test|spec)\.tsx?$/.test(file)) return [];
    return inspectRuntimeSource(file, readFileSync(file, 'utf8'));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = inspect(runtimeSource);
  if (failures.length) {
    console.error('Runtime must use injected host capabilities:\n' + failures.join('\n'));
    process.exitCode = 1;
  } else console.log('Runtime host dependency boundaries passed.');
}
