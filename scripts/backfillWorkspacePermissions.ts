/**
 * bun scripts/backfillWorkspacePermissions.ts --workspace=ID --plan=reviewed.json
 * Add --apply --receipt=PATH only after reviewing the dry run. Publication is a separate plan
 * with --operation=publication; the default operation is permissions.
 * DATABASE_URL is required. No automatic startup invocation or implicit IDs.
 */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import pg from 'pg';
import { z } from 'zod';

const id = z.string().min(1);
const membership = z.object({
  authzVersion: z.number().int().positive(),
  role: z.enum(['owner', 'admin', 'member']),
});
const grant = z.object({ id: z.uuid(), level: z.enum(['view', 'use', 'edit']) });
const projectMembership = z.object({
  authzVersion: z.number().int().positive(),
  id: z.uuid(),
  role: z.enum(['manager', 'contributor', 'commenter', 'viewer']),
});
const resource = {
  ownerId: id,
  resourceId: id,
  visibility: z.enum(['private', 'public']),
};
const entry = z.discriminatedUnion('kind', [
  z.object({
    ...resource,
    expectedGrant: grant.nullable(),
    kind: z.literal('agent-use'),
    member: membership,
    targetGrantId: z.uuid(),
    userId: id,
  }),
  z.object({
    ...resource,
    expectedMembership: projectMembership.nullable(),
    kind: z.literal('project-manager'),
    member: membership,
    targetMembershipId: z.uuid(),
    userId: id,
  }),
  z.object({
    ...resource,
    expectedMembership: projectMembership,
    kind: z.literal('project-participant'),
    member: membership,
    userId: id,
  }),
  z.object({ ...resource, kind: z.enum(['publish-agent', 'publish-project']), member: membership }),
]);
export const permissionBackfillPlan = z.object({
  entries: z.array(entry).min(1).max(1000),
  workspaceId: id,
});

interface QueryClient {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/** Exact reviewed snapshot or its own resulting state; every other state is drift. */
const assertEqual = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} drift`);
};

export const backfillWorkspacePermissions = async (
  client: QueryClient,
  input: unknown,
  options: {
    apply?: boolean;
    operation?: 'permissions' | 'publication';
    previouslyApplied?: boolean;
    workspaceId: string;
  },
) => {
  const plan = permissionBackfillPlan.parse(input);
  if (plan.workspaceId !== options.workspaceId) throw new Error('Workspace scope mismatch');
  const publication = options.operation === 'publication';
  const seen = new Set<string>();
  for (const item of plan.entries) {
    if (item.kind.startsWith('publish-') !== publication) {
      throw new Error('Publication requires a separate publication-only plan');
    }
    const key = `${item.kind.includes('agent') ? 'agent' : 'project'}:${item.resourceId}:${'userId' in item ? item.userId : ''}`;
    if (seen.has(key)) throw new Error('Duplicate reviewed target');
    seen.add(key);
  }
  const changes: { kind: string; resourceId: string; userId?: string }[] = [];
  await client.query(
    options.apply
      ? 'BEGIN ISOLATION LEVEL SERIALIZABLE'
      : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  try {
    for (const item of plan.entries) {
      const table = item.kind.includes('agent') ? 'agents' : 'projects';
      const lock = options.apply ? ' FOR UPDATE' : '';
      const [current] = (
        await client.query(
          `SELECT user_id, visibility FROM ${table} WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL${lock}`,
          [item.resourceId, plan.workspaceId],
        )
      ).rows;
      if (!current || current.user_id !== item.ownerId)
        throw new Error('Resource scope/owner/status drift');
      const subjectId = 'userId' in item ? item.userId : item.ownerId;
      const [member] = (
        await client.query(
          `SELECT role, authz_version FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND deleted_at IS NULL AND suspended_at IS NULL${lock}`,
          [plan.workspaceId, subjectId],
        )
      ).rows;
      if (!member) throw new Error('Workspace member inactive or absent');
      assertEqual(
        { authzVersion: member.authz_version, role: member.role },
        item.member,
        'Workspace member',
      );
      if (publication) {
        if (
          item.visibility !== 'private' ||
          !['private', 'public'].includes(String(current.visibility))
        ) {
          throw new Error('Publication visibility drift');
        }
        if (current.visibility === 'public') continue;
        if (options.previouslyApplied)
          throw new Error('Consumed plan publication drift; repreview and reapprove');
        if (options.apply)
          await client.query(
            `UPDATE ${table} SET visibility='public', updated_at=NOW() WHERE id=$1 AND workspace_id=$2`,
            [item.resourceId, plan.workspaceId],
          );
      } else {
        assertEqual(current.visibility, item.visibility, 'Resource visibility');
        if (!('userId' in item)) throw new Error('Missing reviewed member');
        if (item.kind === 'agent-use') {
          const [row] = (
            await client.query(
              `SELECT id, access_level FROM resource_permissions WHERE workspace_id=$1 AND resource_type='agent' AND resource_id=$2 AND user_id=$3${lock}`,
              [plan.workspaceId, item.resourceId, item.userId],
            )
          ).rows;
          const expected = item.expectedGrant;
          if (expected === null && item.userId !== item.ownerId)
            throw new Error('Only reviewed creator implicit Use can create a grant');
          if (
            expected &&
            (!['use', 'edit'].includes(expected.level) || expected.id !== item.targetGrantId)
          ) {
            throw new Error('Only reviewed per-user legacy use/edit can convert');
          }
          const actual = row ? { id: row.id, level: row.access_level } : null;
          if (row?.id === item.targetGrantId && row.access_level === 'use') continue;
          if (options.previouslyApplied)
            throw new Error('Consumed plan grant missing or changed; repreview and reapprove');
          assertEqual(actual, expected, 'Agent grant');
          if (options.apply) {
            if (row)
              await client.query(
                "UPDATE resource_permissions SET access_level='use', updated_at=NOW() WHERE id=$1",
                [item.targetGrantId],
              );
            else
              await client.query(
                "INSERT INTO resource_permissions (id,workspace_id,resource_type,resource_id,user_id,access_level,created_by) VALUES ($1,$2,'agent',$3,$4,'use',$4)",
                [item.targetGrantId, plan.workspaceId, item.resourceId, item.userId],
              );
          }
        } else {
          const [row] = (
            await client.query(
              `SELECT id, role, authz_version, deleted_at, suspended_at, workspace_id FROM project_members WHERE project_id=$1 AND user_id=$2${lock}`,
              [item.resourceId, item.userId],
            )
          ).rows;
          if (
            row &&
            (row.workspace_id !== plan.workspaceId || row.deleted_at || row.suspended_at)
          ) {
            throw new Error('Project membership inactive or scope drift');
          }
          const role = item.kind === 'project-manager' ? 'manager' : 'contributor';
          const expected = item.expectedMembership;
          const targetId =
            item.kind === 'project-manager' ? item.targetMembershipId : item.expectedMembership.id;
          if (item.kind === 'project-manager' && item.userId !== item.ownerId)
            throw new Error('Manager initialization requires creator');
          if (expected && expected.id !== targetId) throw new Error('Membership ID drift');
          if (
            item.kind === 'project-participant' &&
            !['commenter', 'viewer'].includes(item.expectedMembership.role)
          ) {
            throw new Error('Only reviewed commenter/viewer can convert');
          }
          if (
            row?.id === targetId &&
            row.role === role &&
            row.authz_version === (expected ? expected.authzVersion + 1 : 1)
          )
            continue;
          assertEqual(
            row ? { authzVersion: row.authz_version, id: row.id, role: row.role } : null,
            expected,
            'Project membership',
          );
          if (row?.role === role) continue;
          if (options.previouslyApplied)
            throw new Error('Consumed plan membership drift; repreview and reapprove');
          if (options.apply) {
            if (row)
              await client.query(
                'UPDATE project_members SET role=$2, authz_version=authz_version+1, updated_at=NOW() WHERE id=$1',
                [targetId, role],
              );
            else
              await client.query(
                "INSERT INTO project_members (id,workspace_id,project_id,user_id,role,created_by) VALUES ($1,$2,$3,$4,'manager',$4)",
                [targetId, plan.workspaceId, item.resourceId, item.userId],
              );
          }
        }
      }
      changes.push({
        kind: item.kind,
        resourceId: item.resourceId,
        ...('userId' in item ? { userId: item.userId } : {}),
      });
    }
    await client.query(options.apply ? 'COMMIT' : 'ROLLBACK');
    return { apply: Boolean(options.apply), changes, workspaceId: plan.workspaceId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

/** Claim before BEGIN; failed/unknown apply consumes the plan, with no recovery loop. */
export const runReviewedPermissionBackfill = async (
  client: QueryClient,
  input: unknown,
  options: {
    apply?: boolean;
    operation?: 'permissions' | 'publication';
    receiptPath?: string;
    workspaceId: string;
  },
) => {
  const plan = permissionBackfillPlan.parse(input);
  if (plan.workspaceId !== options.workspaceId) throw new Error('Workspace scope mismatch');
  let previouslyApplied = false;
  if (options.apply) {
    if (!options.receiptPath) throw new Error('Apply requires an exclusive local --receipt=PATH');
    const operation = options.operation ?? 'permissions';
    const receipt = {
      operation,
      planHash: createHash('sha256').update(JSON.stringify({ operation, plan })).digest('hex'),
      targets: plan.entries.map((item) => ({
        kind: item.kind,
        resourceId: item.resourceId,
        ...('userId' in item ? { userId: item.userId } : {}),
      })),
      workspaceId: plan.workspaceId,
    };
    try {
      await writeFile(options.receiptPath, JSON.stringify(receipt) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (((await stat(options.receiptPath)).mode & 0o777) !== 0o600)
        throw new Error('Receipt must be mode 0600', { cause: error });
      assertEqual(
        JSON.parse(await readFile(options.receiptPath, 'utf8')),
        receipt,
        'Apply receipt scope/digest',
      );
      previouslyApplied = true;
    }
  }
  return backfillWorkspacePermissions(client, plan, { ...options, previouslyApplied });
};

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      operation: { type: 'string', default: 'permissions' },
      plan: { type: 'string' },
      receipt: { type: 'string' },
      workspace: { type: 'string' },
    },
  });
  if (
    !values.plan ||
    !values.workspace ||
    !process.env.DATABASE_URL ||
    (values.apply && !values.receipt) ||
    !['permissions', 'publication'].includes(values.operation)
  ) {
    throw new Error(
      'Require DATABASE_URL, --workspace=ID, --plan=PATH, valid --operation and --receipt=PATH for apply',
    );
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    console.log(
      JSON.stringify(
        await runReviewedPermissionBackfill(
          client,
          JSON.parse(await readFile(values.plan, 'utf8')),
          {
            apply: values.apply,
            operation: values.operation as 'permissions' | 'publication',
            receiptPath: values.receipt,
            workspaceId: values.workspace,
          },
        ),
      ),
    );
  } catch (error) {
    // PostgreSQL/connection errors can include connection details; emit only
    // their code. Plan and snapshot errors contain permission metadata only.
    console.error(
      error instanceof Error && !('code' in error)
        ? error.message
        : `Database backfill failed (${error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown'}); recheck connectivity and schema.`,
    );
    if (values.apply)
      console.error(
        'Apply receipt is retained if claimed; repreview and approve a new plan after failure or drift.',
      );
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
