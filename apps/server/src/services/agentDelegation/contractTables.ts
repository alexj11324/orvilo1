/**
 * Single import site for the teammate-owned collaboration schema. The tables
 * below land in `packages/database` on the shared contract — keep every
 * drizzle reference behind this file so a renamed export surfaces here only.
 */
export {
  actionApprovals,
  agents,
  eventOutbox,
  executionGrants,
  projectMembers,
  taskInputs,
  tasks,
  taskTopics,
  topics,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
export { getActiveWorkspaceMembershipRole } from '@/database/models/workspace';
export { insertOutboxEvent, newEventId } from '@/database/models/eventOutbox';
export { ProjectMemberModel } from '@/database/models/projectMember';
export { WorkspaceMemberModel } from '@/database/models/workspaceMember';
