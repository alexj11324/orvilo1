import type { HeteroSessionDirGroup, HeteroSessionDirPref } from '@orvilo/types';
import { cn } from 'cn';
import { ChevronRight, Eye, EyeOff, Folder, FolderGit2, Timer, X } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { ClaudeCode, Codex } from '@/components/BrandIcons';
import { DraggablePanel } from '@/components/DraggablePanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { baseName, dirKeyOf } from './utils';

const styles = {
  child:
    'cursor-pointer h-8 py-0 ps-7 pe-2 rounded-(--radius-button) [&_.tree-actions]:hidden [&_.tree-actions]:flex-none [&_.tree-actions]:gap-0.5 [&_.tree-actions]:items-center hover:bg-accent hover:[&_.tree-actions]:flex focus-within:[&_.tree-actions]:flex hover:[&_.tree-count]:hidden focus-within:[&_.tree-count]:hidden',
  childActive: 'bg-selected hover:bg-selected',
  parent: 'cursor-pointer py-1.5 px-2 rounded-(--radius-button) hover:bg-accent',
  sidebar: 'w-full h-full py-3 px-2',
};

const BRAND = { 'claude-code': ClaudeCode, 'codex': Codex } as const;
const AGENT_LABEL = { 'claude-code': 'Claude Code', 'codex': 'Codex' } as const;
const SOURCES = ['claude-code', 'codex'] as const;

export type TreeScope = string; // 'all' | source | `${source}::${dir}`

interface SidebarTreeProps {
  groups: HeteroSessionDirGroup[];
  onScopeChange: (scope: TreeScope) => void;
  onSetPref: (key: string, pref: HeteroSessionDirPref | null) => void;
  scope: TreeScope;
}

const SidebarTree = memo<SidebarTreeProps>(({ groups, scope, onScopeChange, onSetPref }) => {
  const { t } = useTranslation('topic');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [showIgnored, setShowIgnored] = useState(false);

  const watched = groups.filter((g) => g.dirPref === 'watched');
  const ignored = groups.filter((g) => g.dirPref === 'ignored');
  const totalCount = groups
    .filter((g) => g.dirPref !== 'ignored')
    .reduce((sum, g) => sum + g.sessionCount, 0);

  const renderDirRow = (group: HeteroSessionDirGroup, leading: React.ReactNode) => {
    const key = dirKeyOf(group.source, group.workingDirectory);
    const isWatched = group.dirPref === 'watched';
    return (
      <TooltipProvider key={key}>
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                className={cn(
                  cn(styles.child, scope === key && styles.childActive),
                  'flex items-center gap-2 justify-between',
                )}
                onClick={() => onScopeChange(key)}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {leading}
                  <div
                    {...clickableProps()}
                    className={cn('truncate block text-sm leading-5.5', CLICKABLE_FOCUS_RING)}
                  >
                    {baseName(group.workingDirectory)}
                  </div>
                </div>
                <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
                  {isWatched ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <ActionIcon
                            aria-label={t('heteroImport.action.unwatch')}
                            icon={X}
                            size={{ blockSize: 24, borderRadius: 'var(--radius-button)', size: 16 }}
                            onClick={() => onSetPref(key, null)}
                          />
                        }
                      />
                      <TooltipContent>{t('heteroImport.action.unwatch')}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <ActionIcon
                              aria-label={t('heteroImport.action.watch')}
                              icon={Timer}
                              size={{
                                blockSize: 24,
                                borderRadius: 'var(--radius-button)',
                                size: 16,
                              }}
                              onClick={() => onSetPref(key, 'watched')}
                            />
                          }
                        />
                        <TooltipContent>{t('heteroImport.action.watch')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <ActionIcon
                              aria-label={t('heteroImport.action.ignore')}
                              icon={EyeOff}
                              size={{
                                blockSize: 24,
                                borderRadius: 'var(--radius-button)',
                                size: 16,
                              }}
                              onClick={() => {
                                onSetPref(key, 'ignored');
                                if (scope === key) onScopeChange(group.source);
                              }}
                            />
                          }
                        />
                        <TooltipContent>{t('heteroImport.action.ignore')}</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </span>
                <div className="tree-count text-xs text-muted-foreground">{group.sessionCount}</div>
              </div>
            }
          />
          <TooltipContent side="right">{group.workingDirectory}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <DraggablePanel
      backgroundColor="var(--background)"
      defaultSize={{ width: 232 }}
      expandable={false}
      maxWidth={420}
      minWidth={180}
      placement="left"
    >
      <ScrollArea className={styles.sidebar}>
        <div
          {...clickableProps()}
          className={cn(
            cn(
              cn(styles.parent, scope === 'all' && styles.childActive),
              'flex items-center justify-between',
            ),
            CLICKABLE_FOCUS_RING,
          )}
          onClick={() => onScopeChange('all')}
        >
          <div
            className={cn('text-sm leading-5.5', scope === 'all' ? 'font-semibold' : 'font-normal')}
          >
            {t('heteroImport.allSessions')}
          </div>
          <div className="text-xs text-muted-foreground">{totalCount.toLocaleString()}</div>
        </div>

        {watched.length > 0 && (
          <div className="flex flex-col mbe-1">
            <div
              {...clickableProps()}
              className={cn(cn(styles.parent, 'flex items-center gap-1'), CLICKABLE_FOCUS_RING)}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has('watched')) next.delete('watched');
                  else next.add('watched');
                  return next;
                })
              }
            >
              <ChevronRight
                size={16}
                className={cn(
                  'transition-transform duration-(--orvilo-motion-mid) ease-[ease]',
                  !collapsed.has('watched') && 'rotate-90',
                )}
              />
              <Timer className="opacity-55" size={16} />
              <div className="text-sm leading-5.5 font-medium flex-1">
                {t('heteroImport.watchedGroup')}
              </div>
              <div className="text-xs text-muted-foreground">{watched.length}</div>
            </div>
            {!collapsed.has('watched') &&
              watched.map((group) => {
                const Brand = BRAND[group.source];
                return renderDirRow(group, <Brand className="flex-none" size={12} />);
              })}
          </div>
        )}

        {SOURCES.map((source) => {
          const dirs = groups.filter((g) => g.source === source && !g.dirPref);
          if (dirs.length === 0) return null;
          const open = !collapsed.has(source);
          const count = dirs.reduce((sum, g) => sum + g.sessionCount, 0);
          const Brand = BRAND[source];
          return (
            <div className="flex flex-col" key={source}>
              <div
                className={cn(
                  cn(styles.parent, scope === source && styles.childActive),
                  'flex items-center gap-1',
                )}
                onClick={() => onScopeChange(source)}
              >
                <ChevronRight
                  size={16}
                  className={cn(
                    'transition-transform duration-(--orvilo-motion-mid) ease-[ease]',
                    open && 'rotate-90',
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(source)) next.delete(source);
                      else next.add(source);
                      return next;
                    });
                  }}
                />
                <Brand size={15} />
                <div
                  className={cn(
                    'text-sm leading-5.5 flex-1',
                    scope === source ? 'font-semibold' : 'font-medium',
                  )}
                >
                  {AGENT_LABEL[source]}
                </div>
                <div className="text-xs text-muted-foreground">{count}</div>
              </div>
              {open &&
                dirs.map((group) =>
                  renderDirRow(
                    group,
                    createElement(group.isGit ? FolderGit2 : Folder, {
                      size: 16,
                      className: 'flex-none opacity-55',
                    }),
                  ),
                )}
            </div>
          );
        })}

        {ignored.length > 0 && (
          <div className="flex flex-col mbs-2">
            <div
              {...clickableProps()}
              className={cn(cn(styles.parent, 'flex items-center gap-1'), CLICKABLE_FOCUS_RING)}
              onClick={() => setShowIgnored((v) => !v)}
            >
              <ChevronRight
                size={16}
                className={cn(
                  'transition-transform duration-(--orvilo-motion-mid) ease-[ease]',
                  showIgnored && 'rotate-90',
                )}
              />
              <div className="text-xs text-muted-foreground">
                {t('heteroImport.ignoredGroup', { count: ignored.length })}
              </div>
            </div>
            {showIgnored &&
              ignored.map((group) => {
                const key = dirKeyOf(group.source, group.workingDirectory);
                const Brand = BRAND[group.source];
                return (
                  <TooltipProvider key={key}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <div
                            className={cn(
                              styles.child,
                              'flex items-center gap-2 justify-between opacity-55',
                            )}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Brand className="flex-none" size={12} />
                              <div className="truncate block text-sm leading-5.5">
                                {baseName(group.workingDirectory)}
                              </div>
                            </div>
                            <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <ActionIcon
                                      aria-label={t('heteroImport.action.restore')}
                                      icon={Eye}
                                      size={{
                                        blockSize: 24,
                                        borderRadius: 'var(--radius-button)',
                                        size: 16,
                                      }}
                                      onClick={() => onSetPref(key, null)}
                                    />
                                  }
                                />
                                <TooltipContent>{t('heteroImport.action.restore')}</TooltipContent>
                              </Tooltip>
                            </span>
                          </div>
                        }
                      />
                      <TooltipContent side="right">{group.workingDirectory}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
          </div>
        )}
      </ScrollArea>
    </DraggablePanel>
  );
});

export default SidebarTree;
