import { Flexbox, Tooltip } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { HistoryIcon, PlusIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
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
    <Flexbox horizontal align={'center'} gap={12}>
      <Text fontSize={15} weight={600}>
        {t('page.title')}
      </Text>
      <AutomationScopeSwitch scope={scope} onChange={setScope} />
    </Flexbox>
  );

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        left={headerLeft}
        styles={{ left: { gap: 12, paddingLeft: 8 } }}
        right={
          <Flexbox horizontal align={'center'} gap={6}>
            <AutomationStatusSelect value={statusFilter} onChange={setStatusFilter} />
            <WorkspaceLink to={'/automations/runs'}>
              <Button icon={HistoryIcon} size={'small'} type={'text'}>
                {t('overview.all_runs')}
              </Button>
            </WorkspaceLink>
            <Tooltip title={canCreate ? undefined : reason}>
              <Button
                disabled={!canCreate}
                icon={PlusIcon}
                size={'small'}
                type={'primary'}
                onClick={startBlank}
              >
                {t('page.new_automation')}
              </Button>
            </Tooltip>
          </Flexbox>
        }
      />
      <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }}>
        <WideScreenContainer fullWidth paddingBlock={16} paddingInline={24}>
          <AutomationScheduleList
            error={error}
            footer={<AutomationTemplateGallery persistent onStartBlank={startBlank} />}
            hasSettled={hasSettled}
            isFiltered={statusFilter !== 'all'}
            isLoading={isLoading}
            page={page}
            tasks={tasks}
            total={total}
            emptyContent={
              <AutomationTemplateGallery persistent={false} onStartBlank={startBlank} />
            }
            onPageChange={setPage}
            onRefetch={() => mutate()}
          />
        </WideScreenContainer>
      </Flexbox>
    </Flexbox>
  );
});

AutomationsPage.displayName = 'AutomationsPage';

export default AutomationsPage;
