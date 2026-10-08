import { HistoryIcon, PlusIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceCollection } from '@/features/WorkSurface';
import { usePermission } from '@/hooks/usePermission';

import { AutomationScopeSwitch, AutomationStatusSelect } from './AutomationScheduleFilters';
import AutomationScheduleList from './AutomationScheduleList';
import AutomationTemplateGallery from './AutomationTemplateGallery';
import {
  type AutomationScope,
  type AutomationStatusFilter,
  resolveAutomationScope,
  resolveAutomationStatusFilter,
} from './shared';
import { useScheduledTaskPage } from './useScheduledTaskPage';

/**
 * The Automations page is a shell around the shared scheduled-task surface.
 *
 * It owns only what is page-specific — its title row, the "All runs" link, the
 * create button, and the URL params the filters write to. The rows, search,
 * selection and batch actions all live in `AutomationScheduleList`, which the
 * Tasks page's automations tab mounts too, and the read comes from
 * `useScheduledTaskPage`, so both doors share one SWR cache entry.
 */
const AutomationsPage = memo(() => {
  const { t } = useTranslation('automation');
  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canCreate, reason } = usePermission('create_content');
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = resolveAutomationScope(searchParams);
  const statusFilter = resolveAutomationStatusFilter(searchParams);
  const [page, setPage] = useState(1);

  const { data, error, isLoading, mutate } = useScheduledTaskPage({ page, scope, statusFilter });

  const tasks = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasSettled = data !== undefined;

  // A narrowing shrinks the result set, so the old page number is meaningless.
  useEffect(() => {
    setPage(1);
  }, [scope, statusFilter]);

  const updateParams = useCallback(
    (mutator: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams);
      mutator(next);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const setScope = useCallback(
    (value: AutomationScope) =>
      updateParams((next) =>
        value === 'created' ? next.set('scope', 'created') : next.delete('scope'),
      ),
    [updateParams],
  );

  const setStatusFilter = useCallback(
    (value: AutomationStatusFilter) =>
      updateParams((next) => (value === 'all' ? next.delete('status') : next.set('status', value))),
    [updateParams],
  );

  const startBlank = useCallback(() => navigate('/automations/new'), [navigate]);

  const headerLeft = (
    <div className="flex items-center gap-3">
      <div className="text-sm font-medium">{t('page.title')}</div>
      <AutomationScopeSwitch scope={scope} onChange={setScope} />
    </div>
  );

  return (
    <WorkSurface>
      <NavHeader
        left={headerLeft}
        styles={{ left: { gap: 12, paddingLeft: 8 } }}
        right={
          <div className="flex items-center gap-1.5">
            <AutomationStatusSelect value={statusFilter} onChange={setStatusFilter} />
            <WorkspaceLink to={'/automations/runs'}>
              <Button size="sm" variant="ghost">
                <HistoryIcon data-icon="inline-start" />
                {t('overview.all_runs')}
              </Button>
            </WorkspaceLink>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex">
                      <Button
                        disabled={!canCreate}
                        size="sm"
                        variant="outline"
                        onClick={startBlank}
                      >
                        <PlusIcon data-icon="inline-start" />
                        {t('page.new_automation')}
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>{canCreate ? undefined : reason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        }
      />
      <WorkSurfaceCollection>
        <AutomationScheduleList
          emptyContent={<AutomationTemplateGallery persistent={false} onStartBlank={startBlank} />}
          error={error}
          footer={<AutomationTemplateGallery persistent onStartBlank={startBlank} />}
          hasSettled={hasSettled}
          isFiltered={statusFilter !== 'all'}
          isLoading={isLoading}
          page={page}
          tasks={tasks}
          total={total}
          onPageChange={setPage}
          onRefetch={() => mutate()}
        />
      </WorkSurfaceCollection>
    </WorkSurface>
  );
});

AutomationsPage.displayName = 'AutomationsPage';

export default AutomationsPage;
