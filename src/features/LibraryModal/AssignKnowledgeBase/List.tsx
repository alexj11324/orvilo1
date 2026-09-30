import { VirtuosoMasonry } from '@virtuoso.dev/masonry';
import { BookOpen, ServerCrash } from 'lucide-react';
import React, { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';

import SimpleEmpty from '@/components/SimpleEmpty';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { useAgentStore } from '@/store/agent';
import { useGlobalStore } from '@/store/global';

import Item from './Item';
import MasonryItemWrapper from './Item/MasonryItemWrapper';
import Loading from './Loading';
import MasonrySkeleton from './MasonrySkeleton';
import { resolvePickerScope } from './resolvePickerScope';
import { type ViewMode } from './ViewSwitcher';
import ViewSwitcher from './ViewSwitcher';
import VisibilityTabs, { type PickerVisibility } from './VisibilityTabs';

export const List = memo(() => {
  const { t } = useTranslation(['file', 'chat']);

  const [useFetchFilesAndKnowledgeBases, activeAgentId, agentVisibility, agentWorkspaceId] =
    useAgentStore((s) => [
      s.useFetchFilesAndKnowledgeBases,
      s.activeAgentId,
      s.activeAgentId ? s.agentMap[s.activeAgentId]?.visibility : undefined,
      s.activeAgentId ? s.agentMap[s.activeAgentId]?.workspaceId : undefined,
    ]);

  const [mode, setMode] = useState<PickerVisibility>('public');
  const { effectiveVisibility, showPublicAgentHint, showVisibilityTabs } = resolvePickerScope({
    agentVisibility,
    agentWorkspaceId,
    mode,
  });

  const { isLoading, error, data } = useFetchFilesAndKnowledgeBases(
    activeAgentId,
    effectiveVisibility,
  );

  const [columnCount, setColumnCount] = useState(2);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const viewMode = useGlobalStore((s) => s.status.knowledgeBaseModalViewMode || 'list') as ViewMode;
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const setViewMode = (mode: ViewMode) => {
    setIsTransitioning(true);
    updateSystemStatus({ knowledgeBaseModalViewMode: mode });
  };

  // Update column count based on window size (max 2 columns for modal)
  const updateColumnCount = React.useCallback(() => {
    const width = window.innerWidth;
    if (width < 480) {
      setColumnCount(1);
    } else {
      setColumnCount(2);
    }
  }, []);

  // Initialize column count on mount
  React.useEffect(() => {
    updateColumnCount();
  }, [updateColumnCount]);

  // Set up resize listener when in masonry mode
  React.useEffect(() => {
    if (viewMode === 'masonry') {
      window.addEventListener('resize', updateColumnCount);
      return () => window.removeEventListener('resize', updateColumnCount);
    }
  }, [viewMode, updateColumnCount]);

  // Handle view transition with a brief delay to show skeleton
  React.useEffect(() => {
    if (isTransitioning && data) {
      requestAnimationFrame(() => {
        const timer = setTimeout(() => {
          setIsTransitioning(false);
        }, 100);
        return () => clearTimeout(timer);
      });
    }
  }, [isTransitioning, viewMode, data]);

  const isEmpty = data && data.length === 0;

  const masonryContext = useMemo(() => ({}), []);

  return (
    <div className="flex flex-col h-[500px]">
      {/*
       * Toolbar sits flush with the list items below: Virtuoso uses
       * `marginInline: -16` to pull rows back to the outer edge and each
       * Item re-applies `paddingInline={16}`. Match that here so the tab
       * group and view switcher line up with the item icons / add buttons.
       */}
      <div className="flex flex-col gap-2" style={{ paddingBlockEnd: 12 }}>
        <div className="flex flex-row items-center justify-between">
          {showVisibilityTabs ? <VisibilityTabs value={mode} onChange={setMode} /> : <span />}
          <ViewSwitcher view={viewMode} onViewChange={setViewMode} />
        </div>
        {showPublicAgentHint && (
          <Alert variant="info">
            <InfoIcon />
            <AlertTitle>
              {t('resources.knowledgePicker.publicAgentHint', { ns: 'chat' })}
            </AlertTitle>
          </Alert>
        )}
      </div>
      {isLoading || isTransitioning ? (
        viewMode === 'masonry' ? (
          <MasonrySkeleton columnCount={columnCount} />
        ) : (
          <Loading />
        )
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 p-10">
          {error ? (
            <>
              <span className="anticon" role="img">
                <ServerCrash fill={'transparent'} height={80} size={80} width={80} />
              </span>
              {t('networkError')}
            </>
          ) : (
            <SimpleEmpty
              description={t('empty')}
              descriptionProps={{ fontSize: 14 }}
              icon={BookOpen}
              style={{ maxWidth: 400 }}
            />
          )}
        </div>
      ) : viewMode === 'list' ? (
        <Virtuoso
          increaseViewportBy={typeof window !== 'undefined' ? window.innerHeight : 0}
          overscan={24}
          style={{ flex: 1, marginInline: -16 }}
          totalCount={data!.length}
          itemContent={(index) => {
            const item = data![index];
            return <Item key={item.id} {...item} />;
          }}
        />
      ) : (
        <div style={{ height: '100%', position: 'relative' }}>
          <div style={{ inset: 0, position: 'absolute' }}>
            <VirtuosoMasonry
              ItemContent={MasonryItemWrapper}
              columnCount={columnCount}
              context={masonryContext}
              data={data || []}
              style={{
                gap: '16px',
                height: '100%',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default List;
