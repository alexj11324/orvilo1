import { ClaudeCode, Codex } from '@lobehub/icons';
import { DraggablePanel } from '@lobehub/ui/base-ui';
import type { HeteroSessionDirGroup, HeteroSessionDirPref } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { ChevronRight, Eye, EyeOff, Folder, FolderGit2, Timer, X } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { baseName, dirKeyOf } from './utils';

const styles = createStaticStyles(({ css, cssVar }) => ({
  child: css`
    cursor: pointer;

    height: 32px;
    padding-block: 0;
    padding-inline: 28px 8px;
    border-radius: ${cssVar.borderRadius};

    .tree-actions {
      display: none;
      flex: none;
      gap: 2px;
      align-items: center;
    }

    &:hover {
      background: ${cssVar.colorFillTertiary};

      .tree-actions {
        display: flex;
      }

      .tree-count {
        display: none;
      }
    }
  `,
  childActive: css`
    background: ${cssVar.colorFillSecondary} !important;
  `,
  parent: css`
    cursor: pointer;
    padding-block: 6px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  sidebar: css`
    width: 100%;
    height: 100%;
    padding-block: 12px;
    padding-inline: 8px;
  `,
}));

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
                className={cx(
                  cx(styles.child, scope === key && styles.childActive),
                  'flex items-center gap-2 justify-between',
                )}
                onClick={() => onScopeChange(key)}
              >
                <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                  {leading}
                  <div className="truncate block text-[13px]">
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
                            size="small"
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
                              size="small"
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
                              size="small"
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
                <div className="tree-count text-[12px] text-muted-foreground">
                  {group.sessionCount}
                </div>
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
      backgroundColor={cssVar.colorBgLayout}
      defaultSize={{ width: 232 }}
      expandable={false}
      maxWidth={420}
      minWidth={180}
      placement="left"
    >
      <ScrollArea className={styles.sidebar}>
        <div
          className={cx(
            cx(styles.parent, scope === 'all' && styles.childActive),
            'flex items-center justify-between',
          )}
          onClick={() => onScopeChange('all')}
        >
          <div className={cn('text-[13px]', scope === 'all' ? 600 : 400)}>
            {t('heteroImport.allSessions')}
          </div>
          <div className="text-[12px] text-muted-foreground">{totalCount.toLocaleString()}</div>
        </div>

        {watched.length > 0 && (
          <div className="flex flex-col" style={{ marginBottom: 4 }}>
            <div
              className={cx(styles.parent, 'flex items-center gap-1')}
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
                size={13}
                style={{
                  transform: collapsed.has('watched') ? 'none' : 'rotate(90deg)',
                  transition: 'transform .15s',
                }}
              />
              <Timer size={13} style={{ opacity: 0.55 }} />
              <div className="text-[13px] font-medium" style={{ flex: 1 }}>
                {t('heteroImport.watchedGroup')}
              </div>
              <div className="text-[12px] text-muted-foreground">{watched.length}</div>
            </div>
            {!collapsed.has('watched') &&
              watched.map((group) => {
                const Brand = BRAND[group.source];
                return renderDirRow(group, <Brand size={12} style={{ flex: 'none' }} />);
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
                className={cx(
                  cx(styles.parent, scope === source && styles.childActive),
                  'flex items-center gap-1',
                )}
                onClick={() => onScopeChange(source)}
              >
                <ChevronRight
                  size={13}
                  style={{
                    transform: open ? 'rotate(90deg)' : 'none',
                    transition: 'transform .15s',
                  }}
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
                  className={cn('text-[13px]', scope === source ? 600 : 500)}
                  style={{ flex: 1 }}
                >
                  {AGENT_LABEL[source]}
                </div>
                <div className="text-[12px] text-muted-foreground">{count}</div>
              </div>
              {open &&
                dirs.map((group) =>
                  renderDirRow(
                    group,
                    createElement(group.isGit ? FolderGit2 : Folder, {
                      size: 13,
                      style: { flex: 'none', opacity: 0.55 },
                    }),
                  ),
                )}
            </div>
          );
        })}

        {ignored.length > 0 && (
          <div className="flex flex-col" style={{ marginTop: 8 }}>
            <div
              className={cx(styles.parent, 'flex items-center gap-1')}
              onClick={() => setShowIgnored((v) => !v)}
            >
              <ChevronRight
                size={13}
                style={{
                  transform: showIgnored ? 'rotate(90deg)' : 'none',
                  transition: 'transform .15s',
                }}
              />
              <div className="text-[12px] text-muted-foreground">
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
                            className={cx(styles.child, 'flex items-center gap-2 justify-between')}
                            style={{ opacity: 0.55 }}
                          >
                            <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                              <Brand size={12} style={{ flex: 'none' }} />
                              <div className="truncate block text-[13px]">
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
                                      size="small"
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
