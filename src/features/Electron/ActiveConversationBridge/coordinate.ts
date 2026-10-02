export interface ActiveConversationCoordinate {
  agentBasePath?: string;
  agentId?: string;
  chatBasePath?: string;
  groupBasePath?: string;
  groupId?: string;
  hash: string;
  isConversation: boolean;
  pathname: string;
  routeAgentId?: string;
  search: string;
  threadId: string | null;
  topicId: string | null;
}

interface ResolveActiveConversationCoordinateOptions {
  activeAgentId?: string;
  params: { aid?: string; gid?: string; topicId?: string };
  resolvedAgentId?: string;
  url: string;
}

export const resolveActiveConversationCoordinate = ({
  params,
  resolvedAgentId,
  activeAgentId,
  url,
}: ResolveActiveConversationCoordinateOptions): ActiveConversationCoordinate => {
  const location = new URL(url, 'https://desktop.local');
  const segments = location.pathname.split('/').filter(Boolean);
  const agentSegmentIndex = segments.lastIndexOf('agent');
  const groupSegmentIndex = params.gid ? segments.lastIndexOf('group') : -1;
  const chatSegmentIndex = segments.lastIndexOf('chat');
  const suffixLength = agentSegmentIndex < 0 ? -1 : segments.length - agentSegmentIndex - 2;
  const agentConversation =
    !!params.aid &&
    agentSegmentIndex >= 0 &&
    (suffixLength === 0 || (suffixLength === 1 && params.topicId !== undefined));
  const groupSuffixLength = groupSegmentIndex < 0 ? -1 : segments.length - groupSegmentIndex - 2;
  const groupConversation =
    !!params.gid &&
    groupSegmentIndex >= 0 &&
    (groupSuffixLength === 0 || (groupSuffixLength === 1 && params.topicId !== undefined));
  // `/chat` is the canonical conversation route — no agent segment, the topic
  // resolves its owner. `/chat` alone and `/chat/new` are the blank composer;
  // `/chat/:topicId` carries the topic id in params.
  const chatSuffixLength = chatSegmentIndex < 0 ? -1 : segments.length - chatSegmentIndex - 1;
  const chatConversation =
    chatSegmentIndex >= 0 &&
    (chatSuffixLength === 0 ||
      (chatSuffixLength === 1 &&
        (params.topicId !== undefined || segments[chatSegmentIndex + 1] === 'new')));
  const isConversation = agentConversation || groupConversation || chatConversation;
  const agentBasePath =
    agentSegmentIndex >= 0 ? `/${segments.slice(0, agentSegmentIndex + 2).join('/')}` : undefined;
  const groupBasePath =
    groupSegmentIndex >= 0 ? `/${segments.slice(0, groupSegmentIndex + 2).join('/')}` : undefined;
  const chatBasePath =
    chatSegmentIndex >= 0 ? `/${segments.slice(0, chatSegmentIndex + 1).join('/')}` : undefined;
  // On `/chat` the route itself carries no agent — the store's activeAgentId
  // (bound to the topic owner by TopicOwnerSync) plays the route-agent role so
  // the bridge keeps the conversation mapped instead of treating it as a
  // leave-Agent surface.
  const chatAgentId = chatConversation ? activeAgentId : undefined;

  return {
    agentBasePath,
    agentId: params.aid ? resolvedAgentId || params.aid : chatAgentId,
    chatBasePath,
    groupBasePath,
    groupId: groupSegmentIndex >= 0 ? params.gid : undefined,
    hash: location.hash,
    isConversation,
    pathname: location.pathname,
    routeAgentId: params.aid ?? chatAgentId,
    search: location.search,
    threadId: isConversation ? location.searchParams.get('thread') : null,
    topicId: isConversation ? params.topicId || null : null,
  };
};

export const buildActiveConversationUrl = (
  coordinate: ActiveConversationCoordinate,
  topicId: string | null,
  threadId: string | null,
) => {
  const basePath = coordinate.groupBasePath || coordinate.agentBasePath || coordinate.chatBasePath;
  if (!basePath) {
    return `${coordinate.pathname}${coordinate.search}${coordinate.hash}`;
  }

  const searchParams = new URLSearchParams(coordinate.search);
  searchParams.delete('topic');

  if (threadId) searchParams.set('thread', threadId);
  else searchParams.delete('thread');

  // The `/chat` blank composer is `/chat/new`, not bare `/chat` (which
  // redirects to it).
  const pathname = topicId
    ? `${basePath}/${topicId}`
    : coordinate.chatBasePath && !coordinate.agentBasePath && !coordinate.groupBasePath
      ? `${basePath}/new`
      : basePath;
  const search = searchParams.toString();

  return `${pathname}${search ? `?${search}` : ''}${coordinate.hash}`;
};
