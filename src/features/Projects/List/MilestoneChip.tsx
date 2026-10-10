'use client';

import { memo } from 'react';

import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { formatProjectDay } from '@/features/Projects/projectPlanningDate';
import { useCurrentProjectDetail } from '@/store/project';

import { pickNextMilestone } from './displayOptions';

const styles = {
  chip: 'inline-flex max-w-[220px] flex-none items-center gap-1 rounded-[4px] border border-sidebar-border px-1.5 py-px text-[11px] text-muted-foreground whitespace-nowrap',
  date: 'flex-none text-[var(--ant-color-text-quaternary)]',
  name: 'overflow-hidden text-ellipsis',
};

/**
 * Linear's inline milestone marker in the projects list: `◆ name Sep 30`.
 *
 * The `project.list` payload carries no milestones, so the chip reads the
 * cached project detail (`projectDetails` store) — it appears once a
 * project's detail has loaded this session and stays absent otherwise.
 * That is the "when data exists" contract; a `project.list` include for
 * milestones is the follow-up that makes it complete.
 */
const ProjectMilestoneChip = memo<{ projectId: string }>(({ projectId }) => {
  const detail = useCurrentProjectDetail(projectId);
  const milestone = pickNextMilestone(detail?.milestones);
  if (!milestone) return null;
  return (
    <span className={styles.chip} title={milestone.name}>
      <MilestoneIcon size={10} />
      <span className={styles.name}>{milestone.name}</span>
      {milestone.date ? (
        <span className={styles.date}>{formatProjectDay(milestone.date)}</span>
      ) : null}
    </span>
  );
});

ProjectMilestoneChip.displayName = 'ProjectMilestoneChip';

export default ProjectMilestoneChip;
