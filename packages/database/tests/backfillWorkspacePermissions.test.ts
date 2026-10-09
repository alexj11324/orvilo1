import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  backfillWorkspacePermissions,
  runReviewedPermissionBackfill,
} from '../../../scripts/backfillWorkspacePermissions';

const targetId = '11111111-1111-4111-8111-111111111111';
const oldId = '22222222-2222-4222-8222-222222222222';
const member = { authzVersion: 1, role: 'owner' };
const resource = { ownerId: 'owner', resourceId: 'agent', visibility: 'private' };
const creator = {
  ...resource,
  expectedGrant: null,
  kind: 'agent-use',
  member,
  targetGrantId: targetId,
  userId: 'owner',
};
const manager = {
  ...resource,
  expectedMembership: null,
  kind: 'project-manager',
  member,
  resourceId: 'project',
  targetMembershipId: targetId,
  userId: 'owner',
};
const plan = (entries: unknown[] = [creator]) => ({ entries, workspaceId: 'workspace' });
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE agents (id text PRIMARY KEY, workspace_id text, user_id text, visibility text, deleted_at timestamptz, updated_at timestamptz);
    CREATE TABLE projects (LIKE agents INCLUDING ALL);
    CREATE TABLE workspace_members (workspace_id text, user_id text, role text, authz_version integer DEFAULT 1, deleted_at timestamptz, suspended_at timestamptz, PRIMARY KEY(workspace_id,user_id));
    CREATE TABLE resource_permissions (id uuid PRIMARY KEY, workspace_id text, resource_type text, resource_id text, user_id text, access_level text, created_by text, updated_at timestamptz);
    CREATE UNIQUE INDEX grants_subject ON resource_permissions(workspace_id,resource_type,resource_id,user_id) WHERE user_id IS NOT NULL;
    CREATE TABLE project_members (id uuid PRIMARY KEY, workspace_id text, project_id text, user_id text, role text, authz_version integer DEFAULT 1, deleted_at timestamptz, suspended_at timestamptz, created_by text, updated_at timestamptz, UNIQUE(project_id,user_id));
    INSERT INTO agents VALUES ('agent','workspace','owner','private',NULL,NULL);
    INSERT INTO projects VALUES ('project','workspace','owner','private',NULL,NULL);
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('workspace','owner','owner'),('workspace','member','member');
    INSERT INTO resource_permissions(id,workspace_id,resource_type,resource_id,access_level) VALUES ('${oldId}','workspace','agent','agent','edit');
  `);
});

afterEach(async () => {
  await db.close();
});

const run = (
  input = plan(),
  apply = false,
  operation: 'permissions' | 'publication' = 'permissions',
) => backfillWorkspacePermissions(db, input, { apply, operation, workspaceId: 'workspace' });

describe('reviewed permission backfill', () => {
  it('retains the exact receipt after drift rolls back all writes', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'permission-backfill-'));
    const receiptPath = path.join(directory, 'apply.json');
    const options = { apply: true, receiptPath, workspaceId: 'workspace' };
    try {
      const input = plan([creator, { ...manager, ownerId: 'changed-owner' }]);
      await expect(runReviewedPermissionBackfill(db, input, options)).rejects.toThrow('owner');
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      expect(receipt).toEqual({
        operation: 'permissions',
        planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        targets: [
          { kind: 'agent-use', resourceId: 'agent', userId: 'owner' },
          { kind: 'project-manager', resourceId: 'project', userId: 'owner' },
        ],
        workspaceId: 'workspace',
      });
      expect(
        (await db.query('SELECT id FROM resource_permissions WHERE user_id IS NOT NULL')).rows,
      ).toEqual([]);
      await expect(runReviewedPermissionBackfill(db, input, options)).rejects.toThrow(
        'Consumed plan grant',
      );
      await chmod(receiptPath, 0o644);
      await expect(runReviewedPermissionBackfill(db, input, options)).rejects.toThrow('mode 0600');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires a receipt and denies consumed grant downgrade or membership removal', async () => {
    await expect(
      runReviewedPermissionBackfill(db, plan(), { apply: true, workspaceId: 'workspace' }),
    ).rejects.toThrow('receipt');
    const directory = await mkdtemp(path.join(tmpdir(), 'permission-backfill-'));
    const options = {
      apply: true,
      receiptPath: path.join(directory, 'apply.json'),
      workspaceId: 'workspace',
    };
    try {
      const input = plan([creator, manager]);
      await runReviewedPermissionBackfill(db, input, options);
      await db.query("UPDATE resource_permissions SET access_level='edit' WHERE user_id='owner'");
      await expect(runReviewedPermissionBackfill(db, input, options)).rejects.toThrow(
        'Consumed plan grant',
      );
      await db.query("UPDATE resource_permissions SET access_level='use' WHERE user_id='owner'");
      await db.query('DELETE FROM project_members');
      await expect(runReviewedPermissionBackfill(db, input, options)).rejects.toThrow(
        'Consumed plan membership',
      );
      expect((await db.query('SELECT id FROM project_members')).rows).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('denies consumed publication after a resource becomes private again', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'permission-backfill-'));
    const options = {
      apply: true,
      operation: 'publication' as const,
      receiptPath: path.join(directory, 'apply.json'),
      workspaceId: 'workspace',
    };
    try {
      const input = plan([{ ...resource, kind: 'publish-agent', member }]);
      await runReviewedPermissionBackfill(db, input, options);
      expect((await runReviewedPermissionBackfill(db, input, options)).changes).toEqual([]);
      await db.query("UPDATE agents SET visibility='private'");
      await expect(runReviewedPermissionBackfill(db, input, options)).rejects.toThrow(
        'Consumed plan publication',
      );
      expect((await db.query('SELECT visibility FROM agents')).rows).toEqual([
        { visibility: 'private' },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('consumes an apply receipt and never restores a revoked grant on replay', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'permission-backfill-'));
    const receiptPath = path.join(directory, 'apply.json');
    const options = { apply: true, receiptPath, workspaceId: 'workspace' };
    try {
      expect((await runReviewedPermissionBackfill(db, plan(), options)).changes).toHaveLength(1);
      expect((await stat(receiptPath)).mode & 0o777).toBe(0o600);
      expect((await runReviewedPermissionBackfill(db, plan(), options)).changes).toEqual([]);
      await db.query('DELETE FROM resource_permissions WHERE user_id=$1', ['owner']);
      await expect(runReviewedPermissionBackfill(db, plan(), options)).rejects.toThrow(
        'Consumed plan grant',
      );
      expect(
        (await db.query('SELECT id FROM resource_permissions WHERE user_id IS NOT NULL')).rows,
      ).toEqual([]);
      await expect(
        runReviewedPermissionBackfill(db, plan([{ ...creator, visibility: 'public' }]), options),
      ).rejects.toThrow('receipt scope/digest');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('defaults to dry run and excludes global edit from Use', async () => {
    expect((await run()).changes).toHaveLength(1);
    expect((await db.query('SELECT user_id,access_level FROM resource_permissions')).rows).toEqual([
      { access_level: 'edit', user_id: null },
    ]);
    await expect(
      run(
        plan([{ ...creator, userId: 'member', member: { authzVersion: 1, role: 'member' } }]),
        true,
      ),
    ).rejects.toThrow('Only reviewed creator');
  });

  it('applies exact creator grants and absent manager once, without publishing private rows', async () => {
    expect((await run(plan([creator, manager]), true)).changes).toHaveLength(2);
    expect((await run(plan([creator, manager]), true)).changes).toEqual([]);
    expect(
      (
        await db.query(
          'SELECT user_id,access_level FROM resource_permissions WHERE user_id IS NOT NULL',
        )
      ).rows,
    ).toEqual([{ access_level: 'use', user_id: 'owner' }]);
    expect((await db.query('SELECT role,authz_version FROM project_members')).rows).toEqual([
      { authz_version: 1, role: 'manager' },
    ]);
    expect((await db.query('SELECT visibility FROM agents')).rows).toEqual([
      { visibility: 'private' },
    ]);
  });

  it('converts reviewed per-user edit and active commenter once', async () => {
    await db.query(
      "INSERT INTO resource_permissions(id,workspace_id,resource_type,resource_id,user_id,access_level) VALUES ($1,'workspace','agent','agent','member','edit')",
      [targetId],
    );
    await db.query(
      "INSERT INTO project_members(id,workspace_id,project_id,user_id,role) VALUES ($1,'workspace','project','member','commenter')",
      [oldId],
    );
    const entries = [
      {
        ...creator,
        expectedGrant: { id: targetId, level: 'edit' },
        member: { authzVersion: 1, role: 'member' },
        userId: 'member',
      },
      {
        ...resource,
        expectedMembership: { authzVersion: 1, id: oldId, role: 'commenter' },
        kind: 'project-participant',
        member: { authzVersion: 1, role: 'member' },
        resourceId: 'project',
        userId: 'member',
      },
    ];
    expect((await run(plan(entries), true)).changes).toHaveLength(2);
    expect((await run(plan(entries), true)).changes).toEqual([]);
    expect((await db.query('SELECT role,authz_version FROM project_members')).rows).toEqual([
      { authz_version: 2, role: 'contributor' },
    ]);
  });

  it('preserves inactive membership and rolls back earlier grant inserts', async () => {
    await db.query(
      "INSERT INTO project_members(id,workspace_id,project_id,user_id,role,suspended_at) VALUES ($1,'workspace','project','owner','contributor',NOW())",
      [targetId],
    );
    await expect(run(plan([creator, manager]), true)).rejects.toThrow('inactive');
    expect(
      (await db.query('SELECT user_id FROM resource_permissions WHERE user_id IS NOT NULL')).rows,
    ).toEqual([]);
    expect(
      (await db.query('SELECT role,suspended_at IS NOT NULL AS suspended FROM project_members'))
        .rows,
    ).toEqual([{ role: 'contributor', suspended: true }]);
  });

  it('rejects workspace, resource ownership, membership version and grant drift', async () => {
    await expect(run({ ...plan(), workspaceId: 'other' }, true)).rejects.toThrow('scope');
    await expect(run(plan([{ ...creator, ownerId: 'other' }]), true)).rejects.toThrow('owner');
    await expect(
      run(plan([{ ...creator, member: { authzVersion: 2, role: 'owner' } }]), true),
    ).rejects.toThrow('member drift');
    await db.query(
      "INSERT INTO resource_permissions(id,workspace_id,resource_type,resource_id,user_id,access_level) VALUES ($1,'workspace','agent','agent','owner','view')",
      [targetId],
    );
    await expect(run(plan(), true)).rejects.toThrow('grant drift');
    expect(
      (await db.query('SELECT access_level FROM resource_permissions WHERE user_id=$1', ['owner']))
        .rows,
    ).toEqual([{ access_level: 'view' }]);
    await db.query("UPDATE agents SET workspace_id='other'");
    await expect(run(plan(), true)).rejects.toThrow('scope');
  });

  it('requires separate publication and preserves every existing grant', async () => {
    await run(plan(), true);
    const publication = plan([{ ...resource, kind: 'publish-agent', member }]);
    await expect(run(publication, true)).rejects.toThrow('separate');
    const before = (await db.query('SELECT * FROM resource_permissions ORDER BY id')).rows;
    expect((await run(publication, false, 'publication')).changes).toHaveLength(1);
    expect((await db.query('SELECT visibility FROM agents')).rows).toEqual([
      { visibility: 'private' },
    ]);
    expect((await run(publication, true, 'publication')).changes).toHaveLength(1);
    expect((await run(publication, true, 'publication')).changes).toEqual([]);
    expect((await db.query('SELECT * FROM resource_permissions ORDER BY id')).rows).toEqual(before);
  });
});
