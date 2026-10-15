'use client';

import { usePageLockedByOther } from '../usePageLockedByOther';
import PageCopilotConversationBody from './ConversationBody';

export default function Conversation() {
  const lockedByOther = usePageLockedByOther();
  return <PageCopilotConversationBody lockedByOther={lockedByOther} />;
}
