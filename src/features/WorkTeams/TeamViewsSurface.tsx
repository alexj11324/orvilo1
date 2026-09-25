'use client';

import { Center, Empty, Flexbox, Icon, Input } from '@lobehub/ui';
import { ActionIcon, Button, Popover, Select, Text, toast } from '@lobehub/ui/base-ui';
import type { SavedViewItem } from '@orvilo/database/schemas';
import type { WorkQueryEntityType } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { FilterIcon, Layers2Icon, PlusIcon, Settings2Icon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import WorkQueryResults from '@/features/MyWork/WorkQueryResults';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { filterSavedViewsByEntity } from '@/features/SavedViews/savedViewDirectory';
import { SavedViewProjectRow } from '@/features/SavedViews/SavedViewPage';
import { savedViewVisibilityKey } from '@/features/SavedViews/savedViewVisibility';
import ViewDefinitionEditor from '@/features/SavedViews/ViewDefinitionEditor';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { useSearchParams } from '@/libs/router/navigation';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { newTeamViewDraft, teamViewDraftQuery } from './teamViewsDraft';
import { nextTeamViewsSearch, readTeamViewsSearch } from './teamViewsNavigation';

const styles = createStaticStyles(({ css }) => ({
  choice: css`
    cursor: pointer;

    display: inline-flex;
    align-items: center;

    height: 28px;
    padding-inline: 12px;
    border: 1px solid transparent;
    border-radius: 999px;

    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  choiceActive: css`
    border-color: ${cssVar.colorBorderSecondary};
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillSecondary};
  `,
  directoryBody: css`
    display: flex;
    flex-direction: column;
    min-height: 100%;
  `,
  editorHeader: css`
    padding-block: 16px;
    padding-inline: 24px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  empty: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 18px;
    align-items: center;
    justify-content: center;

    max-width: 480px;
    margin-inline: auto;
    padding-block: 48px;
    padding-inline: 20px;

    text-align: center;
  `,
  popover: css`
    width: min(420px, calc(100vw - 32px));
    padding: 12px;
  `,
  resultScroll: css`
    overflow: auto;
    flex: 1;

    min-height: 0;
    padding-block: 12px;
    padding-inline: 16px;
  `,
  viewRow: css`
    cursor: pointer;

    display: flex;
    gap: 12px;
    align-items: center;

    min-height: 44px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface TeamViewsSurfaceProps {
  error?: Error;
  isLoading: boolean;
  onRetry: () => void;
  teamId: string;
  teamName: string;
  views: SavedViewItem[];
}

/** Team-scoped directory and a routed draft, using the same saved-view query model as workspace Views. */
const TeamViewsSurface = ({
  error,
  isLoading,
  onRetry,
  teamId,
  teamName,
  views,
}: TeamViewsSurfaceProps) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { creating, entityType } = readTeamViewsSearch(`?${searchParams}`);
  const [draft, setDraft] = useState(() => newTeamViewDraft(entityType, teamId));
  const [saving, setSaving] = useState(false);
  const [control, setControl] = useState<'filters' | 'display' | null>(null);
  const [sort, setSort] = useState<
    'createdAsc' | 'createdDesc' | 'nameAsc' | 'nameDesc' | 'updatedAsc' | 'updatedDesc'
  >('nameAsc');
  const defaultName = entityType === 'task' ? t('teams.viewAllIssues') : t('teams.viewAllProjects');

  const wasCreating = useRef(false);
  useEffect(() => {
    if (creating && !wasCreating.current) {
      setDraft(newTeamViewDraft(entityType, teamId));
    } else if (creating) {
      // The URL is the entity source of truth: Back/forward can flip `?entity`
      // while `?new=1` stays set — mirror it into the draft (keeping the typed
      // name, resetting builder state exactly like selectEntity does).
      setDraft((current) =>
        current.entityType === entityType
          ? current
          : {
              ...current,
              builder: { any: [], rows: [], slots: [] },
              entityType,
              groupBy: entityType === 'task' ? 'status' : 'none',
            },
      );
    }
    wasCreating.current = creating;
  }, [creating, entityType, teamId]);

  const query = useMemo(() => teamViewDraftQuery(draft, teamId), [draft, teamId]);
  const {
    data: preview,
    error: previewError,
    isLoading: previewLoading,
    mutate: retryPreview,
  } = useClientDataSWR(
    creating && workspaceId ? ['team-view-preview', workspaceId, query] : null,
    () => workAttentionService.query({ query }),
  );
  const result = preview?.data;
  const tasks = result && 'tasks' in result ? (result.tasks ?? []) : [];
  const groups = result && 'groups' in result ? (result.groups ?? []) : [];
  const projects = result && 'projects' in result ? (result.projects ?? []) : [];
  const filteredViews = filterSavedViewsByEntity(views, entityType, '', (view) => view.name);
  const sortedViews = [...filteredViews].sort((a, b) => {
    const direction = sort.endsWith('Desc') ? -1 : 1;
    if (sort === 'nameAsc' || sort === 'nameDesc') return direction * a.name.localeCompare(b.name);
    const field = sort.startsWith('created') ? 'createdAt' : 'updatedAt';
    const left = new Date(a[field] ?? 0).getTime();
    const right = new Date(b[field] ?? 0).getTime();
    return direction * (left - right);
  });

  const changeLocation = (patch: Parameters<typeof nextTeamViewsSearch>[1]) => {
    setControl(null);
    setSearchParams(nextTeamViewsSearch(`?${searchParams}`, patch));
  };
  const selectEntity = (next: WorkQueryEntityType) => {
    if (creating)
      setDraft((current) => ({
        ...current,
        builder: { any: [], rows: [], slots: [] },
        entityType: next,
        groupBy: next === 'task' ? 'status' : 'none',
      }));
    changeLocation({ entityType: next });
  };
  const cancel = () => {
    setDraft(newTeamViewDraft(entityType, teamId));
    changeLocation({ creating: false });
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: draft.entityType,
        layout: draft.layout,
        name: draft.name.trim() || defaultName,
        query,
        teamId,
        visibility: 'team',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch (error) {
      console.error('Failed to save team view', error);
      toast.error(t('savedViews.saveAsFailed'));
    } finally {
      setSaving(false);
    }
  };

  const entityTabs = (
    <Flexbox horizontal align="center" gap={6}>
      {(['task', 'project'] as const).map((kind) => (
        <button
          aria-current={entityType === kind ? 'page' : undefined}
          className={`${styles.choice} ${entityType === kind ? styles.choiceActive : ''}`}
          key={kind}
          type="button"
          onClick={() => selectEntity(kind)}
        >
          {t(kind === 'task' ? 'savedViews.tabIssues' : 'savedViews.entityProject')}
        </button>
      ))}
    </Flexbox>
  );

  const displayControl = (
    <Popover
      open={control === 'display'}
      placement="bottomRight"
      trigger="click"
      content={
        creating ? (
          <Flexbox className={styles.popover}>
            <ViewDefinitionEditor showFilters={false} value={draft} onChange={setDraft} />
          </Flexbox>
        ) : (
          <Flexbox className={styles.popover} gap={10}>
            <Text>{t('savedViews.sortDefault')}</Text>
            <Select
              aria-label={t('savedViews.sortDefault')}
              value={sort}
              options={[
                { label: t('savedViews.sort.nameAsc'), value: 'nameAsc' },
                { label: t('savedViews.sort.nameDesc'), value: 'nameDesc' },
                { label: t('savedViews.sort.createdDesc'), value: 'createdDesc' },
                { label: t('savedViews.sort.createdAsc'), value: 'createdAsc' },
                { label: t('savedViews.sort.updatedDesc'), value: 'updatedDesc' },
                { label: t('savedViews.sort.updatedAsc'), value: 'updatedAsc' },
              ]}
              onChange={(value) => {
                if (
                  value === 'nameAsc' ||
                  value === 'nameDesc' ||
                  value === 'createdAsc' ||
                  value === 'createdDesc' ||
                  value === 'updatedAsc' ||
                  value === 'updatedDesc'
                )
                  setSort(value);
              }}
            />
          </Flexbox>
        )
      }
      onOpenChange={(open) => setControl(open ? 'display' : null)}
    >
      <ActionIcon
        aria-label={t('savedViews.displayOptions')}
        icon={Settings2Icon}
        size="small"
        title={t('savedViews.displayOptions')}
      />
    </Popover>
  );

  if (creating)
    return (
      <WorkSurface>
        <NavHeader
          left={
            <Text weight={500}>
              {teamName} › {draft.name || defaultName}
            </Text>
          }
        />
        <Flexbox className={styles.editorHeader} gap={14}>
          <Flexbox horizontal align="center" gap={12} wrap="wrap">
            <Input
              aria-label={t('savedViews.name')}
              placeholder={defaultName}
              style={{ flex: 1, minWidth: 180 }}
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
            <Text type="secondary">
              {t('teams.viewSaveTo')} {teamName}
            </Text>
            <Button onClick={cancel}>{t('cancel')}</Button>
            <Button loading={saving} type="primary" onClick={() => void save()}>
              {t('savedViews.createView')}
            </Button>
          </Flexbox>
          <Input disabled placeholder={t('teams.viewDescription')} />
        </Flexbox>
        <WorkSurfaceToolbar>
          {entityTabs}
          <Flexbox horizontal align="center" gap={6} style={{ marginInlineStart: 'auto' }}>
            <Popover
              open={control === 'filters'}
              placement="bottomRight"
              trigger="click"
              content={
                <Flexbox className={styles.popover}>
                  <ViewDefinitionEditor showDisplay={false} value={draft} onChange={setDraft} />
                </Flexbox>
              }
              onOpenChange={(open) => setControl(open ? 'filters' : null)}
            >
              <ActionIcon
                aria-label={t('savedViews.filters.add')}
                icon={FilterIcon}
                size="small"
                title={t('savedViews.filters.add')}
              />
            </Popover>
            {displayControl}
          </Flexbox>
        </WorkSurfaceToolbar>
        <div className={styles.resultScroll}>
          {previewError ? (
            <AsyncError error={previewError} onRetry={() => void retryPreview()} />
          ) : draft.entityType === 'project' ? (
            previewLoading ? (
              <Text>{t('savedViews.loading')}</Text>
            ) : projects.length ? (
              projects.map((project) => <SavedViewProjectRow key={project.id} project={project} />)
            ) : (
              <Center padding={48}>
                <Empty description={t('savedViews.emptyResults')} />
              </Center>
            )
          ) : (
            <WorkQueryResults
              emptyLabel={t('savedViews.emptyResults')}
              groupBy={result && 'groupBy' in result ? result.groupBy : undefined}
              groups={groups}
              layout={draft.layout}
              loadMoreLabel={t('savedViews.loadMore')}
              loading={previewLoading}
              loadingLabel={t('savedViews.loading')}
              tasks={tasks}
              total={result?.total}
            />
          )}
        </div>
      </WorkSurface>
    );

  return (
    <WorkSurface>
      <NavHeader
        left={
          <Flexbox horizontal align="center" gap={8} style={{ paddingInlineStart: 4 }}>
            <Text weight={500}>{t('tab.views')}</Text>
            {teamId && (
              <WorkFavoriteButton icon="star" targetId={teamId} targetType="team" variant="icon" />
            )}
          </Flexbox>
        }
        right={
          <Flexbox horizontal align="center" gap={8}>
            <Button icon={PlusIcon} size="small" onClick={() => changeLocation({ creating: true })}>
              {t('savedViews.newView')}
            </Button>
          </Flexbox>
        }
      />
      <WorkSurfaceToolbar>
        {entityTabs}
        <Flexbox style={{ marginInlineStart: 'auto' }}>{displayControl}</Flexbox>
      </WorkSurfaceToolbar>
      <WorkSurfaceCollection className={styles.directoryBody}>
        {error && sortedViews.length === 0 ? (
          <AsyncError error={error} onRetry={onRetry} />
        ) : isLoading && sortedViews.length === 0 ? (
          <SkeletonList aria-label={t('savedViews.loading')} rows={4} />
        ) : sortedViews.length ? (
          <Flexbox gap={0}>
            {error ? <AsyncError error={error} variant="inline" onRetry={onRetry} /> : null}
            {sortedViews.map((view) => (
              <WorkspaceLink className={styles.viewRow} key={view.id} to={`/views/${view.id}`}>
                <Icon icon={Layers2Icon} size={16} />
                <Text style={{ flex: 1 }}>{view.name}</Text>
                <Text fontSize={12} type="secondary">
                  {t(savedViewVisibilityKey(view.visibility))}
                </Text>
              </WorkspaceLink>
            ))}
          </Flexbox>
        ) : (
          <div className={styles.empty}>
            <Icon icon={Layers2Icon} size={64} />
            <Text fontSize={20} weight={600}>
              {t('tab.views')}
            </Text>
            <Text type="secondary">
              {t(
                entityType === 'task'
                  ? 'teams.viewDirectoryDescriptionIssues'
                  : 'teams.viewDirectoryDescriptionProjects',
              )}
            </Text>
            <Flexbox horizontal gap={8} justify="center" wrap="wrap">
              <Button type="primary" onClick={() => changeLocation({ creating: true })}>
                {t('teams.viewCreateNew')}
              </Button>
              <Button
                onClick={() =>
                  window.open('/docs/usage/getting-started/work', '_blank', 'noopener,noreferrer')
                }
              >
                {t('teams.viewDocumentation')}
              </Button>
            </Flexbox>
          </div>
        )}
      </WorkSurfaceCollection>
    </WorkSurface>
  );
};

export default TeamViewsSurface;
