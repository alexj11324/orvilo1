'use client';

import { formatAbsoluteDate } from '@orvilo/utils/time';
import { createStaticStyles, cssVar } from 'antd-style';
import { useState } from 'react';
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
    display: grid;
    gap: 12px 24px;
    align-items: center;

    padding-block: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    @container (min-width: 560px) {
      grid-template-columns: 160px minmax(0, 1fr);
    }
  `,
}));

const GeneralField = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div className={styles.field}>
    <div className="text-sm font-medium">{label}</div>
    <div className="flex min-w-0 items-center gap-3">{children}</div>
  </div>
);

const WorkspaceGeneral = () => {
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
      className="h-9 text-sm"
      disabled={!canEdit || status === 'saving'}
      placeholder={key === 'avatar' ? 'https://…' : undefined}
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
    <div className="@container mx-auto flex w-full min-w-0 max-w-160 flex-col gap-6">
      <h1 className="m-0 text-xl font-semibold">
        {t('workspaceSetting.tab.general', { defaultValue: 'General' })}
      </h1>
      <div>
        <GeneralField label={t('workspaceSetting.general.logo', { defaultValue: 'Logo' })}>
          <Avatar
            avatar={current?.avatar ?? workspace?.avatar ?? undefined}
            name={current?.name ?? workspace?.name ?? '?'}
            shape={'square'}
            size={36}
          />
          {field('avatar', t('workspaceSetting.general.logo'))}
        </GeneralField>
        <GeneralField label={t('workspaceSetting.general.name', { defaultValue: 'Name' })}>
          {field('name', t('workspaceSetting.general.name'))}
        </GeneralField>
        <GeneralField label={t('workspaceSetting.general.url', { defaultValue: 'URL' })}>
          {field('slug', t('workspaceSetting.general.url'))}
        </GeneralField>
        <GeneralField label={t('workspaceSetting.general.created', { defaultValue: 'Created' })}>
          <div className="text-sm text-muted-foreground">
            {workspace?.createdAt ? formatAbsoluteDate(workspace.createdAt) : '—'}
          </div>
        </GeneralField>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {status !== 'idle' && (
          <AutoSaveHint
            lastUpdatedTime={lastSavedAt}
            saveStatus={status}
            onRetry={() => void retry()}
          />
        )}
        <Button
          disabled={!canEdit || !current || status === 'saving'}
          size="lg"
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
      </div>
    </div>
  );
};

export default WorkspaceGeneral;
