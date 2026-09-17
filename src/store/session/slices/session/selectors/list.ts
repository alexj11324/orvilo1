import { INBOX_SESSION_ID } from '@/const/session';
import { sessionHelpers } from '@/store/session/slices/session/helpers';
import {
  type CustomSessionGroup,
  type GroupMemberWithAgent,
  type OrviloGroupSession,
  type OrviloSession,
  type OrviloSessions,
} from '@/types/session';

import { type SessionStore } from '../../../store';

const defaultSessions = (s: SessionStore): OrviloSessions => s.defaultSessions;

const pinnedSessions = (s: SessionStore): OrviloSessions => s.pinnedSessions;
const customSessionGroups = (s: SessionStore): CustomSessionGroup[] => s.customSessionGroups;

const allSessions = (s: SessionStore): OrviloSessions => s.sessions;

const getSessionById =
  (id: string) =>
  (s: SessionStore): OrviloSession =>
    sessionHelpers.getSessionById(id, allSessions(s));

const currentSession = (s: SessionStore): OrviloSession | undefined => {
  if (!s.activeId) return;

  return allSessions(s).find((i) => i.id === s.activeId);
};

const isInboxSession = (s: SessionStore) => s.activeId === INBOX_SESSION_ID;

const isCurrentSessionGroupSession = (s: SessionStore): boolean => {
  const session = currentSession(s);
  return session?.type === 'group';
};

const currentGroupAgents = (s: SessionStore): GroupMemberWithAgent[] => {
  const session = currentSession(s) as OrviloGroupSession;

  if (session && session.type !== 'group') return [];

  return session ? (session.members ?? []) : [];
};

const isSessionListInit = (s: SessionStore) => s.isSessionsFirstFetchFinished;

const isSomeSessionActive = (s: SessionStore) => !!s.activeId && isSessionListInit(s);

export const sessionSelectors = {
  currentGroupAgents,
  currentSession,
  customSessionGroups,
  defaultSessions,
  getSessionById,
  isCurrentSessionGroupSession,
  isInboxSession,
  isSessionListInit,
  isSomeSessionActive,
  pinnedSessions,
};
