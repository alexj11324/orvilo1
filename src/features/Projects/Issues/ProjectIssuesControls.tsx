'use client';
import { cn } from 'cn';
import { PanelRightCloseIcon, PanelRightOpenIcon, Plus } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { TaskMilestoneRef } from '@/features/Projects/milestoneFilter';

import IssueFilterPopover from './IssueFilterPopover';
import type { ProjectIssueFilter } from './issueFilters';

interface ProjectIssuesControlsProps {
  /** True while "Open details" is armed — drives the toggle's active state. */
  detailsOpen: boolean;
  filters: readonly ProjectIssueFilter[];
  milestoneId?: string;
  milestones?: readonly TaskMilestoneRef[];
  onFiltersChange: (filters: ProjectIssueFilter[]) => void;
  onMilestoneChange: (milestoneId: string | undefined) => void;
  /** "+ New view" and the menu's "Advanced filter" entry share this. */
  onNewView: () => void;
  onToggleDetails: () => void;
  /** The details toggle only exists on the list surface. */
  peekEnabled: boolean;
}

/**
 * The project issues toolbar cluster — Add filter, + New view and the
 * "Open details" peek toggle. Only mounted on a project's issues list; kept
 * out of AgentTasksPage so the page stays readable.
 */
const ProjectIssuesControls = memo<ProjectIssuesControlsProps>(
  ({
    detailsOpen,
    filters,
    milestoneId,
    milestones,
    onFiltersChange,
    onMilestoneChange,
    onNewView,
    onToggleDetails,
    peekEnabled,
  }) => {
    const { t } = useTranslation('chat');
    const { t: tCommon } = useTranslation('common');

    return (
      <>
        <IssueFilterPopover
          filters={filters}
          milestoneId={milestoneId}
          milestones={milestones}
          onChange={onFiltersChange}
          onMilestoneChange={onMilestoneChange}
          onOpenAdvanced={onNewView}
        />
        {/* "+ New view" — the reference's tab-strip affordance, landing in the
            toolbar cluster since our tabs are fixed sections. Seeds the
            saved-view builder with this project's scope plus applied filters. */}
        <Button
          aria-label={tCommon('savedViews.newView')}
          size="icon-sm"
          title={tCommon('savedViews.newView')}
          variant="ghost"
          onClick={onNewView}
        >
          {createElement(Plus, { 'size': 16, 'aria-hidden': true })}
        </Button>
        {/* "Open details" — arms peek mode; plain row clicks then select into
            the pane instead of navigating. List-only: on the board cards own
            their clicks, so the toggle hides. */}
        {peekEnabled && (
          <Button
            aria-label={detailsOpen ? t('taskList.details.close') : t('taskList.details.open')}
            aria-pressed={detailsOpen}
            className={cn(detailsOpen && 'bg-muted', undefined)}
            size="icon-sm"
            title={detailsOpen ? t('taskList.details.close') : t('taskList.details.open')}
            variant="ghost"
            onClick={onToggleDetails}
          >
            {createElement(detailsOpen ? PanelRightCloseIcon : PanelRightOpenIcon, {
              'size': 16,
              'aria-hidden': true,
            })}
          </Button>
        )}
      </>
    );
  },
);

ProjectIssuesControls.displayName = 'ProjectIssuesControls';

export default ProjectIssuesControls;
