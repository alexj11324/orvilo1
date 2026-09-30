'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import Avatar from '@/components/Avatar';

const styles = createStaticStyles(({ css }) => ({
  field: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding-block: 14px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  label: css`
    flex: none;
    width: 160px;
  `,
}));

const GeneralField = memo<{ children: React.ReactNode; label: string }>(({ children, label }) => (
  <div className={styles.field}>
    <div className={cn('text-[13px] text-muted-foreground', styles.label)}>{label}</div>
    {children}
  </div>
));

GeneralField.displayName = 'GeneralField';

const WorkspaceGeneral = memo(() => {
  const { t } = useTranslation('setting');
  const workspace = useActiveWorkspace();

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="text-[20px] font-semibold">
        {t('workspaceSetting.tab.general', { defaultValue: 'General' })}
      </div>
      <GeneralField label={t('workspaceSetting.general.logo', { defaultValue: 'Logo' })}>
        <Avatar
          avatar={workspace?.avatar ?? undefined}
          name={workspace?.name ?? '?'}
          shape={'square'}
          size={32}
        />
      </GeneralField>
      <GeneralField label={t('workspaceSetting.general.name', { defaultValue: 'Name' })}>
        <div className="text-[13px]">{workspace?.name ?? '—'}</div>
      </GeneralField>
      <GeneralField label={t('workspaceSetting.general.url', { defaultValue: 'URL' })}>
        <div className="text-[13px] text-muted-foreground">
          {workspace?.slug ? `/${workspace.slug}` : '—'}
        </div>
      </GeneralField>
      <GeneralField label={t('workspaceSetting.general.created', { defaultValue: 'Created' })}>
        <div className="text-[13px] text-muted-foreground">
          {workspace?.createdAt ? dayjs(workspace.createdAt).format('MMM D, YYYY') : '—'}
        </div>
      </GeneralField>
    </div>
  );
});

WorkspaceGeneral.displayName = 'WorkspaceGeneral';

export default WorkspaceGeneral;
