'use client';

import { Flexbox, Icon, TextArea } from '@lobehub/ui';
import { Button, DropdownMenu, Tabs, Tag, Text, toast } from '@lobehub/ui/base-ui';
import type { ProjectHealth, ProjectUpdate, ProjectUpdateKind } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { CircleCheckIcon, CircleDotIcon, OctagonAlertIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { useClientDataSWR } from '@/libs/swr';
import { projectService } from '@/services/project';

const styles = createStaticStyles(({ css }) => ({
  collapsed: css`
    cursor: text;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    padding-block: 8px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;

    color: ${cssVar.colorTextSecondary};
    text-align: start;

    background: transparent;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
    }
  `,
  composer: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};

    &:focus-within {
      border-color: ${cssVar.colorPrimary};
    }
  `,
  composerFooter: css`
    padding-block: 4px 6px;
    padding-inline: 12px 6px;
  `,
  healthPick: css`
    cursor: pointer;
  `,
  modeTab: css`
    height: 24px;
    min-height: 24px;
    padding-block: 0;
    padding-inline: 8px;

    font-size: 12px;
  `,
  modeTabs: css`
    flex: none;
    width: auto;
  `,
  textarea: css`
    padding-block: 10px 4px !important;
    padding-inline: 12px !important;
    border: 0 !important;

    font-size: 15px !important;

    background: transparent !important;
    box-shadow: none !important;
  `,
  updateRow: css`
    padding-block: 10px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: 0;
    }
  `,
}));

export const PROJECT_UPDATE_HEALTH_META: Record<
  ProjectHealth,
  { color: 'colorError' | 'colorSuccess' | 'colorWarning'; icon: typeof CircleDotIcon }
> = {
  atRisk: { color: 'colorWarning', icon: OctagonAlertIcon },
  offTrack: { color: 'colorError', icon: CircleCheckIcon },
  onTrack: { color: 'colorSuccess', icon: CircleDotIcon },
};

const PROJECT_UPDATE_HEALTH_ORDER: ProjectHealth[] = ['onTrack', 'atRisk', 'offTrack'];

const toUpdate = (row: {
  authorAvatar?: null | string;
  authorId: string;
  authorName?: null | string;
  body: string;
  createdAt: Date | string;
  health?: null | ProjectHealth;
  id: string;
  kind?: null | ProjectUpdateKind;
  projectId: string;
}): ProjectUpdate => ({
  authorAvatar: row.authorAvatar ?? undefined,
  authorId: row.authorId,
  authorName: row.authorName ?? undefined,
  body: row.body,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  health: row.health ?? undefined,
  id: row.id,
  kind: row.kind ?? 'update',
  projectId: row.projectId,
});

export const useProjectUpdates = (projectId?: string) =>
  useClientDataSWR(projectId ? ['project:updates', projectId] : null, async () => {
    const response = await projectService.listUpdates(projectId!);
    return (response?.data ?? []).map(toUpdate);
  });

export const ProjectUpdateComposer = memo<{
  defaultExpanded?: boolean;
  defaultMode?: ProjectUpdateKind;
  onExpand?: () => void;
  onPosted?: () => void;
  projectId: string;
}>(({ defaultExpanded, defaultMode = 'update', onExpand, onPosted, projectId }) => {
  const { t } = useTranslation('project');
  const [body, setBody] = useState('');
  const [health, setHealth] = useState<ProjectHealth>('onTrack');
  const [posting, setPosting] = useState(false);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [mode, setMode] = useState<ProjectUpdateKind>(defaultMode);

  const post = async () => {
    const content = body.trim();
    if (!content) return;
    setPosting(true);
    try {
      await projectService.createUpdate(projectId, {
        body: content,
        health: mode === 'update' ? health : undefined,
        kind: mode,
      });
      setBody('');
      if (!defaultExpanded) setExpanded(false);
      onPosted?.();
    } catch (error) {
      console.error('Failed to post project update', error);
      toast.error(t('overview.updatePostError', { defaultValue: 'Failed to post update' }));
    } finally {
      setPosting(false);
    }
  };

  if (!expanded) {
    return (
      <button
        className={styles.collapsed}
        type="button"
        onClick={() => (onExpand ? onExpand() : setExpanded(true))}
      >
        <Icon icon={CircleDotIcon} size={14} style={{ opacity: 0.5 }} />
        <Text fontSize={13} type={'secondary'}>
          {t('overview.updatePlaceholder', { defaultValue: 'Write a project update…' })}
        </Text>
      </button>
    );
  }

  return (
    <Flexbox className={styles.composer}>
      <Flexbox horizontal align={'center'} gap={4} padding={8}>
        <Tabs
          activeKey={mode}
          className={styles.modeTabs}
          classNames={{ tab: styles.modeTab }}
          size="small"
          items={[
            { key: 'comment', label: t('overview.updateModeComment') },
            { key: 'update', label: t('overview.updateModeUpdate') },
          ]}
          onChange={(key) => {
            if (key === 'comment' || key === 'update') setMode(key);
          }}
        />
        {mode === 'update' && (
          <DropdownMenu
            items={PROJECT_UPDATE_HEALTH_ORDER.map((state) => ({
              key: state,
              label: t(`overview.health.${state}`),
              icon: <Icon icon={PROJECT_UPDATE_HEALTH_META[state].icon} size={12} />,
              onClick: () => setHealth(state),
            }))}
          >
            <Button
              className={styles.modeTab}
              icon={<Icon icon={PROJECT_UPDATE_HEALTH_META[health].icon} size={12} />}
              size={'small'}
            >
              {t(`overview.health.${health}`, { defaultValue: health })}
            </Button>
          </DropdownMenu>
        )}
      </Flexbox>
      <TextArea
        autoFocus
        aria-label={t(mode === 'update' ? 'overview.updateEditor' : 'overview.commentEditor')}
        autoSize={{ maxRows: 8, minRows: 2 }}
        className={styles.textarea}
        value={body}
        placeholder={t(
          mode === 'update' ? 'overview.updatePlaceholder' : 'overview.commentPlaceholder',
        )}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void post();
        }}
      />
      <Flexbox horizontal align={'center'} className={styles.composerFooter} justify={'flex-end'}>
        <Button
          className={styles.modeTab}
          disabled={!body.trim()}
          loading={posting}
          type={'primary'}
          onClick={() => void post()}
        >
          {t(mode === 'update' ? 'overview.postUpdate' : 'overview.postComment')}
        </Button>
      </Flexbox>
    </Flexbox>
  );
});

ProjectUpdateComposer.displayName = 'ProjectUpdateComposer';

export const ProjectUpdateRow = memo<{ update: ProjectUpdate }>(({ update }) => {
  const { t } = useTranslation('project');
  const meta = update.health
    ? (PROJECT_UPDATE_HEALTH_META[update.health] ?? PROJECT_UPDATE_HEALTH_META.onTrack)
    : null;
  return (
    <Flexbox horizontal align={'flex-start'} className={styles.updateRow} gap={10}>
      <Avatar avatar={update.authorAvatar} name={update.authorName} size={24} />
      <Flexbox gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Flexbox horizontal align={'center'} gap={8}>
          <Text fontSize={13} weight={500}>
            {update.authorName || t('overview.updateAnonymous', { defaultValue: 'Member' })}
          </Text>
          {meta && update.health && (
            <Tag
              color={meta.color}
              icon={<Icon icon={meta.icon} size={12} />}
              shape={'round'}
              size={'small'}
            >
              {t(`overview.health.${update.health}`, { defaultValue: update.health })}
            </Tag>
          )}
          <Text fontSize={12} type={'secondary'}>
            {dayjs(update.createdAt).format('MMM D')}
          </Text>
        </Flexbox>
        <Text fontSize={13} style={{ whiteSpace: 'pre-wrap' }}>
          {update.body}
        </Text>
      </Flexbox>
    </Flexbox>
  );
});

ProjectUpdateRow.displayName = 'ProjectUpdateRow';
