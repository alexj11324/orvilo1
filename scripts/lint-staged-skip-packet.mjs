import { spawnSync } from 'node:child_process';

const PACKET_PREFIX = 'docs/implementation/navigation-attention-v4/';

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
};

const kind = process.argv[2];
const files = process.argv
  .slice(3)
  .filter((file) => !file.replaceAll('\\', '/').includes(PACKET_PREFIX));
if (files.length === 0) process.exit(0);

if (kind === 'md') {
  run('remark', ['--silent', '--output', '--', ...files]);
  run('prettier', ['--write', '--no-error-on-unmatched-pattern', ...files]);
} else if (kind === 'json') {
  run('prettier', ['--write', '--no-error-on-unmatched-pattern', ...files]);
} else {
  console.error(`usage: lint-staged-skip-packet.mjs <md|json> <files...>`);
  process.exit(1);
}
