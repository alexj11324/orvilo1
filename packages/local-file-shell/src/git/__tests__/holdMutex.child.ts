// Test child entrypoint — spawned by registryFile.test.ts to hold the
// repo-file mutex in a real second process. Run via
// `bun <this file> <target> <holdMs>`; prints 'acquired:<pid>' once inside the
// section, then holds for <holdMs> (the parent may SIGKILL it earlier to
// simulate a crashed holder).
import { withRepoFileMutex } from '../registryFile';

const [target, holdMs] = process.argv.slice(2);
await withRepoFileMutex(target, async () => {
  process.stdout.write(`acquired:${process.pid}`);
  await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));
});
