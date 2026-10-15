export interface MentionableWorkspaceMember {
  user?: {
    avatar?: string | null;
    email?: string | null;
    fullName?: string | null;
    username?: string | null;
  } | null;
  userId: string;
}

export const createTopicCommentMentionItems = (members: MentionableWorkspaceMember[]) => {
  const seen = new Set<string>();

  return members.flatMap((member) => {
    if (!member.userId || seen.has(member.userId)) return [];
    seen.add(member.userId);

    const profile = member.user;
    const label = profile?.fullName || profile?.username || profile?.email || member.userId;
    const description = profile?.email && profile.email !== label ? profile.email : undefined;

    return [
      {
        avatar: profile?.avatar || label,
        key: `member-${member.userId}`,
        label,
        metadata: {
          description,
          id: member.userId,
          timestamp: 0,
          type: 'member',
        },
      },
    ];
  });
};

export const writeTopicCommentMentionMarkdown = (mention: {
  label?: string;
  metadata?: Record<string, unknown>;
}) => `<mention name="${mention.label ?? ''}" id="${String(mention.metadata?.id ?? '')}" />`;
