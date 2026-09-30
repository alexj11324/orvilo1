import { createHash } from 'node:crypto';

import type { ActionExecutor } from './actionGateway';
import type { ControlResult } from './contracts';
import type { ScopedFileWriter } from './scopedFileWriter';

const denied = (): ControlResult<true> => ({
  ok: false,
  error: {
    code: 'policy_denied',
    message: 'File capability or SHA-256 commitment unavailable',
    retryable: false,
  },
});

/** A concrete file.write executor for one broker-owned output directory. The
 * trusted caller chooses the capability from task authority, never runtime input.
 * Canonical admission must serialize this workspace through apply and verify.
 * Other action kinds intentionally require their own trusted executors. */
export function createFileActionExecutor(writer: ScopedFileWriter): ActionExecutor {
  return {
    async authorize(request, snapshot) {
      if (request.action.kind !== 'file.write') return denied();
      const expected = createHash('sha256').update(request.action.content, 'utf8').digest('hex');
      if (
        !snapshot.commitment.postconditions.length ||
        snapshot.commitment.postconditions.some(
          (condition) => condition.verifierId !== 'file.sha256' || condition.expected !== expected,
        )
      )
        return denied();
      try {
        await writer.authorize(request.action.path);
        return { ok: true, value: true };
      } catch {
        return denied();
      }
    },
    async apply(request) {
      if (request.action.kind !== 'file.write')
        throw new Error('Unsupported file capability action');
      const digest = await writer.write(request.action.path, request.action.content);
      return { evidence: [`sha256:${digest}`] };
    },
    async verify(request, commitment) {
      if (request.action.kind !== 'file.write') return { passed: false, evidence: [] };
      const digest = await writer.digest(request.action.path);
      const passed =
        commitment.postconditions.length > 0 &&
        commitment.postconditions.every(
          (condition) => condition.verifierId === 'file.sha256' && condition.expected === digest,
        );
      return { passed, evidence: passed ? [`file.sha256:${digest}`] : [] };
    },
  };
}
