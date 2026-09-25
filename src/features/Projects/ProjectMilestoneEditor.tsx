import { DatePicker, Flexbox, Icon, Input, TextArea } from '@lobehub/ui';
import { ActionIcon, Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import dayjs from 'dayjs';
import { CalendarIcon, PlusIcon, XIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type CreateProjectMilestone } from './createProjectForm';
import MilestoneIcon from './MilestoneIcon';
import { formatProjectDate } from './projectPlanningDate';

interface ProjectMilestoneEditorProps {
  milestones: CreateProjectMilestone[];
  onChange: (milestones: CreateProjectMilestone[]) => void;
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow: hidden;
    flex: none;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
  `,
  header: css`
    min-height: 44px;
    padding-block: 8px;
    padding-inline: 12px;
  `,
  row: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  composer: css`
    padding-block: 12px;
    padding-inline: 12px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  composerActions: css`
    padding-block-start: 4px;
  `,
}));

const createEmptyMilestone = (): CreateProjectMilestone => ({ name: '' });

const ProjectMilestoneEditor = memo<ProjectMilestoneEditorProps>(({ milestones, onChange }) => {
  const { t } = useTranslation('project');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<CreateProjectMilestone>(createEmptyMilestone);

  const addMilestone = () => {
    const name = draft.name.trim();
    if (!name) return;
    onChange([
      ...milestones,
      {
        ...(draft.date ? { date: draft.date } : {}),
        ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
        name,
      },
    ]);
    setDraft(createEmptyMilestone());
    setComposerOpen(false);
  };

  return (
    <Flexbox className={styles.container} gap={0}>
      <Flexbox horizontal align="center" className={styles.header} gap={8}>
        <Text fontSize={13} weight={500}>
          {t('create.milestones')}
        </Text>
        <Flexbox flex={1} />
        <ActionIcon
          aria-label={t('create.addMilestone')}
          icon={PlusIcon}
          size="small"
          onClick={() => setComposerOpen((open) => !open)}
        />
      </Flexbox>
      {milestones.map((milestone, index) => (
        <Flexbox className={styles.row} gap={4} key={`${milestone.name}-${index}`}>
          <Flexbox horizontal align="center" gap={8}>
            <MilestoneIcon size={14} />
            <Text fontSize={13} weight={500}>
              {milestone.name}
            </Text>
            {milestone.date && (
              <Text fontSize={12} type="secondary">
                {formatProjectDate(milestone.date)}
              </Text>
            )}
            <Flexbox flex={1} />
            <ActionIcon
              aria-label={t('create.removeMilestone')}
              icon={XIcon}
              size="small"
              onClick={() => onChange(milestones.filter((_, itemIndex) => itemIndex !== index))}
            />
          </Flexbox>
          {milestone.description && (
            <Text fontSize={12} type="secondary">
              {milestone.description}
            </Text>
          )}
        </Flexbox>
      ))}
      {composerOpen && (
        <Flexbox className={styles.composer} gap={8}>
          <Text fontSize={13} weight={500}>
            {t('create.milestone.create')}
          </Text>
          <Input
            aria-label={t('create.milestone.name')}
            placeholder={t('create.milestone.name')}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <DatePicker
            aria-label={t('create.milestone.date')}
            format="MMM D"
            placeholder={t('create.milestone.date')}
            prefix={<Icon icon={CalendarIcon} size={13} />}
            size="small"
            suffixIcon={null}
            value={draft.date ? dayjs(draft.date) : null}
            onChange={(date) =>
              setDraft((current) => ({
                ...current,
                date: (Array.isArray(date) ? date[0] : date)?.format('YYYY-MM-DD'),
              }))
            }
          />
          <TextArea
            aria-label={t('create.milestone.description')}
            placeholder={t('create.milestone.description')}
            rows={2}
            value={draft.description ?? ''}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
          />
          <Flexbox horizontal className={styles.composerActions} gap={8} justify="end">
            <Button
              size="small"
              onClick={() => {
                setDraft(createEmptyMilestone());
                setComposerOpen(false);
              }}
            >
              {t('create.milestone.discard')}
            </Button>
            <Button
              disabled={!draft.name.trim()}
              size="small"
              type="primary"
              onClick={addMilestone}
            >
              {t('create.milestone.add')}
            </Button>
          </Flexbox>
        </Flexbox>
      )}
    </Flexbox>
  );
});

ProjectMilestoneEditor.displayName = 'ProjectMilestoneEditor';

export default ProjectMilestoneEditor;
