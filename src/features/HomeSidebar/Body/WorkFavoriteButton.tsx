'use client';

import { ActionIcon, Button } from '@lobehub/ui/base-ui';
import type { NavigationFavoriteTargetType } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { FAVORITE_MARK, FAVORITE_MARK_OFF, type FavoriteIconSet } from './favoriteIcons';
import { useWorkFavoriteToggle } from './useWorkFavoriteToggle';

interface WorkFavoriteButtonProps {
  /**
   * Glyph set for the icon variant: `pin` (sidebar convention, default) or
   * `star` (Linear's issue-header favourite). Additive — existing callsites
   * keep the pin look; the task detail page opts into `star`.
   */
  icon?: FavoriteIconSet;
  targetId?: string;
  targetType: NavigationFavoriteTargetType;
  variant?: 'button' | 'icon';
}

const WorkFavoriteButton = memo<WorkFavoriteButtonProps>(
  ({ icon = 'pin', targetId, targetType, variant = 'button' }) => {
    const { t } = useTranslation('common');
    const { pinned, toggle } = useWorkFavoriteToggle(targetType, targetId);
    if (!targetId) return null;
    const label = pinned ? t('savedViews.unfavorite') : t('savedViews.favorite');
    if (variant === 'icon') {
      const glyph = pinned ? FAVORITE_MARK_OFF[icon] : FAVORITE_MARK[icon];
      return <ActionIcon icon={glyph} size="small" title={label} onClick={() => void toggle()} />;
    }
    return (
      <Button size="small" onClick={() => void toggle()}>
        {label}
      </Button>
    );
  },
);

WorkFavoriteButton.displayName = 'WorkFavoriteButton';

export default WorkFavoriteButton;
