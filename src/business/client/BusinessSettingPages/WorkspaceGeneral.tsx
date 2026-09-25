'use client';

import { Flexbox } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
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
    <Text className={styles.label} fontSize={13} type={'secondary'}>
      {label}
    </Text>
    {children}
  </div>
));

GeneralField.displayName = 'GeneralField';

const WorkspaceGeneral = memo(() => {
  const { t } = useTranslation('setting');
  const workspace = useActiveWorkspace();

  return (
    <Flexbox gap={8} width={'100%'}>
      <Text fontSize={20} weight={600}>
        {t('workspaceSetting.tab.general', { defaultValue: 'General' })}
      </Text>
      <GeneralField label={t('workspaceSetting.general.logo', { defaultValue: 'Logo' })}>
        <Avatar
          avatar={workspace?.avatar ?? undefined}
          name={workspace?.name ?? '?'}
          shape={'square'}
          size={32}
        />
      </GeneralField>
      <GeneralField label={t('workspaceSetting.general.name', { defaultValue: 'Name' })}>
        <Text fontSize={13}>{workspace?.name ?? '—'}</Text>
      </GeneralField>
      <GeneralField label={t('workspaceSetting.general.url', { defaultValue: 'URL' })}>
        <Text fontSize={13} type={'secondary'}>
          {workspace?.slug ? `/${workspace.slug}` : '—'}
        </Text>
      </GeneralField>
      <GeneralField label={t('workspaceSetting.general.created', { defaultValue: 'Created' })}>
        <Text fontSize={13} type={'secondary'}>
          {workspace?.createdAt ? dayjs(workspace.createdAt).format('MMM D, YYYY') : '—'}
        </Text>
      </GeneralField>
    </Flexbox>
  );
});

WorkspaceGeneral.displayName = 'WorkspaceGeneral';

export default WorkspaceGeneral;
