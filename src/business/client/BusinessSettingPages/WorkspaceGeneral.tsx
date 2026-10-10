'use client';

import { formatAbsoluteDate } from '@orvilo/utils/time';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useFetchWorkspaces } from '@/business/client/hooks/useFetchWorkspaces';
import Avatar from '@/components/Avatar';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import Form from '@/components/GroupForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FORM_STYLE } from '@/const/layoutTokens';
import UnsavedChangesGuard from '@/features/EditorCanvas/UnsavedChangesGuard';
import { useSaveState } from '@/hooks/useSaveState';
import { createWorkspaceLambdaClient } from '@/libs/trpc/client';

const WorkspaceGeneral = () => {
  const { t } = useTranslation(['setting', 'common']);
  const workspace = useActiveWorkspace();
  const { mutate } = useFetchWorkspaces();
  const navigate = useNavigate();
  const { status, save, retry, lastSavedAt } = useSaveState();
  const [draft, setDraft] = useState<{ id: string; name: string; slug: string; avatar: string }>();
  const current = draft?.id === workspace?.id ? draft : undefined;
  const canEdit = workspace?.role === 'owner' || workspace?.role === 'admin';

  // Only the fields this form changed are sent. Sending the whole snapshot
  // would write back a name or URL another admin changed while the page was
  // open.
  const saveDraft = async (): Promise<boolean> => {
    if (!current || !workspace) return true;
    const changed = Object.fromEntries(
      (['name', 'slug', 'avatar'] as const)
        .filter((key) => current[key] !== (workspace[key] ?? ''))
        .map((key) => [key, current[key]]),
    );
    if (Object.keys(changed).length === 0) {
      setDraft(undefined);
      return true;
    }

    // `save` reports failure through its status, not by throwing.
    let savedSlug: string | undefined;
    await save(async () => {
      const updated = await createWorkspaceLambdaClient(current.id).workspace.update.mutate(
        changed,
      );
      await mutate();
      setDraft(undefined);
      savedSlug = updated.slug;
    });
    if (savedSlug === undefined) return false;
    if (savedSlug !== workspace.slug) navigate(`/${savedSlug}/settings`, { replace: true });
    return true;
  };
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
    <>
      {/* Leaving with unsaved edits saves them first instead of dropping them. */}
      <UnsavedChangesGuard
        isDirty={!!current && status !== 'saving'}
        message={''}
        onAutoSave={saveDraft}
      />
      {/* Same wide filled card as the personal settings pages. */}
      <Form
        collapsible={false}
        itemMinWidth={FORM_STYLE.itemMinWidth}
        itemsType={'group'}
        style={FORM_STYLE.style}
        variant={'filled'}
        items={[
          {
            children: [
              {
                children: (
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      avatar={current?.avatar ?? workspace?.avatar ?? undefined}
                      name={current?.name ?? workspace?.name ?? '?'}
                      shape={'square'}
                      size={36}
                    />
                    {field('avatar', t('workspaceSetting.general.logo'))}
                  </div>
                ),
                label: t('workspaceSetting.general.logo', { defaultValue: 'Logo' }),
              },
              {
                children: field('name', t('workspaceSetting.general.name')),
                label: t('workspaceSetting.general.name', { defaultValue: 'Name' }),
              },
              {
                children: field('slug', t('workspaceSetting.general.url')),
                label: t('workspaceSetting.general.url', { defaultValue: 'URL' }),
              },
              {
                children: (
                  <div className="text-right text-sm text-muted-foreground">
                    {workspace?.createdAt ? formatAbsoluteDate(workspace.createdAt) : '—'}
                  </div>
                ),
                label: t('workspaceSetting.general.created', { defaultValue: 'Created' }),
              },
            ],
            // The page header already names the page; a card title would repeat it.
            title: null,
          },
        ]}
      />
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
          onClick={() => void saveDraft()}
        >
          {t('save', { ns: 'common' })}
        </Button>
      </div>
    </>
  );
};

export default WorkspaceGeneral;
