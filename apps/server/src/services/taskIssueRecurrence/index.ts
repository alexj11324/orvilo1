import type { TaskIssueRecurrenceCadence } from '@orvilo/types';
import { TRPCError } from '@trpc/server';

import { TaskModel } from '@/database/models/task';
import { TaskIssueRecurrenceModel } from '@/database/models/taskIssueRecurrence';
import type { OrviloDatabase } from '@/database/type';

import { TaskIssueDefinitionService } from '../taskIssueDefinition';
import { issueRecurrenceCreationAt } from './dates';

export class TaskIssueRecurrenceService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  async convert(input: {
    id: string;
    expectedDomainRevision: number;
    firstDueDate: string;
    cadence: TaskIssueRecurrenceCadence;
    interval?: number;
    timezone: string;
  }) {
    const interval = input.interval ?? 1;
    if (!Number.isInteger(interval) || interval < 1)
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Recurrence interval must be positive' });
    let nextOccurrenceAt: Date;
    try {
      nextOccurrenceAt = issueRecurrenceCreationAt(input.firstDueDate, input.timezone);
    } catch (cause) {
      throw new TRPCError({
        cause,
        code: 'BAD_REQUEST',
        message: 'Choose a valid due date and timezone',
      });
    }
    return this.db.transaction(async (tx) => {
      const db = tx as OrviloDatabase;
      const { source, definition } = await new TaskIssueDefinitionService(
        db,
        this.userId,
        this.workspaceId,
      ).snapshotForRecurrence(input.id, input.expectedDomainRevision);
      await new TaskModel(db, this.userId, this.workspaceId).update(
        source.id,
        { dueDate: input.firstDueDate },
        { expectedDomainRevision: input.expectedDomainRevision, source: 'user' },
      );
      return new TaskIssueRecurrenceModel(db, this.userId, this.workspaceId).set(source.id, {
        cadence: input.cadence,
        definition,
        firstDueDate: input.firstDueDate,
        interval,
        nextOccurrenceAt,
        timezone: input.timezone,
      });
    });
  }
}
