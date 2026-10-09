'use client';

import { formatAbsoluteDate } from '@orvilo/utils/time';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useFetchWorkspaces } from '@/business/client/hooks/useFetchWorkspaces';
import Avatar from '@/components/Avatar';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSaveState } from '@/hooks/useSaveState';
import { createWorkspaceLambdaClient } from '@/libs/trpc/client';

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
  const { t } = useTranslation(['setting', 'common']);
  const workspace = useActiveWorkspace();
  const { mutate } = useFetchWorkspaces();
  const navigate = useNavigate();
  const { status, save, retry, lastSavedAt } = useSaveState();
  const [draft, setDraft] = useState<{ id: string; name: string; slug: string; avatar: string }>();
  const current = draft?.id === workspace?.id ? draft : undefined;
  const canEdit = workspace?.role === 'owner' || workspace?.role === 'admin';
  const field = (key: 'name' | 'slug' | 'avatar', label: string) => (
    <Input
      aria-label={label}
      disabled={!canEdit || status === 'saving'}
      value={current?.[key] ?? workspace?.[key] ?? ''}
      onChange={(event) =>
        workspace &&
        setDraft({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          avatar: workspace.avatar ?? '',
          ...current,
          [key]: event.target.value,
        })
      }
    />
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="text-[20px] font-semibold">
        {t('workspaceSetting.tab.general', { defaultValue: 'General' })}
      </div>
      <GeneralField label={t('workspaceSetting.general.logo', { defaultValue: 'Logo' })}>
        {field('avatar', t('workspaceSetting.general.logo'))}
        <Avatar
          avatar={workspace?.avatar ?? undefined}
          name={workspace?.name ?? '?'}
          shape={'square'}
          size={32}
        />
      </GeneralField>
      <GeneralField label={t('workspaceSetting.general.name', { defaultValue: 'Name' })}>
        {field('name', t('workspaceSetting.general.name'))}
      </GeneralField>
      <GeneralField label={t('workspaceSetting.general.url', { defaultValue: 'URL' })}>
        {field('slug', t('workspaceSetting.general.url'))}
      </GeneralField>
      <Button
        disabled={!canEdit || !current || status === 'saving'}
        onClick={() =>
          current &&
          void save(async () => {
            const { id, ...value } = current;
            const updated = await createWorkspaceLambdaClient(id).workspace.update.mutate(value);
            await mutate();
            setDraft(undefined);
            if (updated.slug !== workspace?.slug)
              navigate(`/${updated.slug}/settings`, { replace: true });
          })
        }
      >
        {t('save', { ns: 'common' })}
      </Button>
      <AutoSaveHint
        lastUpdatedTime={lastSavedAt}
        saveStatus={status}
        onRetry={() => void retry()}
      />
      <GeneralField label={t('workspaceSetting.general.created', { defaultValue: 'Created' })}>
        <div className="text-[13px] text-muted-foreground">
          {workspace?.createdAt ? formatAbsoluteDate(workspace.createdAt) : '—'}
        </div>
      </GeneralField>
    </div>
  );
});

WorkspaceGeneral.displayName = 'WorkspaceGeneral';

export default WorkspaceGeneral;
