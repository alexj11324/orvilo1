interface TakeOverInput {
  issue: { createdByUserId: string | null };
  /** The caller's active role in the Issue's workspace; absent outside one. */
  role: string | null | undefined;
  userId: string;
}

/**
 * Whether the caller may take an Issue away from the agent executing it
 * without holding Use on that agent. The Issue's creator and the workspace's
 * owners and admins answer for the Issue itself, so an agent they cannot run
 * (withheld, private to someone else) must not be able to keep it. This covers
 * the incumbent only: the successor still needs the caller's Use.
 */
export const mayTakeOverExecution = ({ issue, role, userId }: TakeOverInput): boolean => {
  if (userId && issue.createdByUserId === userId) return true;
  return role === 'owner' || role === 'admin';
};
