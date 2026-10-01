'use client';

import { cx } from 'antd-style';
import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveLocation } from '@/hooks/useActiveLocation';
import { useElectronStore } from '@/store/electron';

import { useResolvedPages } from './hooks/useResolvedPages';
import Section from './Section';
import { useStyles } from './styles';

interface RecentlyViewedProps {
  onClose: () => void;
}

const RecentlyViewed = memo<RecentlyViewedProps>(({ onClose }) => {
  const { t } = useTranslation('electron');
  const location = useActiveLocation();
  const styles = useStyles;

  const loadPinnedPages = useElectronStore((s) => s.loadPinnedPages);

  const { pinnedPages, recentPages } = useResolvedPages();

  useEffect(() => {
    loadPinnedPages(location.pathname + location.search);
  }, [loadPinnedPages, location.pathname, location.search]);

  const isEmpty = pinnedPages.length === 0 && recentPages.length === 0;

  if (isEmpty) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>{t('navigation.noPages')}</div>
      </div>
    );
  }

  return (
    <div className={cx(styles.container, 'flex flex-col')}>
      <Section isPinned items={pinnedPages} title={t('navigation.pinned')} onClose={onClose} />
      {pinnedPages.length > 0 && recentPages.length > 0 && <div className={styles.divider} />}
      <Section
        isPinned={false}
        items={recentPages}
        title={t('navigation.recentView')}
        onClose={onClose}
      />
    </div>
  );
});

RecentlyViewed.displayName = 'RecentlyViewed';

export default RecentlyViewed;
