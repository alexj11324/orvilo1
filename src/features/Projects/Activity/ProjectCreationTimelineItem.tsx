import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import { TimelineDate } from '@/components/reui/timeline';
import type { ProjectDetail } from '@/store/project';

import { ProjectIcon } from '../ProjectIcon';
import { ActivityTimelineItem } from './ActivityTimelineItem';

/**
 * The project-created line as the last item of the Activity timeline. Must
 * render inside a `Timeline`; the side panel keeps the standalone
 * `ProjectCreationActivity` row.
 */
export function ProjectCreationTimelineItem({
  project,
  step,
}: {
  project: ProjectDetail['project'];
  step: number;
}) {
  const { t } = useTranslation('project');
  const date = dayjs(project.createdAt);
  if (!project.createdAt || !date.isValid()) return null;
  const creator = project.createdBySnapshot?.displayName;
  return (
    <ActivityTimelineItem marker={<ProjectIcon size={14} />} step={step}>
      {creator ? t('activity.createdBy', { name: creator }) : t('activity.created')}
      {' · '}
      <TimelineDate
        className="mb-0 inline font-normal"
        dateTime={date.toISOString()}
        title={date.format('YYYY-MM-DD HH:mm')}
      >
        {date.format('MMM D')}
      </TimelineDate>
    </ActivityTimelineItem>
  );
}
