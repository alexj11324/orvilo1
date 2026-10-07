import { spawnSync } from 'node:child_process';
import path from 'node:path';

const PACKET_PREFIX = 'docs/implementation/navigation-attention-v4/';

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
};

const relativeFile = (file) => {
  const normalized = file.replaceAll('\\', '/');
  return (path.isAbsolute(normalized) ? path.relative(process.cwd(), normalized) : normalized)
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
};

const kind = process.argv[2];
const files = process.argv.slice(3).filter((file) => {
  const relative = relativeFile(file);
  return (
    !relative.includes(PACKET_PREFIX) &&
    !relative.startsWith('vendor/') &&
    !relative.startsWith('.agents/skills/design-system/')
  );
});
if (files.length === 0) process.exit(0);

// Only routed first-party policy edits invoke the bounded rule guard.
const { POLICY_FILES } = await import('../.github/scripts/check-ui-ux-rules.mjs');
if (files.some((file) => [...POLICY_FILES, 'skills-lock.json'].includes(relativeFile(file)))) {
  run('node', ['.github/scripts/check-ui-ux-rules.mjs']);
}

if (kind === 'md') {
  run('remark', ['--silent', '--output', '--', ...files]);
  run('prettier', ['--write', '--no-error-on-unmatched-pattern', ...files]);
} else if (kind === 'json') {
  run('prettier', ['--write', '--no-error-on-unmatched-pattern', ...files]);
} else {
  console.error(`usage: lint-staged-skip-packet.mjs <md|json> <files...>`);
  process.exit(1);
}
