'use client';

import { cx } from 'antd-style';
import { Pin, PinOff } from 'lucide-react';
import React, { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { useElectronStore } from '@/store/electron';

import { type ResolvedTab } from '../TabBar/hooks/useResolvedTabs';
import { isSameTabTarget } from '../TabBar/scope';
import { useStyles } from './styles';

interface PageItemProps {
  isPinned: boolean;
  item: ResolvedTab;
  onClose: () => void;
}

const PageItem = memo<PageItemProps>(({ item, isPinned, onClose }) => {
  const { t } = useTranslation('electron');
  const navigate = useWorkspaceAwareNavigate();
  const location = useActiveLocation();
  const styles = useStyles;

  const pinPage = useElectronStore((s) => s.pinPage);
  const unpinPage = useElectronStore((s) => s.unpinPage);

  const { meta, tab } = item;
  const currentUrl = location.pathname + location.search;
  const isActive = isSameTabTarget(tab, currentUrl);

  const handleClick = () => {
    navigate(tab.url, { escape: true });
    onClose();
  };

  const handlePinToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPinned) {
      unpinPage(tab.id);
    } else {
      pinPage(tab);
    }
  };

  return (
    <div
      className={cx(cx(styles.item, isActive && styles.itemActive), 'flex items-center gap-2')}
      onClick={handleClick}
    >
      {meta.icon && createElement(meta.icon, { className: styles.icon, size: 16 })}
      <span className={styles.itemTitle}>{meta.title}</span>
      <ActionIcon
        className={cx('actionIcon', styles.actionIcon)}
        icon={isPinned ? PinOff : Pin}
        size="small"
        title={isPinned ? t('navigation.unpin') : t('navigation.pin')}
        onClick={handlePinToggle}
      />
    </div>
  );
});

PageItem.displayName = 'PageItem';

export default PageItem;
