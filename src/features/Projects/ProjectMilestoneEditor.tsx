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

const styles = {
  container:
    'overflow-hidden flex-none rounded-(--radius-card) border border-divider text-sm leading-5.5',
  header: 'min-h-11 px-4 py-2',
  row: 'border-bs border-divider px-4 py-2',
  composer: 'border-bs border-divider p-4',
  composerActions: 'pbs-1',
};

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
    <div className={cn('flex flex-col gap-0', styles.container)}>
      <div className={cn('flex flex-row items-center gap-2', styles.header)}>
        <span className="text-sm leading-5.5 font-medium">{t('create.milestones')}</span>
        <div className="flex flex-1 flex-col" />
        <Button
          aria-label={t('create.addMilestone')}
          size="icon"
          variant="ghost"
          onClick={() => setComposerOpen((open) => !open)}
        >
          {createElement(PlusIcon, { 'size': 16, 'aria-hidden': true })}
        </Button>
      </div>
      {milestones.map((milestone, index) => (
        <div className={cn('flex flex-col gap-1', styles.row)} key={`${milestone.name}-${index}`}>
          <div className="flex items-center gap-2">
            <MilestoneIcon size={16} />
            <span className="text-sm leading-5.5 font-medium">{milestone.name}</span>
            {milestone.date && (
              <span className="text-xs leading-5 text-muted-foreground">
                {formatProjectDate(milestone.date)}
              </span>
            )}
            <div className="flex flex-1 flex-col" />
            <Button
              aria-label={t('create.removeMilestone')}
              size="icon"
              variant="ghost"
              onClick={() => onChange(milestones.filter((_, itemIndex) => itemIndex !== index))}
            >
              {createElement(XIcon, { 'size': 16, 'aria-hidden': true })}
            </Button>
          </div>
          {milestone.description && (
            <span className="text-xs leading-5 text-muted-foreground">{milestone.description}</span>
          )}
        </div>
      ))}
      {composerOpen && (
        <div className={cn('flex flex-col gap-2', styles.composer)}>
          <span className="text-sm leading-5.5 font-medium">{t('create.milestone.create')}</span>
          <Input
            aria-label={t('create.milestone.name')}
            placeholder={t('create.milestone.name')}
            value={draft.name}
            visualSize="normal"
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <DatePicker
            aria-label={t('create.milestone.date')}
            format="YYYY/MM/DD"
            placeholder={t('create.milestone.date')}
            prefix={<CalendarIcon size={16} />}
            size="normal"
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
          <div className={cn('flex flex-row justify-end gap-2', styles.composerActions)}>
            <Button
              size="lg"
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
              size="lg"
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
