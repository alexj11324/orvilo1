import { TRPCError } from '@trpc/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { LobeChatDatabase } from '@/database/type';

import { insertOutboxEvent, newEventId, taskInputs, tasks } from './contractTables';
import type { TaskInputIntentType, TaskInputStatus } from './types';

export interface SubmitTaskInputParams {
  baseTaskVersion?: number;
  idempotencyKey: string;
  intentType: TaskInputIntentType;
  payload: Record<string, unknown>;
  taskId: string;
}

/**
 * Server-authoritative multi-user input queue for a task. Ordering comes from
 * a per-task monotonic `sequence` assigned inside the write transaction —
 * client-side queues never decide the shared order. `idempotencyKey` dedupes
 * retries: a replay returns the original row instead of appending a twin.
 */
export class TaskInputService {
  private readonly db: LobeChatDatabase;
  private readonly userId: string;
  private readonly workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  submit = async (params: SubmitTaskInputParams) => {
    try {
      const row = await this.db.transaction(async (tx) => {
        // Serialize input allocation per task: the task row lock turns
        // max(sequence)+1 into a true monotonic counter under concurrency.
        const [locked] = await tx
          .select({ id: tasks.id, workspaceId: tasks.workspaceId })
          .from(tasks)
          .where(eq(tasks.id, params.taskId))
          .for('update')
          .limit(1);
        if (!locked) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });

        const [seqRow] = await tx
          .select({ next: sql<number>`coalesce(max(${taskInputs.sequence}), 0) + 1` })
          .from(taskInputs)
          .where(eq(taskInputs.taskId, params.taskId));
        const sequence = seqRow?.next ?? 1;

        const [inserted] = await tx
          .insert(taskInputs)
          .values({
            authorUserId: this.userId,
            baseTaskVersion: params.baseTaskVersion ?? null,
            id: randomUUID(),
            idempotencyKey: params.idempotencyKey,
            intentType: params.intentType,
            payload: params.payload,
            sequence,
            status: 'pending' satisfies TaskInputStatus,
            taskId: params.taskId,
            // Tenant anchor mirrors the locked task row — never the caller's
            // claim — so a forged workspace selector cannot scatter inputs.
            workspaceId: locked.workspaceId,
          })
          .onConflictDoNothing()
          .returning();

        // A conflicting idempotency_key means this exact input already landed —
        // return the stored row so a retried submit stays idempotent.
        const row =
          inserted ??
          (
            await tx
              .select()
              .from(taskInputs)
              .where(
                and(
                  eq(taskInputs.taskId, params.taskId),
                  eq(taskInputs.idempotencyKey, params.idempotencyKey),
                ),
              )
              .limit(1)
          )[0];

        if (!row) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Task input conflicted without a matching row',
          });
        }

        if (inserted) {
          await insertOutboxEvent(tx, {
            aggregateId: params.taskId,
            aggregateType: 'task',
            eventId: newEventId(),
            eventType: 'task.input.submitted',
            payload: {
              authorUserId: this.userId,
              inputId: row.id,
              intentType: params.intentType,
              sequence: row.sequence,
              taskId: params.taskId,
            },
            workspaceId: locked.workspaceId,
          });
        }

        return { deduplicated: !inserted, row };
      });

      return { deduplicated: row.deduplicated, input: row.row };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      // Unique-index race: the losing insert sees a constraint error instead of
      // an empty returning — resolve it to the winning row like a conflict.
      if (isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(params.taskId, params.idempotencyKey);
        if (existing) return { deduplicated: true, input: existing };
      }
      throw error;
    }
  };

  findByIdempotencyKey = async (taskId: string, idempotencyKey: string) => {
    const [row] = await this.db
      .select()
      .from(taskInputs)
      .where(and(eq(taskInputs.taskId, taskId), eq(taskInputs.idempotencyKey, idempotencyKey)))
      .limit(1);
    return row ?? null;
  };

  list = async (params: { status?: TaskInputStatus; taskId: string }) => {
    const conditions = [eq(taskInputs.taskId, params.taskId)];
    if (params.status) conditions.push(eq(taskInputs.status, params.status));
    return this.db
      .select()
      .from(taskInputs)
      .where(and(...conditions))
      .orderBy(asc(taskInputs.sequence));
  };
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { code?: string }).code === '23505' ||
    String((error as { message?: string }).message ?? '').includes('duplicate key'));
