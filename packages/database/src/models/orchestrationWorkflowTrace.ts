import { and, desc, eq } from 'drizzle-orm';

import {
  type NewOrchestrationWorkflowTrace,
  orchestrationWorkflows,
  orchestrationWorkflowTraces,
} from '../schemas';
import type { OrviloDatabase } from '../type';
import { buildWorkspaceWhere } from '../utils/workspace';

/**
 * The observation row for a orchestration workflow.
 *
 * Written from the trajectory rather than accumulated as the orchestration workflow runs: every
 * value here is derived from the recorded advances, so re-deriving it is exact
 * however many times it runs — the same reason `recordCompletion` re-sums child
 * operations instead of adding to a counter.
 *
 * Reads join `orchestration workflows` for ownership. The row has no `user_id` of its own on
 * purpose: it is 1:1 with a orchestration workflow, so a copy would be a second place for the
 * answer to drift.
 */
export class OrchestrationWorkflowTraceModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId?: string,
    private readonly workspaceId?: string,
  ) {}

  private ownership = () =>
    buildWorkspaceWhere(
      { userId: this.userId!, workspaceId: this.workspaceId },
      orchestrationWorkflows,
    );

  /** Upsert; an advance rewrites the whole row from the trajectory it just extended. */
  upsert = async (value: NewOrchestrationWorkflowTrace) => {
    const [row] = await this.db
      .insert(orchestrationWorkflowTraces)
      .values(value)
      .onConflictDoUpdate({
        set: { ...value, updatedAt: new Date() },
        target: orchestrationWorkflowTraces.orchestrationWorkflowId,
      })
      .returning();
    return row;
  };

  /** Ownership-scoped: another user's orchestration workflow reads as absent, never as forbidden. */
  findById = async (orchestrationWorkflowId: string) => {
    const [row] = await this.db
      .select({ orchestrationWorkflow: orchestrationWorkflows, trace: orchestrationWorkflowTraces })
      .from(orchestrationWorkflowTraces)
      .innerJoin(
        orchestrationWorkflows,
        eq(orchestrationWorkflowTraces.orchestrationWorkflowId, orchestrationWorkflows.id),
      )
      .where(
        and(
          eq(orchestrationWorkflowTraces.orchestrationWorkflowId, orchestrationWorkflowId),
          this.ownership(),
        ),
      )
      .limit(1);
    return row ? { ...row.trace, title: row.orchestrationWorkflow.title } : undefined;
  };

  /** Goals that recorded a trajectory, newest run first. */
  list = async (limit = 20) => {
    const rows = await this.db
      .select({ orchestrationWorkflow: orchestrationWorkflows, trace: orchestrationWorkflowTraces })
      .from(orchestrationWorkflowTraces)
      .innerJoin(
        orchestrationWorkflows,
        eq(orchestrationWorkflowTraces.orchestrationWorkflowId, orchestrationWorkflows.id),
      )
      .where(this.ownership())
      .orderBy(desc(orchestrationWorkflowTraces.startedAt))
      .limit(limit);

    return rows.map(({ orchestrationWorkflow, trace }) => ({
      ...trace,
      title: orchestrationWorkflow.title,
    }));
  };
}
