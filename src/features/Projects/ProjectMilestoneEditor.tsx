import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { CalendarIcon, PlusIcon, XIcon } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DatePicker from '@/components/DatePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
    <div className={cn('flex flex-col', styles.container)} style={{ gap: 0 }}>
      <div className={cn('flex flex-row', styles.header)} style={{ alignItems: 'center', gap: 8 }}>
        <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
          {t('create.milestones')}
        </span>
        <div className="flex flex-col" style={{ flex: 1 }} />
        <Button
          aria-label={t('create.addMilestone')}
          size="icon-sm"
          variant="ghost"
          onClick={() => setComposerOpen((open) => !open)}
        >
          {createElement(PlusIcon, { 'size': 16, 'aria-hidden': true })}
        </Button>
      </div>
      {milestones.map((milestone, index) => (
        <div
          className={cn('flex flex-col', styles.row)}
          key={`${milestone.name}-${index}`}
          style={{ gap: 4 }}
        >
          <div className="flex flex-row" style={{ alignItems: 'center', gap: 8 }}>
            <MilestoneIcon size={14} />
            <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
              {milestone.name}
            </span>
            {milestone.date && (
              <span className="text-sm text-muted-foreground" style={{ fontSize: 12 }}>
                {formatProjectDate(milestone.date)}
              </span>
            )}
            <div className="flex flex-col" style={{ flex: 1 }} />
            <Button
              aria-label={t('create.removeMilestone')}
              size="icon-sm"
              variant="ghost"
              onClick={() => onChange(milestones.filter((_, itemIndex) => itemIndex !== index))}
            >
              {createElement(XIcon, { 'size': 16, 'aria-hidden': true })}
            </Button>
          </div>
          {milestone.description && (
            <span className="text-sm text-muted-foreground" style={{ fontSize: 12 }}>
              {milestone.description}
            </span>
          )}
        </div>
      ))}
      {composerOpen && (
        <div className={cn('flex flex-col', styles.composer)} style={{ gap: 8 }}>
          <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('create.milestone.create')}
          </span>
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
            prefix={<CalendarIcon size={13} />}
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
          <Textarea
            aria-label={t('create.milestone.description')}
            placeholder={t('create.milestone.description')}
            rows={2}
            value={draft.description ?? ''}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
          />
          <div
            className={cn('flex flex-row', styles.composerActions)}
            style={{ justifyContent: 'end', gap: 8 }}
          >
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(createEmptyMilestone());
                setComposerOpen(false);
              }}
            >
              {t('create.milestone.discard')}
            </Button>
            <Button
              disabled={!draft.name.trim()}
              size="sm"
              variant="default"
              onClick={addMilestone}
            >
              {t('create.milestone.add')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

ProjectMilestoneEditor.displayName = 'ProjectMilestoneEditor';

export default ProjectMilestoneEditor;
