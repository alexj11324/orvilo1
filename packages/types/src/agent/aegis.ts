/**
 * Shared contract for the Aegis method-pack integration ("deep fusion").
 *
 * Aegis ships as prompt discipline (skills the agent reads), not a runtime —
 * this module owns the deterministic *contract* between the spawned agent and
 * Orvilo's verify pipeline:
 *
 *   opt-in      `heterogeneousProvider.methodPacks.aegis` on the agent config
 *               → dispatch stamps `agent_operations.metadata.aegis.enabled`,
 *               injects {@link AEGIS_ORVILO_CONTRACT} into the run context and
 *               sets `ORVILO_AEGIS_PACK=1` on the spawned `lh hetero exec`.
 *   emit        the agent writes `.aegis/closeout.json` (schema
 *               {@link AEGIS_CLOSEOUT_SCHEMA}) plus optional reports; the pack
 *               itself may also write `docs/aegis/**` workspace output.
 *   collect     `lh hetero exec` ships the bounded file set back inside
 *               `heteroFinish.params.aegis` ({@link AegisFinishReport}).
 *   persist     the server merges it into `agent_operations.metadata.aegis`
 *               before `completeOperation`, so the verify lifecycle, the
 *               advisory gate and work registration all read the same record.
 *
 * Advisory semantics (chosen): Aegis evidence is an INPUT to verification,
 * never authority. A passed verify run whose Aegis evidence is missing or
 * low-confidence is downgraded to *requires review* (task pauses at the human
 * decision gate) instead of auto-completing — it is never silently accepted
 * and never hard-failed by Aegis alone.
 */

/** Env flag the dispatch sets on `lh hetero exec` to install + collect. */
export const AEGIS_PACK_ENV = 'ORVILO_AEGIS_PACK';

/**
 * `heterogeneousProvider.methodPacks.aegis === true` — the single opt-in bit
 * the dispatch, the CLI and the finish handler all key off.
 */
export const isAegisMethodPackEnabled = (
  provider?: { methodPacks?: { aegis?: boolean } } | null,
): boolean => provider?.methodPacks?.aegis === true;

/** Workspace-relative dir the agent writes its Orvilo-contract artifacts to. */
export const AEGIS_ARTIFACT_DIR = '.aegis';

/** Workspace-relative path of the deterministic closeout record. */
export const AEGIS_CLOSEOUT_PATH = '.aegis/closeout.json';

/** Schema marker the agent puts in `closeout.schema`. */
export const AEGIS_CLOSEOUT_SCHEMA = 'orvilo.aegis-closeout.v0';

export interface AegisArtifactFile {
  /** Inline file body (bounded by the collector). */
  content: string;
  /** Workspace-relative POSIX path. */
  path: string;
}

/** `heteroFinish` wire payload — present iff the run opted into Aegis. */
export interface AegisFinishReport {
  /** Always `true` when the field is sent; marks this run as pack-enabled. */
  enabled: true;
  /** Collected `.aegis/**` + `docs/aegis/**` artifacts (may be empty). */
  files: AegisArtifactFile[];
}

/** What the server persists on `agent_operations.metadata.aegis`. */
export interface AegisOperationMetadata {
  /** Server-observed artifact contents — same shape as the wire payload. */
  artifacts?: AegisArtifactFile[];
  /** ISO time the finish payload was persisted. */
  collectedAt?: string;
  /**
   * Dispatch-stamped opt-in marker (`recordStart`). Survives runs that die
   * before `heteroFinish`, so "enabled but produced nothing" is
   * distinguishable from "not enabled".
   */
  enabled?: boolean;
  /** Upstream pack commit the installed skills were vendored from. */
  packRevision?: string;
}

export const AEGIS_CONFIDENCE_GRADES = ['A', 'B', 'C'] as const;
export type AegisConfidence = (typeof AEGIS_CONFIDENCE_GRADES)[number];

export const AEGIS_GOAL_CLOSURES = [
  'done',
  'blocked',
  'needs-verification',
  'scope-exceeded',
] as const;
export type AegisGoalClosure = (typeof AEGIS_GOAL_CLOSURES)[number];

export interface AegisCloseoutEntry {
  /** Evidence action / check performed. */
  action?: string;
  /** Covered scope. */
  covered?: string;
  /** Residual risk left uncovered. */
  residual?: string;
  /** Result / exit status observed. */
  result?: string;
  /** Uncovered scope. */
  uncovered?: string;
}

/** `.aegis/closeout.json` — the agent's self-reported completion evidence. */
export interface AegisCloseout {
  /** `A | B | C` per the Aegis verification-before-completion contract. */
  confidence?: AegisConfidence;
  evidence?: AegisCloseoutEntry[];
  /** Self-classified task closure state. */
  goalClosure?: AegisGoalClosure;
  /** Must equal {@link AEGIS_CLOSEOUT_SCHEMA}. */
  schema?: string;
  /** Free-text closeout summary. */
  summary?: string;
}

/**
 * Context block appended to the run's agent system context when the pack is
 * enabled. Deterministic — the agent gets the exact artifact contract the
 * server-side gate later evaluates, regardless of whether pack discovery
 * succeeded on its host.
 */
export const AEGIS_ORVILO_CONTRACT = [
  'Aegis method-pack integration is enabled for this run.',
  '',
  'Skills: the vendored Aegis pack was installed into this workspace under',
  '`.agents/skills/aegis/` (plus your host-native skills dir when one exists).',
  'Apply its discipline while you work — explore the baseline before editing,',
  'keep evidence of every verification step, flag drift, and prefer retiring',
  'stale code over dead paths.',
  '',
  'Completion contract (required): before you finish, write your completion',
  'evidence to `.aegis/closeout.json` with this exact shape:',
  '',
  '```json',
  '{',
  `  "schema": "${AEGIS_CLOSEOUT_SCHEMA}",`,
  '  "confidence": "A | B | C",',
  '  "goalClosure": "done | blocked | needs-verification | scope-exceeded",',
  '  "summary": "what you delivered and how it was verified",',
  '  "evidence": [',
  '    {',
  '      "action": "check performed (command/test/review)",',
  '      "result": "outcome / exit status",',
  '      "covered": "scope this evidence covers",',
  '      "uncovered": "scope it does not cover",',
  '      "residual": "remaining risk"',
  '    }',
  '  ]',
  '}',
  '```',
  '',
  'Confidence grades: A = target evidence + regression suite pass; B = target',
  'evidence with bounded residual risk; C = partial evidence only. Use',
  '`goalClosure: "done"` only when the goal is actually closed.',
  '',
  'Additional reports (drift checks, retirement findings, reviews) also belong',
  'under `.aegis/` — everything in that directory is uploaded when the run',
  'finishes and becomes verify-gate input and task artifacts. A passed',
  'verification without a usable closeout does not auto-complete: it is',
  'downgraded to require human review.',
].join('\n');
