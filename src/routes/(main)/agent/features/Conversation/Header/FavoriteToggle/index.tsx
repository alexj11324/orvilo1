'use client';

import { ActionIcon } from '@lobehub/ui/base-ui';
import { Star } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { useAgentContext } from '@/features/Conversation/useAgentContext';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

/**
 * The populated-chat header's favorite switch — the reference's header order
 * is title → favorite → chat options → toolbar. Renders only once a topic
 * exists, so the new-chat header stays a bare title trigger like the
 * reference. The same toggle remains available inside the `⋯` menu.
 */
const FavoriteToggle = memo(() => {
  const { t } = useTranslation('topic');
  const { topicId } = useAgentContext();
  const isFavorite = useChatStore((s) =>
    topicId ? !!topicSelectors.getTopicById(topicId)(s)?.favorite : false,
  );
  const favoriteTopic = useChatStore((s) => s.favoriteTopic);

  if (!topicId) return null;

  const label = t(isFavorite ? 'actions.unfavorite' : 'actions.favorite');

  return (
    <ActionIcon
      active={isFavorite}
      aria-label={label}
      aria-pressed={isFavorite}
      fill={isFavorite ? 'currentColor' : 'none'}
      icon={Star}
      size={DESKTOP_HEADER_ICON_SMALL_SIZE}
      title={label}
      tooltipProps={{ placement: 'bottom' }}
      onClick={() => favoriteTopic(topicId, !isFavorite)}
    />
  );
});

FavoriteToggle.displayName = 'FavoriteToggle';

export default FavoriteToggle;
