'use client';

import type { FollowUpChip } from '@orvilo/types';
import { memo, useCallback, useMemo } from 'react';

import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { messageStateSelectors, useConversationStore } from '@/features/Conversation/store';
import { followUpActionSelectors, useFollowUpActionStore } from '@/store/followUpAction';

interface FollowUpChipsProps {
  conversationKey: string;
  messageId: string;
}

const FollowUpChips = memo<FollowUpChipsProps>(({ conversationKey, messageId }) => {
  const childIdsKey = useConversationStore((s) => {
    const m = s.displayMessages.find((x) => x.id === messageId);
    return m?.children?.map((c) => c.id).join('|') ?? '';
  });
  const selector = useMemo(
    () => followUpActionSelectors.chipsFor({ childIdsKey, conversationKey, messageId }),
    [childIdsKey, conversationKey, messageId],
  );
  const chips = useFollowUpActionStore(selector);
  const fillInputMessage = useConversationStore((s) => s.fillInputMessage);
  const isGenerating = useConversationStore(
    messageStateSelectors.isAssistantGroupItemGenerating(messageId),
  );

  const handleClick = useCallback(
    (chip: FollowUpChip) => {
      fillInputMessage(chip.message);
    },
    [fillInputMessage],
  );

  if (chips.length === 0 || isGenerating) return null;

  return (
    <Suggestions>
      {chips.map((chip, i) => (
        <Suggestion
          aria-label={chip.label}
          key={`${messageId}-${i}`}
          suggestion={chip.message}
          onClick={() => handleClick(chip)}
        >
          <span>{chip.label}</span>
        </Suggestion>
      ))}
    </Suggestions>
  );
});

FollowUpChips.displayName = 'FollowUpChips';

export default FollowUpChips;
