'use client';

import { memo } from 'react';

import { useCurrentProjectDetail } from '@/store/project';

import LabelChips from './LabelChips';

export interface ProjectLabelChipsProps {
  /** Individual chips shown before the `+N` collapse. */
  max?: number;
  projectId: string;
}

/**
 * Label chips for a project, read from the cached project detail
 * (`projectDetails` store) — the same contract as `ProjectMilestoneChip`:
 * the `project.list` payload carries no label bindings, so chips appear once
 * a project's detail has loaded this session and stay absent otherwise. A
 * `project.list` labels include is the follow-up that makes it complete.
 */
const ProjectLabelChips = memo<ProjectLabelChipsProps>(({ max = 2, projectId }) => {
  const detail = useCurrentProjectDetail(projectId);
  if (!detail?.labels?.length) return null;
  return <LabelChips labels={detail.labels} max={max} />;
});

ProjectLabelChips.displayName = 'ProjectLabelChips';

export default ProjectLabelChips;
