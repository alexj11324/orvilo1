// Test child entrypoint — spawned by pushFence.test.ts to exercise the
// cross-process claim path. Run via `bun <this file> <dir> <op> <seq>`; prints
// 'ok' or 'rejected: <reason>' on stdout.
import { claimGitPushFence } from '../pushFence';

const [dir, operationId, seq] = process.argv.slice(2);
const rejected = await claimGitPushFence(dir, {
  operationId,
  ref: 'refs/heads/main',
  seq: Number(seq),
});
process.stdout.write(rejected === undefined ? 'ok' : `rejected:${rejected}`);
