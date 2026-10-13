import type { JudgeEvidence } from '@orvilo/prompts';
import type { VerifyCheckItem, VerifyCheckResultStatus } from '@orvilo/types';
import debug from 'debug';

import { DocumentModel } from '@/database/models/document';
import { VerifyCheckResultModel } from '@/database/models/verifyCheckResult';
import { VerifyEvidenceModel } from '@/database/models/verifyEvidence';
import { VerifyRunModel } from '@/database/models/verifyRun';
import type { OrviloDatabase } from '@/database/type';

import { coverageGaps, readRequiredEvidence } from './evidenceCoverage';
import { planItemToPendingResult } from './resultSnapshot';
import { VerifyStatusService } from './statusService';

const log = debug('orvilo-server:verify-executor');

/**
 * Runs a verifier sub-agent (its own agent operation in an isolated thread) to
 * actively investigate one criterion — reading files, running checks — and
 * write its verdict back to the check result. Injected by the runtime layer
 * because it needs full agent-execution context; when absent the agent item is
 * marked skipped.
 */
export interface VerifierAgentRunner {
  (args: {
    checkItem: VerifyCheckItem;
    /** Evidence the builder captured for this item — input to the verifier's judgment. */
    evidence?: JudgeEvidence[];
    goal: string;
    operationId: string;
  }): Promise<{
    initiatingMessage?: string;
    verifierOperationId: string;
    waitingReason?: string;
  } | null>;
}

export interface ExecuteVerifyParams {
  /** The run's final output / artifacts, judged against the criteria. */
  deliverable: string;
  goal: string;
  operationId: string;
  /**
   * Reviewer selected by the live task; its saved runtime owns every judgment.
   */
  reviewerAgentId: string;
  /** Runs agent checks and program checks without a native runner as verifier sub-agents. */
  runVerifierAgent?: VerifierAgentRunner;
}

const terminalResultStatuses = new Set<VerifyCheckResultStatus>([
  'passed',
  'failed',
  'errored',
  'skipped',
]);

/** Group a run's evidence rows by the plan item they back, for judge injection. */
type EvidenceByItem = Map<string, JudgeEvidence[]>;

export class VerifyExecutorService {
  private readonly runModel: VerifyRunModel;
  private readonly resultModel: VerifyCheckResultModel;
  private readonly statusService: VerifyStatusService;
  private readonly documentModel: DocumentModel;
  private readonly evidenceModel: VerifyEvidenceModel;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.runModel = new VerifyRunModel(db, userId, workspaceId);
    this.resultModel = new VerifyCheckResultModel(db, userId, workspaceId);
    this.statusService = new VerifyStatusService(db, userId, workspaceId);
    this.documentModel = new DocumentModel(db, userId, workspaceId);
    this.evidenceModel = new VerifyEvidenceModel(db, userId, workspaceId);
  }

  /**
   * Run the confirmed plan through the Issue reviewer, one session per check.
   * Results land asynchronously through submitVerifyResult. Recomputes the rollup at the end.
   */
  async execute(params: ExecuteVerifyParams): Promise<void> {
    // Resolve (or lazily create) the verification session bound to this Agent Run.
    const run = await this.runModel.ensureForOperation(params.operationId);
    if (run.userDecision) return;
    if (!run.plan?.length) {
      log('execute: no plan for op %s, skipping', params.operationId);
      return;
    }
    if (!run.planConfirmedAt) {
      log('execute: plan for op %s not confirmed, skipping', params.operationId);
      return;
    }

    const verifyRunId = run.id;
    const items = run.plan as VerifyCheckItem[];

    // Idempotently create the pending result rows (skip ones already present —
    // an item may already have a row from evidence uploaded mid-run).
    const existing = await this.resultModel.listByRun(verifyRunId);
    const existingIds = new Set(existing.map((r) => r.checkItemId));
    const toCreate = items
      .filter((i) => !existingIds.has(i.id))
      .map((item) => planItemToPendingResult(verifyRunId, params.operationId, item));
    if (toCreate.length > 0) await this.resultModel.createMany(toCreate);

    await this.statusService.markVerifying(params.operationId);

    // Load run-captured evidence once, grouped by plan item — feeds both the
    // structural gate and the LLM judge.
    const evidenceByItem = await this.loadEvidence(verifyRunId);

    // Structural gate (server, no LLM): an evidence-driven item missing any of
    // its declared evidence types is marked uncertain up front and excluded from
    // the judges — we never let a required artifact-backed claim pass unseen.
    const decidedIds = new Set(
      existing.filter((row) => row.userDecision || row.verdict).map((row) => row.checkItemId),
    );
    const undecidedItems = items.filter((item) => !decidedIds.has(item.id));
    const gapIds = await this.runStructuralGate(verifyRunId, undecidedItems, evidenceByItem);
    const gated = undecidedItems.filter((i) => !gapIds.has(i.id));

    const agentItems = gated.filter((item) => item.verifierType !== 'program');
    const programItems = gated.filter((i) => i.verifierType === 'program');

    // The verifier kinds are independent — run them concurrently. Program checks
    // currently use the verifier agent as an evidence-producing fallback until a
    // sandboxed native program runner is available.
    await Promise.all([
      this.runProgramItems(params, verifyRunId, programItems, evidenceByItem),
      ...agentItems.map((item) =>
        this.runAgentItem(params, verifyRunId, item, evidenceByItem.get(item.id) ?? []),
      ),
    ]);

    await this.statusService.recompute(params.operationId);
  }

  /** Load a run's evidence rows grouped by the plan item id they back. */
  private async loadEvidence(verifyRunId: string): Promise<EvidenceByItem> {
    const rows = await this.evidenceModel.listByRun(verifyRunId);
    const documentIds = [
      ...new Set(rows.flatMap((row) => (row.documentId ? [row.documentId] : []))),
    ];
    const documents = await this.documentModel.findByIds(documentIds);
    const documentContent = new Map(documents.map((document) => [document.id, document.content]));
    const byItem: EvidenceByItem = new Map();
    for (const row of rows) {
      const list = byItem.get(row.checkItemId) ?? [];
      list.push({
        content: row.documentId ? documentContent.get(row.documentId) : row.content,
        description: row.description,
        documentId: row.documentId,
        fileId: row.fileId,
        type: row.type,
      });
      byItem.set(row.checkItemId, list);
    }
    return byItem;
  }

  /**
   * Mark every evidence-driven item whose declared evidence is incomplete as
   * `uncertain` (status `failed`, so it gates delivery and seeds repair), and
   * return their ids so the judges skip them. Items with no `requiredEvidence`
   * pass through untouched.
   */
  private async runStructuralGate(
    verifyRunId: string,
    items: VerifyCheckItem[],
    evidenceByItem: EvidenceByItem,
  ): Promise<Set<string>> {
    const gapIds = new Set<string>();
    for (const item of items) {
      // Deliverable/task-artifact evidence is resolved by the verifier agent
      // from the operation's associated documents/files. Only run evidence is
      // expected to have been explicitly captured into verify_evidence rows.
      const required = readRequiredEvidence(item.verifierConfig)?.filter(
        (spec) => !spec.scope || spec.scope === 'run_evidence',
      );
      const gaps = coverageGaps(required, evidenceByItem.get(item.id) ?? []);
      if (gaps.length === 0) continue;

      gapIds.add(item.id);
      const missing = gaps.join(', ');
      await this.resultModel.updateByCheckItem(verifyRunId, item.id, {
        completedAt: new Date(),
        confidence: 0,
        status: 'failed',
        suggestion: `Capture and upload the missing evidence (${missing}) via \`orvilo verify upload-evidence\`.`,
        toulmin: { limitation: `Required evidence not provided: ${missing}.` },
        verdict: 'uncertain',
      });
    }
    return gapIds;
  }

  /** Execute program checks through the verifier agent until a native runner exists. */
  private async runProgramItems(
    params: ExecuteVerifyParams,
    verifyRunId: string,
    items: VerifyCheckItem[],
    evidenceByItem: EvidenceByItem,
  ): Promise<void> {
    if (params.runVerifierAgent) {
      await Promise.all(
        items.map((item) =>
          this.runAgentItem(params, verifyRunId, item, evidenceByItem.get(item.id) ?? []),
        ),
      );
      return;
    }

    for (const item of items) {
      await this.resultModel.updateByCheckItem(verifyRunId, item.id, {
        completedAt: new Date(),
        status: item.required ? 'errored' : 'skipped',
        toulmin: {
          limitation: 'Program verifier requires a native runner or verifier-agent fallback.',
        },
      });
    }
  }

  /** Run one agent check as a verifier sub-agent (verdict lands async via its hook) or skip. */
  private async runAgentItem(
    params: ExecuteVerifyParams,
    verifyRunId: string,
    item: VerifyCheckItem,
    evidence: JudgeEvidence[],
  ): Promise<void> {
    if (!params.runVerifierAgent) {
      await this.resultModel.updateByCheckItem(verifyRunId, item.id, {
        completedAt: new Date(),
        status: item.required ? 'errored' : 'skipped',
        toulmin: { limitation: 'Agent verifier requires runtime context; not run here.' },
      });
      return;
    }
    try {
      const spawned = await params.runVerifierAgent({
        checkItem: item,
        evidence,
        goal: params.goal,
        operationId: params.operationId,
      });

      if (!spawned?.verifierOperationId) {
        // The runner resolved without an operation id — the spawn never
        // persisted an operation. Log the returned shape at error level (this
        // path lands in production runtime logs, unlike the debug-only `log`).
        console.error(
          '[verify] agent verifier returned no operation id for item %s: %O',
          item.id,
          spawned,
        );
        await this.resultModel.updateByCheckItem(verifyRunId, item.id, {
          completedAt: new Date(),
          // Infra failure, not a delivery verdict: the verifier never started, so
          // there is nothing to judge. `errored` (no verdict) keeps this out of
          // the delivery gate and the auto-repair set.
          status: 'errored',
          toulmin: { limitation: 'Agent verifier failed to start (no operation id returned).' },
        });
        return;
      }

      const current = (await this.resultModel.listByRun(verifyRunId)).find(
        (result) => result.checkItemId === item.id,
      );
      if (
        current &&
        (current.userDecision ||
          current.verdict ||
          (terminalResultStatuses.has(current.status) &&
            current.verifierOperationId === spawned.verifierOperationId))
      )
        return;

      await this.resultModel.updateByCheckItem(verifyRunId, item.id, {
        metadata: {
          ...current?.metadata,
          ...(spawned.initiatingMessage ? { initiatingMessage: spawned.initiatingMessage } : {}),
          ...(spawned.waitingReason ? { waitingReason: spawned.waitingReason } : {}),
        },
        completedAt: null,
        startedAt: new Date(),
        status: 'running',
        suggestion: null,
        toulmin: null,
        verifierOperationId: spawned.verifierOperationId,
      });
    } catch (error) {
      const current = (await this.resultModel.listByRun(verifyRunId)).find(
        (row) => row.checkItemId === item.id,
      );
      if (
        current?.userDecision ||
        current?.verdict ||
        (await this.runModel.findByOperation(params.operationId))?.userDecision
      )
        return;
      // Surface the real cause: the spawn throws during agent startup (before
      // the verifier operation is persisted), and this catch previously only
      // emitted a debug-level line + a generic limitation — so in production the
      // actual error was invisible and the check just read "failed to start".
      // Log at error level (reaches runtime logs) and thread the message into
      // the verdict limitation so it is queryable from verify_check_results.
      const detail = error instanceof Error ? error.message : String(error);
      console.error('[verify] agent verifier spawn failed for item %s: %O', item.id, error);
      await this.resultModel.updateByCheckItem(verifyRunId, item.id, {
        completedAt: new Date(),
        // Infra failure (spawn threw before the verifier op was persisted), not a
        // delivery verdict — mark `errored` so it neither gates delivery nor seeds
        // a repair round.
        status: 'errored',
        toulmin: { limitation: `Agent verifier failed to start: ${detail}` },
      });
    }
  }
}
