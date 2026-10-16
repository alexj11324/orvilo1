import type {
  AcceptanceChecklistItem,
  AcceptanceCheckReviewAction,
  AcceptanceRejectIntent,
  AcceptanceReviewAnnotation,
  AcceptanceSubjectType,
  ReviewAdjudication,
  ReviewProposalEdit,
  VerifierType,
  VerifyCheckDefinition,
  VerifyCheckItem,
  VerifyEvidence,
  VerifyOnFailStrategy,
  VerifyReport,
  VerifyRubricConfig,
  VerifyUserDecision,
} from '@orvilo/types';

import type { VerifyStatus } from '@/database/models/agentOperation';
import type {
  VerifyCheckResultItem,
  VerifyCriterionItem,
  VerifyRubricItem,
  VerifyRunItem,
} from '@/database/schemas/verify';
import { lambdaClient } from '@/libs/trpc/client';

/** Criterion row plus the judge instruction resolved from its linked document. */
export type GoalCriterionWithInstruction = VerifyCriterionItem & { instruction?: string };

export type AcceptanceBundle = Awaited<ReturnType<typeof lambdaClient.acceptance.getBundle.query>>;
export type AcceptanceBySubject = Awaited<
  ReturnType<typeof lambdaClient.acceptance.getBySubject.query>
>;
export type AcceptancePurgePreview = Awaited<
  ReturnType<typeof lambdaClient.acceptance.purgePreview.query>
>;

/** The lifecycle states a reviewer may set by hand from the acceptance list. */
export type AcceptanceStatusOverride = 'accepted' | 'closed' | 'delivered' | 'rejected';

/** Editable fields of a single delivery-check criterion. */
export interface UpdateCriterionValue {
  archivedAt?: Date | null;
  definition?: VerifyCheckDefinition | null;
  description?: string | null;
  documentId?: string | null;
  onFail?: VerifyOnFailStrategy;
  required?: boolean;
  tags?: string[];
  title?: string;
  verifierConfig?: Record<string, unknown>;
  verifierType?: VerifierType;
}

/** Fields for authoring a new delivery-check criterion. */
export interface CreateCriterionInput {
  definition?: VerifyCheckDefinition;
  description?: string;
  documentId?: string;
  onFail?: VerifyOnFailStrategy;
  required?: boolean;
  tags?: string[];
  title: string;
  verifierConfig?: Record<string, unknown>;
  verifierType: VerifierType;
}

/** Fields for authoring a new rubric (named criteria group). */
export interface CreateRubricInput {
  config?: VerifyRubricConfig;
  description?: string;
  title: string;
}

/**
 * A proposed (or user-edited) acceptance criterion before it is persisted. The
 * shape returned by `generateCriteria` and the shape `createCriteria` accepts.
 */
export interface VerifyCriterionDraft {
  description?: string;
  /** Reuse an existing instruction doc (preserves the rubric on re-save). */
  documentId?: string | null;
  instruction?: string;
  onFail?: VerifyOnFailStrategy;
  required?: boolean;
  title: string;
  verifierConfig?: Record<string, unknown>;
  verifierType?: VerifierType;
}

export interface VerifyStateResponse {
  verifyPlan: VerifyCheckItem[] | null;
  verifyPlanConfirmedAt: Date | null;
  verifyStatus: VerifyStatus | null;
}

/** One evidence artifact plus resolved display metadata, when file-backed. */
export type VerifyEvidenceWithUrl = VerifyEvidence & {
  fileName: string | null;
  fileUrl: string | null;
};

/** One check result plus the evidence artifacts attached to it. */
export type VerifyResultWithEvidence = VerifyCheckResultItem & {
  evidence: VerifyEvidenceWithUrl[];
};

/** Everything the standalone report viewer needs for one verification session. */
export interface VerifyReportBundle {
  /**
   * Whether the viewer authored this run. Report URLs are public, so
   * author-only affordances (the origin conversation) gate on this — the server
   * redacts `run.metadata.origin` for everyone else.
   */
  isOwner: boolean;
  report: VerifyReport | null;
  results: VerifyResultWithEvidence[];
  run: VerifyRunItem;
}

export interface VerifyReportSummary {
  report: Pick<
    VerifyReport,
    | 'createdAt'
    | 'failedChecks'
    | 'generatedAt'
    | 'id'
    | 'overallConfidence'
    | 'passedChecks'
    | 'reviewedByUser'
    | 'summary'
    | 'totalChecks'
    | 'uncertainChecks'
    | 'verdict'
    | 'verifyRunId'
  > | null;
  run: VerifyRunItem;
}

/** One cursor-paginated page of report summaries. */
export interface VerifyReportSummaryPage {
  items: VerifyReportSummary[];
  /** Opaque token for the next page, or `null` when this is the last page. */
  nextCursor: string | null;
}

export interface GenerateDraftPlanInput {
  context?: string;
  enableAiGeneration?: boolean;
  goal: string;
  maxAiCriteria?: number;
  operationId: string;
  verifyCriteriaIds?: string[];
  verifyRubricId?: string | null;
}

/** Client wrapper around the `verify` lambda router. */
export class VerifyService {
  reviewFlowStep = (
    _input: Parameters<typeof lambdaClient.acceptance.reviewFlowStep.mutate>[0],
  ): ReturnType<typeof lambdaClient.acceptance.reviewFlowStep.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  // ---- subject-level acceptance ----
  getAcceptanceBundle = (id: string): Promise<AcceptanceBundle> =>
    lambdaClient.acceptance.getBundle.query({ id });

  /** The acceptance aggregate for a subject (topic/task/document), or null. */
  getAcceptanceBySubject = (subjectType: AcceptanceSubjectType, subjectId: string) =>
    lambdaClient.acceptance.getBySubject.query({ subjectId, subjectType });

  /** Persist a subject's standing acceptance checklist (topic tray). */
  saveAcceptanceChecklist = (
    _subjectType: AcceptanceSubjectType,
    _subjectId: string,
    _checklist: AcceptanceChecklistItem[],
  ): ReturnType<typeof lambdaClient.acceptance.saveChecklist.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /** Set/update a subject's acceptance goal (the one-sentence outcome). */
  saveAcceptanceGoal = (
    _subjectType: AcceptanceSubjectType,
    _subjectId: string,
    _requirement: string,
  ): ReturnType<typeof lambdaClient.acceptance.saveGoal.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  acceptDelivery = (
    _id: string,
    _comment?: string,
  ): ReturnType<typeof lambdaClient.acceptance.accept.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  rejectDelivery = (
    _id: string,
    _comment: string,
  ): ReturnType<typeof lambdaClient.acceptance.reject.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /**
   * The user's verdict on individual union checks — accept settles a check for
   * good; reject records feedback the next round reads. A group "accept all"
   * is the same call with many ids.
   */
  reviewChecks = (_input: {
    action: AcceptanceCheckReviewAction;
    annotations?: AcceptanceReviewAnnotation[];
    checkItemIds: string[];
    comment?: string;
    fileIds?: string[];
    id: string;
    /** Set when this decision answered a model proposal. */
    proposal?: {
      adjudication: ReviewAdjudication;
      edit?: ReviewProposalEdit;
      predictionId: string;
    };
    /** Which of the three jobs a reject is doing. */
    rejectIntent?: AcceptanceRejectIntent;
  }): ReturnType<typeof lambdaClient.acceptance.reviewChecks.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /**
   * Queue proposals for the checks still awaiting a verdict. Explicit rather
   * than folded into the bundle read, so opening a report never spends model
   * budget. Returns as soon as the batch is dispatched (`queued`), NOT when it
   * finishes — the caller polls the bundle for the cards to appear.
   */
  predictReviews = (
    _id: string,
  ): ReturnType<typeof lambdaClient.acceptance.predictReviews.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /**
   * Answer a proposal without ruling on the check. The `confirmed` case does
   * NOT come here — it rides along with the reject in `reviewChecks`, where the
   * edit diff is known.
   */
  adjudicateProposal = (_input: {
    adjudication: 'misidentified' | 'not-an-issue';
    id: string;
    predictionId: string;
  }): ReturnType<typeof lambdaClient.acceptance.adjudicateProposal.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /**
   * Feedback addressed to a check group (business category) — for concerns
   * that belong to no single check yet must reach the next round.
   */
  addGroupFeedback = (_input: {
    category: string;
    comment: string;
    fileIds?: string[];
    id: string;
  }): ReturnType<typeof lambdaClient.acceptance.addGroupFeedback.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /**
   * Dispatch the repair prompt straight into the acceptance's origin
   * conversation — a user message that triggers the agent, the same callback
   * channel remote hetero runs (`orvilo notify`) use.
   */
  dispatchAcceptanceRepair = (_input: {
    agentId?: string;
    content: string;
    topicId: string;
  }): ReturnType<typeof lambdaClient.agentNotify.notify.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /** Owner override of the acceptance's decision state from the list. */
  updateAcceptanceStatus = (
    _id: string,
    _status: AcceptanceStatusOverride,
  ): ReturnType<typeof lambdaClient.acceptance.updateStatus.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  getAcceptancePurgePreview = (ids: string[]) =>
    lambdaClient.acceptance.purgePreview.query({ ids });

  /** Delete the acceptance aggregate; its round reports detach unless `purge` removes them too. */
  deleteAcceptance = (
    _id: string,
    _purge?: boolean,
  ): ReturnType<typeof lambdaClient.acceptance.remove.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  // ---- per-run plan ----
  getVerifyState = (operationId: string): Promise<VerifyStateResponse | null> =>
    lambdaClient.verify.getVerifyState.query({
      operationId,
    }) as Promise<VerifyStateResponse | null>;

  /** Resolve an agent verifier's sub-run to the thread it executed in. */
  getVerifierThread = (
    operationId: string,
  ): Promise<{ threadId: string | null; topicId: string | null } | null> =>
    lambdaClient.verify.getVerifierThread.query({ operationId });

  /** Model / token / latency of an LLM verifier's judgment (by tracing id). */
  getVerifierTracing = (
    tracingId: string,
  ): Promise<{
    inputTokens: number | null;
    latencyMs: number | null;
    model: string | null;
    outputTokens: number | null;
    provider: string | null;
  } | null> => lambdaClient.verify.getVerifierTracing.query({ tracingId });

  generateDraftPlan = (_input: GenerateDraftPlanInput): Promise<VerifyCheckItem[]> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  updateDraftItems = (_operationId: string, _items: VerifyCheckItem[]): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  confirmPlan = (_operationId: string): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  skipPlan = (_operationId: string): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  // ---- results / execution ----
  listResults = (operationId: string): Promise<VerifyCheckResultItem[]> =>
    lambdaClient.verify.listResults.query({ operationId }) as Promise<VerifyCheckResultItem[]>;

  /** Full report payload for the standalone viewer, addressed by verifyRunId. */
  getReportBundle = (verifyRunId: string): Promise<VerifyReportBundle | null> =>
    lambdaClient.verify.getReportBundle.query({
      verifyRunId,
    }) as Promise<VerifyReportBundle | null>;

  /**
   * One cursor-paginated page of the current user's verification sessions with
   * report rollup fields. `cursor` comes from the previous page's `nextCursor`;
   * `q` filters by title on the server so search spans the whole history.
   */
  listReportSummaries = (params?: {
    cursor?: string;
    limit?: number;
    q?: string;
  }): Promise<VerifyReportSummaryPage> =>
    lambdaClient.verify.listReportSummaries.query(params) as Promise<VerifyReportSummaryPage>;

  deleteRun = (_verifyRunId: string): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  updateRunTitle = (_verifyRunId: string, _title: string): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  executeVerify = (_input: {
    deliverable: string;
    goal: string;
    operationId: string;
  }): Promise<VerifyCheckResultItem[]> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  submitDecision = (_resultId: string, _decision: VerifyUserDecision): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  // ---- config-time AI generation (one-sentence → criteria) ----
  /** Turn a one-sentence requirement into proposed criteria (traced; not persisted). */
  generateCriteria = (_input: {
    context?: string;
    goal: string;
    maxCriteria?: number;
    taskId: string;
  }): Promise<VerifyCriterionDraft[]> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /** Draft the standing acceptance criteria used by the create-goal review step. */
  generateGoalCriteria = (_input: {
    /** The agent chosen for the goal; ACP users get no draft without it. */
    agentId?: string;
    context?: string;
    goal: string;
    maxCriteria?: number;
  }): Promise<VerifyCriterionDraft[]> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /** Draft the title, instruction, and criteria used by the create-goal review step. */
  generateGoalPlan = (_input: {
    /** The agent chosen for the goal; ACP users get no draft without it. */
    agentId?: string;
    context?: string;
    goal: string;
    maxCriteria?: number;
  }): Promise<
    { criteria: VerifyCriterionDraft[]; instruction: string; title: string } | undefined
  > =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /** Persist (user-edited) drafts as standalone criteria; returns ids in order. */
  createCriteria = (_drafts: VerifyCriterionDraft[]): Promise<string[]> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  // ---- criteria / rubric management ----
  /** Resolve a specific criteria id list (e.g. a goal's acceptance standard), in order. */
  getCriteria = (ids: string[]): Promise<GoalCriterionWithInstruction[]> =>
    lambdaClient.verify.getCriteria.query({ ids }) as Promise<GoalCriterionWithInstruction[]>;

  listCriteria = (): Promise<VerifyCriterionItem[]> =>
    lambdaClient.verify.listCriteria.query() as Promise<VerifyCriterionItem[]>;

  createCriterion = (_input: CreateCriterionInput): Promise<VerifyCriterionItem> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /** Copy legacy rubric-backed criteria before a task edits them. */
  forkRubricCriteria = (_ids: string[]): Promise<string[]> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  updateCriterion = (_id: string, _value: UpdateCriterionValue): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  deleteCriterion = (_id: string): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  listRubrics = (): Promise<VerifyRubricItem[]> =>
    lambdaClient.verify.listRubrics.query() as Promise<VerifyRubricItem[]>;

  createRubric = (_input: CreateRubricInput): Promise<VerifyRubricItem> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /** Get the criteria mounted on a rubric (in rubric order). */
  getRubricCriteria = (rubricId: string): Promise<VerifyCriterionItem[]> =>
    lambdaClient.verify.getRubricCriteria.query({ rubricId }) as Promise<VerifyCriterionItem[]>;

  /** Replace the set of criteria a rubric groups (with optional ordering). */
  setRubricCriteria = (
    _rubricId: string,
    _criteria: { criterionId: string; sortOrder?: number }[],
  ): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  getRubric = (id: string): Promise<VerifyRubricItem | undefined> =>
    lambdaClient.verify.getRubric.query({ id }) as Promise<VerifyRubricItem | undefined>;

  /** Update a rubric's run-policy config (e.g. maxRepairRounds). */
  updateRubricConfig = (_id: string, _config: VerifyRubricConfig): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  /** Rename a rubric (the delivery-standard title). */
  updateRubricTitle = (_id: string, _title: string): Promise<unknown> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );
}

export const verifyService = new VerifyService();
