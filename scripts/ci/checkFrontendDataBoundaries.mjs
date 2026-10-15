import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const violations = [];
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.[cm]?[jt]sx?$/.test(file) && !/\.(test|spec)\./.test(file)) {
      const source = readFileSync(file, 'utf8');
      if (/(?:from\s*|import\s*\(|require\s*\()\s*['"]@\/libs\/trpc\/client(?:\/[^'"]*)?['"]/.test(source)) {
        violations.push(path.relative(root, file));
      }
    }
  }
}
for (const directory of ['src/features', 'src/store']) check(path.join(root, directory));
if (violations.length) {
  console.error('Client transports belong in src/services; features and stores must use domain services:\n' + violations.join('\n'));
  process.exitCode = 1;
} else console.log('Frontend data-access boundaries passed.');
