import { t } from 'i18next';

import { DEFAULT_AVATAR } from '@/const/meta';
import { DEFAULT_AGENT_ORVILO_SESSION } from '@/const/session';
import { type MetaData } from '@/types/meta';
import {
  type OrviloAgentSession,
  type OrviloGroupSession,
  type OrviloSession,
  type OrviloSessions,
} from '@/types/session';

export const getSessionPinned = (session: OrviloSession) => session.pinned;

const getAvatar = (s: MetaData) => s.avatar || DEFAULT_AVATAR;
const getTitle = (s: MetaData) => s.title || t('defaultSession', { ns: 'common' });

const getSessionById = (
  id: string,
  sessions: OrviloSessions,
): OrviloAgentSession | OrviloGroupSession => {
  const session = sessions.find((s) => s.id === id);

  if (!session) return DEFAULT_AGENT_ORVILO_SESSION;

  return session;
};

export const sessionHelpers = {
  getAvatar,
  getSessionById,
  getSessionPinned,
  getTitle,
};
