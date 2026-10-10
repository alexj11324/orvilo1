'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

const styles = {
  title: 'm-0 text-[15px] font-semibold text-foreground',
  viewAll:
    'cursor-pointer border-none text-[13px] text-muted-foreground [background:none] hover:text-foreground',
};

interface SectionTitleProps {
  title: string;
  /** Target path of the "view all" affordance; omitted when there is no fuller view. */
  viewAllUrl?: string;
}

const SectionTitle = memo<SectionTitleProps>(({ title, viewAllUrl }) => {
  const { t } = useTranslation('file');
  const navigate = useWorkspaceAwareNavigate();

  return (
    <div className="flex flex-row items-center justify-between">
      <h2 className={styles.title}>{title}</h2>
      {viewAllUrl && (
        <button className={styles.viewAll} type={'button'} onClick={() => navigate(viewAllUrl)}>
          {t('home.viewAll')}
        </button>
      )}
    </div>
  );
});

SectionTitle.displayName = 'SectionTitle';

export default SectionTitle;
