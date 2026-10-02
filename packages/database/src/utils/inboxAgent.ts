import { DEFAULT_INBOX_AVATAR, DEFAULT_INBOX_TITLE, INBOX_SESSION_ID } from '@orvilo/const';

interface InboxAgentIdentity {
  slug?: string | null;
}

interface InboxAgentMeta {
  avatar: string | null;
  title: string | null;
}

const isBlank = (value: string | null | undefined) => !value || value.trim().length === 0;

// The lobehub asset pack — static avatars under public/avatars and the
// fluent-emoji art served from npmmirror — was removed with the rebrand.
// Rows still referencing it would render a broken image instead of the real
// fallback (the builtin spec emoji via applyBuiltinIdentity, or name
// initials), so those references count as no avatar at all.
const REMOVED_ASSET_AVATAR = /^(?:\/avatars\/|https?:\/\/[^/]*npmmirror\.com\/@lobehub\/)/;

export const isInboxAgentIdentity = ({ slug }: InboxAgentIdentity) => slug === INBOX_SESSION_ID;

export function normalizeInboxAgentTitle(
  title: string | null,
  identity: InboxAgentIdentity,
): string | null;
export function normalizeInboxAgentTitle(
  title: string | null | undefined,
  identity: InboxAgentIdentity,
): string | null | undefined;
export function normalizeInboxAgentTitle(
  title: string | null | undefined,
  identity: InboxAgentIdentity,
) {
  return isInboxAgentIdentity(identity) && isBlank(title) ? DEFAULT_INBOX_TITLE : title;
}

export function normalizeInboxAgentAvatar(
  avatar: string | null,
  identity: InboxAgentIdentity,
): string | null;
export function normalizeInboxAgentAvatar(
  avatar: string | null | undefined,
  identity: InboxAgentIdentity,
): string | null | undefined;
export function normalizeInboxAgentAvatar(
  avatar: string | null | undefined,
  identity: InboxAgentIdentity,
) {
  const normalized = avatar && REMOVED_ASSET_AVATAR.test(avatar.trim()) ? null : avatar;
  return isInboxAgentIdentity(identity) && isBlank(normalized) ? DEFAULT_INBOX_AVATAR : normalized;
}

export const normalizeInboxAgentMeta = <T extends InboxAgentMeta>(
  agent: T,
  identity: InboxAgentIdentity = agent as T & InboxAgentIdentity,
): T => ({
  ...agent,
  avatar: normalizeInboxAgentAvatar(agent.avatar, identity),
  title: normalizeInboxAgentTitle(agent.title, identity),
});
