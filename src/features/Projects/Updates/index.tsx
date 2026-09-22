'use client';

import { Flexbox, Icon, TextArea } from '@lobehub/ui';
import { Button, Tag, Text, toast } from '@lobehub/ui/base-ui';
import type { ProjectHealth, ProjectUpdate } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { CircleCheckIcon, CircleDotIcon, OctagonAlertIcon, SendHorizontalIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { useClientDataSWR } from '@/libs/swr';
import { projectService } from '@/services/project';

const styles = createStaticStyles(({ css }) => ({
  composer: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
  `,
  composerFooter: css`
    padding-block: 4px 6px;
    padding-inline: 12px 6px;
  `,
  healthPick: css`
    cursor: pointer;
  `,
  textarea: css`
    padding-block: 10px 4px !important;
    padding-inline: 12px !important;
    border: 0 !important;

    font-size: 14px !important;

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

const toUpdate = (row: {
  authorAvatar?: null | string;
  authorId: string;
  authorName?: null | string;
  body: string;
  createdAt: Date | string;
  health: ProjectHealth;
  id: string;
  projectId: string;
}): ProjectUpdate => ({
  authorAvatar: row.authorAvatar ?? undefined,
  authorId: row.authorId,
  authorName: row.authorName ?? undefined,
  body: row.body,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  health: row.health,
  id: row.id,
  projectId: row.projectId,
});

export const useProjectUpdates = (projectId?: string) =>
  useClientDataSWR(projectId ? ['project:updates', projectId] : null, async () => {
    const response = await projectService.listUpdates(projectId!);
    return (response?.data ?? []).map(toUpdate);
  });

export const ProjectUpdateComposer = memo<{ projectId: string; onPosted?: () => void }>(
  ({ onPosted, projectId }) => {
    const { t } = useTranslation('project');
    const [body, setBody] = useState('');
    const [health, setHealth] = useState<ProjectHealth>('onTrack');
    const [posting, setPosting] = useState(false);

    const post = async () => {
      const content = body.trim();
      if (!content) return;
      setPosting(true);
      try {
        await projectService.createUpdate(projectId, { body: content, health });
        setBody('');
        onPosted?.();
      } catch (error) {
        console.error('Failed to post project update', error);
        toast.error(t('overview.updatePostError', { defaultValue: 'Failed to post update' }));
      } finally {
        setPosting(false);
      }
    };

    return (
      <Flexbox className={styles.composer}>
        <TextArea
          autoSize={{ maxRows: 8, minRows: 2 }}
          className={styles.textarea}
          value={body}
          placeholder={t('overview.updatePlaceholder', {
            defaultValue: 'Write a project update…',
          })}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void post();
          }}
        />
        <Flexbox
          horizontal
          align={'center'}
          className={styles.composerFooter}
          justify={'space-between'}
        >
          <Flexbox horizontal align={'center'} gap={6}>
            {(Object.keys(PROJECT_UPDATE_HEALTH_META) as ProjectHealth[]).map((state) => {
              const meta = PROJECT_UPDATE_HEALTH_META[state];
              const active = health === state;
              return (
                <Tag
                  bordered={active}
                  className={styles.healthPick}
                  color={active ? meta.color : undefined}
                  icon={<Icon icon={meta.icon} size={12} />}
                  key={state}
                  shape={'round'}
                  size={'small'}
                  onClick={() => setHealth(state)}
                >
                  {t(`overview.health.${state}`, { defaultValue: state })}
                </Tag>
              );
            })}
          </Flexbox>
          <Button
            disabled={!body.trim()}
            icon={SendHorizontalIcon}
            loading={posting}
            type={'primary'}
            onClick={() => void post()}
          />
        </Flexbox>
      </Flexbox>
    );
  },
);

ProjectUpdateComposer.displayName = 'ProjectUpdateComposer';

export const ProjectUpdateRow = memo<{ update: ProjectUpdate }>(({ update }) => {
  const { t } = useTranslation('project');
  const meta = PROJECT_UPDATE_HEALTH_META[update.health] ?? PROJECT_UPDATE_HEALTH_META.onTrack;
  return (
    <Flexbox horizontal align={'flex-start'} className={styles.updateRow} gap={10}>
      <Avatar avatar={update.authorAvatar} name={update.authorName} size={24} />
      <Flexbox gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Flexbox horizontal align={'center'} gap={8}>
          <Text fontSize={13} weight={500}>
            {update.authorName || t('overview.updateAnonymous', { defaultValue: 'Member' })}
          </Text>
          <Tag
            color={meta.color}
            icon={<Icon icon={meta.icon} size={12} />}
            shape={'round'}
            size={'small'}
          >
            {t(`overview.health.${update.health}`, { defaultValue: update.health })}
          </Tag>
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
