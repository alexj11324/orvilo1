export const reassignMemberOptions = (
  members: Array<{ userId: string }>,
  currentAssigneeUserId?: string | null,
): Array<{ label: string; value: string }> =>
  members
    .filter((member) => member.userId !== currentAssigneeUserId)
    .map((member) => ({ label: member.userId, value: member.userId }));
