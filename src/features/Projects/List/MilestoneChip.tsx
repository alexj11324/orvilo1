'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';

import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { useCurrentProjectDetail } from '@/store/project';

import { useProjectDateFormatter } from '../useProjectDateFormatter';
import { pickNextMilestone } from './displayOptions';

const styles = createStaticStyles(({ css }) => ({
  chip: css`
    display: inline-flex;
    flex: none;
    gap: 4px;
    align-items: center;

    max-width: 220px;
    padding-block: 1px;
    padding-inline: 6px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 4px;

    font-size: 11px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;
  `,
  date: css`
    flex: none;
    color: ${cssVar.colorTextQuaternary};
  `,
  name: css`
    overflow: hidden;
    text-overflow: ellipsis;
  `,
}));

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
  const formatDate = useProjectDateFormatter();
  const milestone = pickNextMilestone(detail?.milestones);
  if (!milestone) return null;
  return (
    <span className={styles.chip} title={milestone.name}>
      <MilestoneIcon size={10} />
      <span className={styles.name}>{milestone.name}</span>
      {milestone.date ? <span className={styles.date}>{formatDate(milestone.date)}</span> : null}
    </span>
  );
});

ProjectMilestoneChip.displayName = 'ProjectMilestoneChip';

export default ProjectMilestoneChip;
