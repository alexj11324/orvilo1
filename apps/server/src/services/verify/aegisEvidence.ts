import type { AegisArtifactFile, AegisCloseout, AegisOperationMetadata } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';

/**
 * Aegis method-pack evidence → verify gate input.
 *
 * The durable record is `agent_operations.metadata.aegis` — stamped
 * `enabled` at dispatch and merged with `artifacts`/`collectedAt` by
 * `heteroFinish` (see packages/types `aegis.ts` for the full contract).
 *
 * Two consumers read it here:
 *  - {@link appendAegisDeliverableEvidence} inlines the artifacts into the
 *    deliverable text, so the LLM judge and the recorded evidence rows see
 *    the agent's own closeout alongside its output.
 *  - {@link evaluateAegisEvidenceRequirement} is the advisory gate: a passed
 *    run whose Aegis evidence is missing or low-confidence downgrades to
 *    `requires-review` (pause at the human decision gate). Aegis is never
 *    authoritative — it can withhold auto-accept, never pass or fail a run.
 */

export type AegisEvidenceVerdict = 'not-enabled' | 'requires-review' | 'satisfied';

const AEGIS_CLOSEOUT_SCHEMA_PREFIX = 'orvilo.aegis-closeout.v';

/** Read the aegis block off the operation row's jsonb metadata. */
export const extractAegisOperationMetadata = (
  opMetadata: unknown,
): AegisOperationMetadata | undefined => {
  if (!isRecord(opMetadata)) return undefined;
  const aegis = opMetadata.aegis;
  if (!isRecord(aegis)) return undefined;
  return {
    artifacts: Array.isArray(aegis.artifacts)
      ? (aegis.artifacts as AegisArtifactFile[]).filter(
          (file) => isRecord(file) && typeof file.path === 'string',
        )
      : undefined,
    collectedAt: typeof aegis.collectedAt === 'string' ? aegis.collectedAt : undefined,
    enabled: aegis.enabled === true,
    packRevision: typeof aegis.packRevision === 'string' ? aegis.packRevision : undefined,
  };
};

const isAegisCloseoutPath = (path: string): boolean =>
  path.replaceAll('\\', '/').endsWith('.aegis/closeout.json');

/**
 * Parse a `.aegis/closeout.json` body. Tolerates forward schema versions
 * (`orvilo.aegis-closeout.vN`) — we only read the fields v0 defines.
 */
export const parseAegisCloseout = (content: string): AegisCloseout | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  if (
    typeof parsed.schema === 'string' &&
    !parsed.schema.startsWith(AEGIS_CLOSEOUT_SCHEMA_PREFIX)
  ) {
    return undefined;
  }
  return parsed as AegisCloseout;
};

/**
 * Advisory gate verdict for a verify run that PASSED:
 *  - `not-enabled` — no aegis opt-in on this operation; gate does not apply.
 *  - `requires-review` — opted in, but closeout missing/unparseable, or it
 *    reports `confidence: 'C'` or `goalClosure !== 'done'`.
 *  - `satisfied` — a well-formed closeout at confidence A|B with
 *    `goalClosure: 'done'`.
 */
export const evaluateAegisEvidenceRequirement = (opMetadata: unknown): AegisEvidenceVerdict => {
  const aegis = extractAegisOperationMetadata(opMetadata);
  if (aegis?.enabled !== true) return 'not-enabled';

  const closeoutFile = aegis.artifacts?.find((file) => isAegisCloseoutPath(file.path));
  const closeout = closeoutFile ? parseAegisCloseout(closeoutFile.content) : undefined;
  if (!closeout) return 'requires-review';
  if (closeout.confidence === 'C') return 'requires-review';
  if (closeout.goalClosure !== 'done') return 'requires-review';
  return 'satisfied';
};

const MAX_AEGIS_DELIVERABLE_CHARS = 60_000;

/**
 * Inline the run's Aegis artifacts as a deliverable appendix — same mechanism
 * `resolveVerificationDeliverable` uses for pinned task documents. The block
 * is advisory context for the judge, marked as such so it is read as the
 * agent's self-report, not as an authoritative verdict.
 */
export const appendAegisDeliverableEvidence = (
  deliverable: string,
  opMetadata: unknown,
): string => {
  const aegis = extractAegisOperationMetadata(opMetadata);
  if (aegis?.enabled !== true || !aegis.artifacts?.length) return deliverable;

  const closeoutFile = aegis.artifacts.find((file) => isAegisCloseoutPath(file.path));
  const closeout = closeoutFile ? parseAegisCloseout(closeoutFile.content) : undefined;

  const blocks: string[] = [];
  if (closeout) {
    blocks.push(
      [
        `## Aegis closeout (agent self-report, advisory)`,
        '',
        `- confidence: ${closeout.confidence ?? 'unspecified'}`,
        `- goalClosure: ${closeout.goalClosure ?? 'unspecified'}`,
        ...(closeout.summary ? [`- summary: ${closeout.summary}`] : []),
      ].join('\n'),
    );
  } else {
    blocks.push(
      '## Aegis closeout (agent self-report, advisory)\n\nNo usable `.aegis/closeout.json` was produced.',
    );
  }

  const reports = aegis.artifacts
    .filter((file) => file !== closeoutFile)
    .map((file) => `### ${file.path}\n\n${file.content}`)
    .join('\n\n');
  if (reports) blocks.push(`## Aegis reports\n\n${reports}`);

  return [deliverable, '# Aegis method-pack evidence', blocks.join('\n\n')]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, deliverable.length + MAX_AEGIS_DELIVERABLE_CHARS);
};
