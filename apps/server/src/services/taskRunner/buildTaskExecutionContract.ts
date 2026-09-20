import type { TaskRunPromptGoalLoop } from '@orvilo/prompts';
import type {
  TaskExecutionContract,
  TaskExecutionContractContent,
  TaskExecutionEnvironmentSnapshot,
  TaskItem,
} from '@orvilo/types';

export interface BuildTaskExecutionContractInput {
  acceptanceEnabled: boolean;
  /**
   * The frozen policy content the prompt was rendered from — carried verbatim
   * so the contract is the prompt's provenance, not a parallel snapshot.
   */
  content?: TaskExecutionContractContent;
  /** Stable identity minted per attempt by the runner. */
  contractId?: string;
  /** Monotonic ordinal within the task's contract chain. */
  contractRevision?: number;
  /** Version pins snapshotted on the dispatch row at claim time. */
  dispatch: {
    generation: number;
    planRevision: number | null;
    policyRevision: number;
    requirementRevision: number;
    taskRevision: number;
  };
  environment: TaskExecutionEnvironmentSnapshot;
  goalLoop?: TaskRunPromptGoalLoop;
  grantId?: string;
  integration?: {
    baseBranch?: string;
    /** Immutable base commit the checkout was built from, when resolved. */
    baseSha?: string;
    branch?: string;
    expectedBaseSha?: string;
    expectedHeadSha?: string;
    repo?: string;
  } | null;
  /** Contract this attempt's content descends from, when one exists. */
  sourceContractId?: string;
  /** Tool identifiers mounted for the run (builtin required-tool set). */
  tools: string[];
}

/**
 * Pure assembler: freezes the versions, environment, tools, acceptance gate
 * and budget a task run was dispatched under into a `TaskExecutionContract`.
 * The contract is persisted on the run row so retries/continuations bind to
 * the same prohibitions instead of re-deriving them from mutable task config.
 */
export function buildTaskExecutionContract(
  task: TaskItem,
  input: BuildTaskExecutionContractInput,
): TaskExecutionContract {
  const contract: TaskExecutionContract = {
    acceptance: { enabled: input.acceptanceEnabled },
    ...(input.content ? { content: input.content } : {}),
    ...(input.contractId ? { contractId: input.contractId } : {}),
    ...(input.contractRevision != null ? { revision: input.contractRevision } : {}),
    ...(input.sourceContractId ? { sourceContractId: input.sourceContractId } : {}),
    budget: {
      maxRounds: input.goalLoop?.maxRounds ?? null,
      round: input.goalLoop?.round ?? (task.totalTopics || 0) + 1,
    },
    environment: input.environment,
    schemaVersion: 1,
    tools: [...input.tools],
    versions: {
      executionGeneration: input.dispatch.generation,
      planRevision: input.dispatch.planRevision,
      policyRevision: input.dispatch.policyRevision,
      requirementRevision: input.dispatch.requirementRevision,
      taskRevision: input.dispatch.taskRevision,
    },
  };

  if (input.grantId) contract.delegation = { grantId: input.grantId };

  if (input.integration) {
    contract.integration = {
      baseBranch: input.integration.baseBranch,
      baseSha: input.integration.baseSha,
      branch: input.integration.branch,
      expectedBaseSha: input.integration.expectedBaseSha,
      expectedHeadSha: input.integration.expectedHeadSha,
      repo: input.integration.repo,
    };
  }

  return contract;
}
