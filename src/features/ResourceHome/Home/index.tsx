'use client';

import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NavHeader from '@/features/NavHeader';
import AddButton from '@/features/ResourceManager/components/Header/AddButton';

import Libraries from './Libraries';
import RecentFiles from './RecentFiles';
import RecentWorks from './RecentWorks';

const styles = {
  content: 'w-full max-w-[1080px] mx-auto pt-8 pb-16 px-8',
  scroll: 'overflow-x-hidden overflow-y-auto flex-1',
};

/**
 * The library-style landing page of /resource: libraries (once — the sidebar
 * holds the full index), then works → recent files, instead of
 * the flat all-files table (which now lives at /resource/all).
 */
const ResourceHomeDashboard = memo(() => {
  const { t } = useTranslation('file');

  return (
    <div className="flex flex-col h-[100%]">
      <NavHeader
        right={<AddButton />}
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
        left={
          <div className="flex flex-col" style={{ marginLeft: 8 }}>
            {t('resource')}
          </div>
        }
      />
      <div className={styles.scroll}>
        <div className={cn('flex flex-col gap-10', styles.content)}>
          <Libraries />
          <RecentWorks />
          <RecentFiles />
        </div>
      </div>
    </div>
  );
});

ResourceHomeDashboard.displayName = 'ResourceHomeDashboard';

export default ResourceHomeDashboard;
