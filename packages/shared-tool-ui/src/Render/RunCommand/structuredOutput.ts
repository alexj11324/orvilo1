import Anser from 'anser';
import { z } from 'zod';

const count = z.number().int().nonnegative();
const assertion = z.object({
  duration: z.number().nonnegative().nullish(),
  failureMessages: z.array(z.string()).default([]),
  fullName: z.string(),
  status: z.enum(['passed', 'failed', 'pending', 'skipped', 'todo', 'disabled']),
});
const report = z.object({
  numFailedTests: count,
  numPassedTests: count,
  numPendingTests: count,
  numTodoTests: count.optional(),
  numTotalTests: count,
  testResults: z.array(z.object({ name: z.string(), assertionResults: z.array(assertion) })),
});

/** Only complete Jest/Vitest JSON reports; plain logs and partial streaming JSON stay raw. */
export function parseTestReport(output: string) {
  if (output.length > 2_000_000) return;
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    return;
  }
  const parsed = report.safeParse(value);
  if (!parsed.success) return;
  const data = parsed.data;
  const tests = data.testResults.flatMap((suite) => suite.assertionResults);
  const passed = tests.filter((test) => test.status === 'passed').length;
  const failed = tests.filter((test) => test.status === 'failed').length;
  const skipped = tests.length - passed - failed;
  // Reporters differ on whether todo is included in pending; the case list is authoritative.
  if (
    tests.length !== data.numTotalTests ||
    passed !== data.numPassedTests ||
    failed !== data.numFailedTests ||
    (skipped !== data.numPendingTests &&
      skipped !== data.numPendingTests + (data.numTodoTests ?? 0))
  )
    return;
  return {
    summary: { passed, failed, skipped, total: tests.length },
    suites: data.testResults.map((suite) => ({
      name: suite.name,
      tests: suite.assertionResults.map((test) => ({
        name: test.fullName,
        status:
          test.status === 'passed' || test.status === 'failed' ? test.status : ('skipped' as const),
        duration: test.duration ?? undefined,
        errors: test.failureMessages,
      })),
    })),
  };
}

/** Default git log/show headers, not guessed from arbitrary hexadecimal strings. */
export function parseGitCommits(command: string, output: string) {
  if (
    !/\bgit\s+(?:-C\s+(?:"[^"]+"|'[^']+'|\S+)\s+)?(?:log|show)\b/.test(command) ||
    output.length > 2_000_000
  )
    return;
  const text = Anser.ansiToText(output).trim();
  if (!/^commit [a-f0-9]{40,64}(?:\s|$)/.test(text)) return;
  const blocks = text.split(/\n(?=commit [a-f0-9]{40,64}(?:\s|$))/);
  const commits = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const hash = lines[0].split(' ')[1];
    let offset = lines[1]?.startsWith('Merge: ') ? 2 : 1;
    if (
      !lines[offset]?.startsWith('Author:') ||
      !lines[offset + 1]?.startsWith('Date:') ||
      lines[offset + 2] !== ''
    )
      return;
    const author = lines[offset].slice('Author:'.length).trim();
    const dateText = lines[offset + 1].slice('Date:'.length).trim();
    offset += 3;
    const messageLines: string[] = [];
    while (lines[offset]?.startsWith('    ')) messageLines.push(lines[offset++].slice(4));
    const message = messageLines.join('\n').trim();
    if (!author || !message) return;
    const date = new Date(dateText);
    if (!Number.isFinite(date.getTime())) return;
    commits.push({
      hash,
      author: author.trim(),
      date,
      message,
    });
  }
  return commits.length ? commits : undefined;
}

/** Upstream StackTrace understands V8 frames. Other traceback formats remain in Terminal. */
export function parseErrorStack(output: string) {
  if (output.length > 200_000) return;
  const text = Anser.ansiToText(output).trim();
  const lines = text.split('\n');
  if (lines.length < 2 || !/^\w*Error:\s*\S/.test(lines[0])) return;
  if (!lines.slice(1).every((line) => /^\s+at\s+.+/.test(line))) return;
  return text;
}
