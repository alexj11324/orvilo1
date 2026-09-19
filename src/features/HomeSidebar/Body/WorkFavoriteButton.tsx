'use client';

import { ActionIcon, Button } from '@lobehub/ui/base-ui';
import type { NavigationFavoriteTargetType } from '@orvilo/types';
import { Pin, PinOff } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkFavoriteToggle } from './useWorkFavoriteToggle';

interface WorkFavoriteButtonProps {
  targetId?: string;
  targetType: NavigationFavoriteTargetType;
  variant?: 'button' | 'icon';
}

const WorkFavoriteButton = memo<WorkFavoriteButtonProps>(
  ({ targetId, targetType, variant = 'button' }) => {
    const { t } = useTranslation('common');
    const { pinned, toggle } = useWorkFavoriteToggle(targetType, targetId);
    if (!targetId) return null;
    const label = pinned ? t('savedViews.unfavorite') : t('savedViews.favorite');
    if (variant === 'icon') {
      return (
        <ActionIcon
          icon={pinned ? PinOff : Pin}
          size="small"
          title={label}
          onClick={() => void toggle()}
        />
      );
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
