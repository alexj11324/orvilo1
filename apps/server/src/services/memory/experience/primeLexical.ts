import { execFile } from 'node:child_process';

import type { ExperienceMemoryItem } from '@/database/models/experienceMemory';

import { primeLexicalSource as pythonSource } from './primeLexicalSource';

export const PRIME_MEMORY_PIN = '7d442aafa985f9342134fac16c2ef41f03fb45c1';
let active = 0;

/** No fallback embedding/model calls; a missing pinned runtime fails explicitly. */
export async function primeLexicalSearch(
  records: ExperienceMemoryItem[],
  query: string,
  limit: number,
): Promise<string[]> {
  const root = process.env.PRIME_AGENT_ROOT;
  if (!root) throw new Error('Pinned Prime lexical runtime is not configured');
  if (active >= 2) throw new Error('Prime lexical capacity unavailable');
  const input = JSON.stringify({
    records: records.map(({ id, content, updatedAt }) => ({ id, content, updatedAt })),
    query,
    limit,
  });
  if (Buffer.byteLength(input) > 2_500_000)
    throw new Error('Prime lexical corpus exceeds request capacity');
  active++;
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        process.env.PRIME_MEMORY_PYTHON || '/usr/bin/python3',
        ['-I', '-c', pythonSource, root],
        {
          env: {
            LANG: 'C.UTF-8',
            PATH: '/usr/bin:/bin',
            PYTHONNOUSERSITE: '1',
            GIT_NO_LAZY_FETCH: '1',
          },
          maxBuffer: 65536,
          timeout: 15000,
          killSignal: 'SIGKILL',
        },
        (error, stdout) =>
          error ? reject(new Error('Prime lexical execution unavailable')) : resolve(stdout),
      );
      child.stdin?.on('error', () => {});
      child.stdin?.end(input);
    });
    const result = JSON.parse(output);
    const allowed = new Set(records.map((row) => row.id));
    if (
      result.revision !== PRIME_MEMORY_PIN ||
      !Array.isArray(result.ids) ||
      result.ids.length > limit ||
      result.ids.some((id: unknown) => typeof id !== 'string' || !allowed.has(id)) ||
      new Set(result.ids).size !== result.ids.length
    )
      throw new Error('Invalid Prime lexical result');
    return result.ids;
  } finally {
    active--;
  }
}
