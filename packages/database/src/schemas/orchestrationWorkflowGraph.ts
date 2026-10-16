import type {
  OrchestrationWorkflowDecisionAuthority,
  OrchestrationWorkflowDecisionOption,
  OrchestrationWorkflowDecisionStatus,
  OrchestrationWorkflowEdgeKind,
  OrchestrationWorkflowEventActorType,
  OrchestrationWorkflowEventEntityType,
  OrchestrationWorkflowEventType,
  OrchestrationWorkflowNodeKind,
  OrchestrationWorkflowNodeStatus,
  OrchestrationWorkflowNodeWorkVersionRelation,
} from '@orvilo/types';
import { isNotNull, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, timestamps, timestamptz } from './_helpers';
import { agents } from './agent';
import { orchestrationWorkflows } from './orchestrationWorkflow';
import { tasks } from './task';
import { users } from './user';
import { workVersions } from './work';

/**
 * OrchestrationWorkflow Graph nodes preserve the evolving problem framing above individual Task
 * execution. A task node may own one responsible Task; that Task remains free
 * to create its own implementation-level subtree.
 */
export const orchestrationWorkflowNodes = pgTable(
  'orchestration_workflow_nodes',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    orchestrationWorkflowId: text('orchestration_workflow_id')
      .references(() => orchestrationWorkflows.id, { onDelete: 'cascade' })
      .notNull(),
    kind: text('kind').$type<OrchestrationWorkflowNodeKind>().notNull(),
    status: text('status').$type<OrchestrationWorkflowNodeStatus>().default('proposed').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    /** Responsible execution container. Valid only when kind is `task`. */
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    priority: integer('priority').default(0).notNull(),
    /** Agent or reviewer confidence from 0 to 1. */
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByAgentId: text('created_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamptz('resolved_at'),
    ...timestamps,
  },
  (t) => [
    index('orchestration_workflow_nodes_orchestration_workflow_id_status_idx').on(
      t.orchestrationWorkflowId,
      t.status,
    ),
    index('orchestration_workflow_nodes_orchestration_workflow_id_kind_idx').on(
      t.orchestrationWorkflowId,
      t.kind,
    ),
    unique('orchestration_workflow_nodes_orchestration_workflow_id_id_unique').on(
      t.orchestrationWorkflowId,
      t.id,
    ),
    /**
     * One task, one node. This stays in the database because it is a real
     * invariant no single write can check for itself.
     *
     * *Which* kinds may own a task deliberately does not: `bindTask` is the
     * only writer of `task_id` and its WHERE already requires the kind, and a
     * CHECK would pin the kind vocabulary into DDL — an ALTER every time that
     * vocabulary moves, which is exactly what renaming `work` to `task` cost.
     */
    uniqueIndex('orchestration_workflow_nodes_task_id_unique')
      .on(t.taskId)
      .where(isNotNull(t.taskId)),
    check(
      'orchestration_workflow_nodes_confidence_range',
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
  ],
);

/** Directed semantic relationships between nodes in the same Orchestration workflow Graph. */
export const orchestrationWorkflowEdges = pgTable(
  'orchestration_workflow_edges',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    orchestrationWorkflowId: text('orchestration_workflow_id')
      .references(() => orchestrationWorkflows.id, { onDelete: 'cascade' })
      .notNull(),
    sourceNodeId: uuid('source_node_id').notNull(),
    targetNodeId: uuid('target_node_id').notNull(),
    kind: text('kind').$type<OrchestrationWorkflowEdgeKind>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('orchestration_workflow_edges_source_target_kind_unique').on(
      t.sourceNodeId,
      t.targetNodeId,
      t.kind,
    ),
    index('orchestration_workflow_edges_orchestration_workflow_id_idx').on(
      t.orchestrationWorkflowId,
    ),
    index('orchestration_workflow_edges_target_node_id_idx').on(t.targetNodeId),
    foreignKey({
      columns: [t.orchestrationWorkflowId, t.sourceNodeId],
      foreignColumns: [
        orchestrationWorkflowNodes.orchestrationWorkflowId,
        orchestrationWorkflowNodes.id,
      ],
      name: 'orchestration_workflow_edges_orchestration_workflow_source_node_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.orchestrationWorkflowId, t.targetNodeId],
      foreignColumns: [
        orchestrationWorkflowNodes.orchestrationWorkflowId,
        orchestrationWorkflowNodes.id,
      ],
      name: 'orchestration_workflow_edges_orchestration_workflow_target_node_fk',
    }).onDelete('cascade'),
    check(
      'orchestration_workflow_edges_distinct_nodes',
      sql`${t.sourceNodeId} <> ${t.targetNodeId}`,
    ),
  ],
);

/** Pins immutable evidence and artifacts to the graph node that consumed or produced them. */
export const orchestrationWorkflowNodeWorkVersions = pgTable(
  'orchestration_workflow_node_work_versions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    nodeId: uuid('node_id')
      .references(() => orchestrationWorkflowNodes.id, { onDelete: 'cascade' })
      .notNull(),
    workVersionId: uuid('work_version_id')
      .references(() => workVersions.id, { onDelete: 'cascade' })
      .notNull(),
    relation: text('relation').$type<OrchestrationWorkflowNodeWorkVersionRelation>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('orchestration_workflow_node_work_versions_node_version_relation_unique').on(
      t.nodeId,
      t.workVersionId,
      t.relation,
    ),
    index('orchestration_workflow_node_work_versions_work_version_id_idx').on(t.workVersionId),
  ],
);

/** Durable decision/gate state for a Decision node, including human review across runs. */
export const orchestrationWorkflowNodeDecisions = pgTable(
  'orchestration_workflow_node_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    nodeId: uuid('node_id')
      .references(() => orchestrationWorkflowNodes.id, { onDelete: 'cascade' })
      .notNull(),
    authority: text('authority').$type<OrchestrationWorkflowDecisionAuthority>().notNull(),
    status: text('status')
      .$type<OrchestrationWorkflowDecisionStatus>()
      .default('pending')
      .notNull(),
    question: text('question').notNull(),
    options: jsonb('options').$type<OrchestrationWorkflowDecisionOption[]>(),
    recommendedOptionId: text('recommended_option_id'),
    requestedUserId: text('requested_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requestedProjectRole: text('requested_project_role'),
    resolvedOptionId: text('resolved_option_id'),
    resolution: text('resolution'),
    resolvedByUserId: text('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedByAgentId: text('resolved_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamptz('resolved_at'),
    canceledAt: timestamptz('canceled_at'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('orchestration_workflow_node_decisions_node_id_unique').on(t.nodeId),
    index('orchestration_workflow_node_decisions_status_idx').on(t.status),
    index('orchestration_workflow_node_decisions_requested_user_id_status_idx').on(
      t.requestedUserId,
      t.status,
    ),
  ],
);

/** Append-only audit trail for graph evolution and execution handoffs. */
export const orchestrationWorkflowEvents = pgTable(
  'orchestration_workflow_events',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    orchestrationWorkflowId: text('orchestration_workflow_id')
      .references(() => orchestrationWorkflows.id, { onDelete: 'cascade' })
      .notNull(),
    eventType: text('event_type').$type<OrchestrationWorkflowEventType>().notNull(),
    entityType: text('entity_type').$type<OrchestrationWorkflowEventEntityType>().notNull(),
    entityId: text('entity_id').notNull(),
    actorType: text('actor_type').$type<OrchestrationWorkflowEventActorType>().notNull(),
    actorId: text('actor_id'),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    /** Root agent-runtime operation responsible for this transition, when applicable. */
    operationId: text('operation_id'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('orchestration_workflow_events_orchestration_workflow_id_created_at_idx').on(
      t.orchestrationWorkflowId,
      t.createdAt,
    ),
    index('orchestration_workflow_events_entity_idx').on(t.entityType, t.entityId),
    index('orchestration_workflow_events_task_id_idx').on(t.taskId),
    index('orchestration_workflow_events_operation_id_idx').on(t.operationId),
  ],
);
