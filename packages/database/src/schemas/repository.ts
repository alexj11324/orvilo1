import type {
  AssociationDecisionStatus,
  AssociationEvidence,
  AssociationRelationKind,
  AssociationSource,
  AssociationSourceKind,
  CheckoutRemoteRole,
  CheckoutStatus,
  RepositoryCoordinate,
  RepositoryStatus,
  RepositoryVisibility,
} from '@orvilo/types';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps, timestamptz } from './_helpers';
import { devices } from './device';
import { projects } from './project';
import { teams } from './team';
import { users } from './user';
import { workspaces } from './workspace';

/**
 * A shared code resource of the workspace (linear-workspace-v3). The stable
 * remote identity is `(provider_host, remote_repository_id)`; the coordinate
 * JSONB is a snapshot that may drift on rename. A fork is a distinct row —
 * origin and upstream remotes never merge into one repository.
 */
export const repositories = pgTable(
  'repositories',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('repositories'))
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    /** Provider host, for example `github.com`. */
    providerHost: text('provider_host').notNull(),
    /** Provider's stable repository id (GitHub repo id); null until verified. */
    remoteRepositoryId: text('remote_repository_id'),
    /** Stable identity for a repository with no verified remote. */
    localOnlyKey: text('local_only_key'),
    /** Last-known coordinate snapshot — not identity. */
    coordinate: jsonb('coordinate').$type<RepositoryCoordinate>().notNull(),
    /** When the remote is a fork, its parent coordinate snapshot. */
    parentCoordinate: jsonb('parent_coordinate').$type<RepositoryCoordinate>(),
    isFork: boolean('is_fork').notNull().default(false),

    status: text('status').$type<RepositoryStatus>().notNull().default('active'),
    visibility: text('visibility').$type<RepositoryVisibility>().notNull().default('public'),
    registeredByUserId: text('registered_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastVerifiedAt: timestamptz('last_verified_at'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('repositories_remote_identity_unique')
      .on(t.workspaceId, t.providerHost, t.remoteRepositoryId)
      .where(sql`${t.remoteRepositoryId} IS NOT NULL`),
    uniqueIndex('repositories_local_only_unique')
      .on(t.workspaceId, t.localOnlyKey)
      .where(sql`${t.localOnlyKey} IS NOT NULL`),
    index('repositories_workspace_id_idx').on(t.workspaceId),
    index('repositories_status_idx').on(t.workspaceId, t.status),
  ],
);

/**
 * An authorized local working copy of a repository on a device. Registering a
 * checkout records code facts only — it never grants execution, push or merge
 * rights, and `canonical_path` is server-side only (never published into
 * external descriptions).
 */
export const repositoryCheckouts = pgTable(
  'repository_checkouts',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    repositoryId: text('repository_id')
      .references(() => repositories.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    /** Nullable so a removed device leaves a repairable record. */
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    authorizedByUserId: text('authorized_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    canonicalPath: text('canonical_path').notNull(),
    remoteUrl: text('remote_url'),
    /** Remote id seen at registration — distinguishes origin vs upstream. */
    remoteRepositoryId: text('remote_repository_id'),
    remoteRole: text('remote_role').$type<CheckoutRemoteRole>().notNull().default('origin'),
    status: text('status').$type<CheckoutStatus>().notNull().default('active'),
    lastVerifiedAt: timestamptz('last_verified_at'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('repository_checkouts_device_path_unique')
      .on(t.deviceId, t.canonicalPath)
      .where(sql`${t.deviceId} IS NOT NULL`),
    index('repository_checkouts_repository_idx').on(t.repositoryId),
    index('repository_checkouts_workspace_id_idx').on(t.workspaceId),
  ],
);

/** Many-to-many link between a project and its code resources. */
export const projectRepositories = pgTable(
  'project_repositories',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    repositoryId: text('repository_id')
      .references(() => repositories.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    addedByUserId: text('added_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_repositories_project_repository_unique').on(t.projectId, t.repositoryId),
    index('project_repositories_repository_idx').on(t.repositoryId),
    index('project_repositories_workspace_id_idx').on(t.workspaceId),
  ],
);

/** Confirmed default execution repositories for a team. */
export const teamRepoDefaults = pgTable(
  'team_repo_defaults',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    teamId: text('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    repositoryId: text('repository_id')
      .references(() => repositories.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    addedByUserId: text('added_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('team_repo_defaults_team_repository_unique').on(t.teamId, t.repositoryId),
    uniqueIndex('team_repo_defaults_team_primary_unique')
      .on(t.teamId)
      .where(sql`${t.isPrimary} = true`),
    index('team_repo_defaults_repository_idx').on(t.repositoryId),
    index('team_repo_defaults_workspace_id_idx').on(t.workspaceId),
  ],
);

/**
 * Auditable record behind every proposed, applied, rejected or revoked link
 * between a domain object and a repository. `input_revision`,
 * `policy_revision` and `decision_revision` freeze the evidence/policy basis
 * so a stale decision cannot silently re-apply after inputs changed.
 */
export const associationDecisions = pgTable(
  'association_decisions',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    sourceKind: text('source_kind').$type<AssociationSourceKind>().notNull(),
    /** Polymorphic source id (project/team/task) — intentionally no FK. */
    sourceId: text('source_id').notNull(),
    relation: text('relation').$type<AssociationRelationKind>().notNull(),
    targetRepositoryId: text('target_repository_id')
      .references(() => repositories.id, { onDelete: 'cascade' })
      .notNull(),

    status: text('status').$type<AssociationDecisionStatus>().notNull().default('proposed'),
    source: text('source').$type<AssociationSource>().notNull(),
    evidence: jsonb('evidence').$type<AssociationEvidence[]>().notNull().default([]),
    confidence: doublePrecision('confidence'),

    inputRevision: bigint('input_revision', { mode: 'number' }).notNull().default(0),
    policyRevision: integer('policy_revision').notNull().default(1),
    decisionRevision: integer('decision_revision').notNull().default(1),

    decidedByUserId: text('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamptz('decided_at'),
    revokedAt: timestamptz('revoked_at'),
    resolutionNote: text('resolution_note'),
    idempotencyKey: text('idempotency_key').notNull(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('association_decisions_workspace_idempotency_unique').on(
      t.workspaceId,
      t.idempotencyKey,
    ),
    index('association_decisions_source_idx').on(t.workspaceId, t.sourceKind, t.sourceId),
    index('association_decisions_target_idx').on(t.targetRepositoryId),
    index('association_decisions_status_idx').on(t.workspaceId, t.status),
  ],
);

// Entity row DTOs (`RepositoryItem`, `RepositoryCheckoutItem`,
// `AssociationDecisionItem`) live in `@orvilo/types`.
export type NewRepository = typeof repositories.$inferInsert;
export type NewRepositoryCheckout = typeof repositoryCheckouts.$inferInsert;
export type ProjectRepositoryItem = typeof projectRepositories.$inferSelect;
export type NewProjectRepository = typeof projectRepositories.$inferInsert;
export type TeamRepoDefaultItem = typeof teamRepoDefaults.$inferSelect;
export type NewTeamRepoDefault = typeof teamRepoDefaults.$inferInsert;
export type NewAssociationDecision = typeof associationDecisions.$inferInsert;
