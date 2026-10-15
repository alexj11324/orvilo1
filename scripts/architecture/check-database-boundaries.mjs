import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function inspectSource(file, contents) {
  const failures = [];
  const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true);
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
        const resolved = specifier.startsWith('.') ? resolve(dirname(file), specifier) : specifier;
        const applicationDirectories = ['apps/server', 'src/store', 'src/features'].map(
          (directory) => resolve(root, directory),
        );
        if (
          /^@\/(?:server|store|features)(?:\/|$)/.test(specifier) ||
          /^@orvilo\/server(?:\/|$)/.test(specifier) ||
          applicationDirectories.some(
            (directory) => resolved === directory || resolved.startsWith(directory + '/'),
          )
        ) {
          failures.push(`${file.slice(root.length + 1)}: ${specifier}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return failures;
}

function inspectDirectory(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : inspectDirectory(file);
    if (!/\.tsx?$/.test(file) || /\.(?:test|spec)\.tsx?$/.test(file)) return [];
    return inspectSource(file, readFileSync(file, 'utf8'));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = inspectDirectory(resolve(root, 'packages/database/src'));
  if (failures.length) {
    console.error(
      'Database must not depend on application implementations:\n' + failures.join('\n'),
    );
    process.exitCode = 1;
  } else console.log('Database application dependency boundaries passed.');
}
