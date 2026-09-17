from pathlib import Path
import json
import uuid


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}')
    p.write_text(text.replace(old, new, 1))

# Active-membership fence for internal workspace dependency dispatch.
task = 'packages/database/src/models/task.ts'
replace_once(task, "  desc,\n  eq,\n", "  desc,\n  eq,\n  exists,\n")
replace_once(task, "import { works } from '../schemas/work';\n", "import { works } from '../schemas/work';\nimport { workspaceMembers } from '../schemas/workspace';\n")
replace_once(
    task,
    """          sql`${tasks.isDeleted} IS NOT TRUE`,
          this.seqOwnership(),
        ),
      );
""",
    """          sql`${tasks.isDeleted} IS NOT TRUE`,
          this.seqOwnership(),
          this.workspaceId
            ? exists(
                this.db
                  .select({ one: sql`1` })
                  .from(workspaceMembers)
                  .where(
                    and(
                      eq(workspaceMembers.workspaceId, this.workspaceId),
                      eq(workspaceMembers.userId, tasks.createdByUserId),
                      isNull(workspaceMembers.deletedAt),
                    ),
                  ),
              )
            : undefined,
        ),
      );
""",
)

# DB regression: workspace fixtures now represent actual active membership and
# a removed creator cannot be resurrected by another member's completion.
test = 'packages/database/src/models/__tests__/taskDependency.test.ts'
replace_once(
    test,
    "import { taskDependencies, tasks, users, workspaces } from '../../schemas';\n",
    "import { taskDependencies, tasks, users, workspaceMembers, workspaces } from '../../schemas';\n",
)
replace_once(
    test,
    """    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Review',
      slug: workspaceId,
      primaryOwnerId: userId,
    });
    return {
""",
    """    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Review',
      slug: workspaceId,
      primaryOwnerId: userId,
    });
    await db.insert(workspaceMembers).values([
      { workspaceId, userId, role: 'owner' },
      { workspaceId, userId: otherUserId, role: 'member' },
    ]);
    return {
""",
)
marker = """  it('does not let a caller trigger internal discovery from an inaccessible source', async () => {
"""
addition = """  it('does not dispatch a private dependent owned by a departed workspace member', async () => {
    const { owner, member } = await workspace();
    const upstream = await member.create({ instruction: 'Public upstream' });
    const dependent = await owner.create({
      instruction: 'Private dependent',
      visibility: 'private',
    });
    await owner.addDependency(dependent.id, upstream.id);
    await db
      .update(workspaceMembers)
      .set({ deletedAt: new Date() })
      .where(eq(workspaceMembers.userId, userId));
    await member.updateStatus(upstream.id, 'completed');
    expect(await member.getUnlockedTasks(upstream.id)).toEqual([]);
    expect(await owner.findById(dependent.id)).toMatchObject({ id: dependent.id, status: 'backlog' });
  });

"""
replace_once(test, marker, addition + marker)

# 0169 is data-only, so its Drizzle schema snapshot is identical to 0168 apart
# from the snapshot chain identifiers.
snapshot_prev = Path('packages/database/migrations/meta/0168_snapshot.json')
snapshot_next = Path('packages/database/migrations/meta/0169_snapshot.json')
data = json.loads(snapshot_prev.read_text())
prev_id = data['id']
data['prevId'] = prev_id
data['id'] = str(uuid.uuid4())
snapshot_next.write_text(json.dumps(data, indent=2) + '\n')

print('PR #26 follow-up fixes applied')
