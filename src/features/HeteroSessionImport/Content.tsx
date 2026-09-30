'use client';

import type {
  HeteroSessionDigest,
  HeteroSessionDirGroup,
  HeteroSessionDirPref,
  HeteroSessionImportStatus,
} from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { Check, FolderSearch, TriangleAlert, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useModalContext } from '@/components/Modal';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { electronHeteroSessionService } from '@/services/electron/heteroSession';
import { topicService } from '@/services/topic';
import { useChatStore } from '@/store/chat';

import { SessionRow } from './SessionList';
import SidebarTree, { type TreeScope } from './SidebarTree';
import { deriveSessionStatus, dirKeyOf, fmtTokens, type ImportRowState, selectable } from './utils';

const styles = createStaticStyles(({ css, cssVar }) => ({
  footer: css`
    padding-block: 12px;
    padding-inline: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

const CONTENT_HEIGHT = 'min(680px, calc(100vh - 240px))';

type Phase = 'done' | 'empty' | 'error' | 'importing' | 'scanning' | 'select';

interface ContentProps {
  agentId: string;
}

const Content = memo<ContentProps>(({ agentId }) => {
  const { t } = useTranslation(['topic', 'common']);
  const { close } = useModalContext();
  const refreshTopic = useChatStore((s) => s.refreshTopic);

  const [phase, setPhase] = useState<Phase>('scanning');
  const [groups, setGroups] = useState<HeteroSessionDirGroup[]>([]);
  const [status, setStatus] = useState<HeteroSessionImportStatus>();
  const [scope, setScope] = useState<TreeScope>('all');
  const [keyword, setKeyword] = useState('');
  const [hideImported, setHideImported] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState<Record<string, ImportRowState>>({});
  const abortedRef = useRef(false);

  const scan = useCallback(async () => {
    setPhase('scanning');
    setSelected(new Set());
    setProgress({});
    try {
      const result = await electronHeteroSessionService.listLocalSessions();
      if (result.groups.length === 0) {
        setGroups([]);
        setPhase('empty');
        return;
      }
      const importStatus = await topicService.getHeteroSessionImportStatus();
      setGroups(result.groups);
      setStatus(importStatus);
      setPhase('select');
    } catch (e) {
      // a failed scan is NOT an empty machine — say so, or the user reads a
      // broken request as "you have no sessions". The raw reason is a
      // developer string (parse errors, stack noise), so keep it in the console
      // and show the actionable copy instead.
      console.error('[HeteroSessionImport] scan failed', e);
      setGroups([]);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    scan();
    return () => {
      abortedRef.current = true;
    };
  }, [scan]);

  const setPref = useCallback(async (key: string, pref: HeteroSessionDirPref | null) => {
    setGroups((prev) =>
      prev.map((g) =>
        dirKeyOf(g.source, g.workingDirectory) === key ? { ...g, dirPref: pref ?? undefined } : g,
      ),
    );
    await electronHeteroSessionService.setDirPref({ key, pref });
  }, []);

  // ---------- derived list ----------

  const allSessions = useMemo(() => {
    const items: { digest: HeteroSessionDigest; group: HeteroSessionDirGroup }[] = [];
    for (const group of groups) for (const digest of group.sessions) items.push({ digest, group });
    return items;
  }, [groups]);

  const statusOf = useCallback(
    (digest: HeteroSessionDigest) => deriveSessionStatus(digest, status),
    [status],
  );

  const kw = keyword.trim().toLowerCase();
  const visible = allSessions.filter(({ digest, group }) => {
    if (group.dirPref === 'ignored') return false;
    if (scope !== 'all') {
      if (scope.includes('::')) {
        if (dirKeyOf(group.source, group.workingDirectory) !== scope) return false;
      } else if (group.source !== scope) return false;
    }
    const sessionStatus = statusOf(digest);
    if (hideImported && !selectable(sessionStatus)) return false;
    if (kw && !(digest.title ?? digest.firstPrompt ?? '').toLowerCase().includes(kw)) return false;
    return true;
  });

  const importing = phase === 'importing' || phase === 'done';
  const rows = importing
    ? allSessions.filter(({ digest }) => selected.has(digest.sessionId))
    : visible;

  const selectedItems = allSessions.filter(({ digest }) => selected.has(digest.sessionId));
  const estMessages = selectedItems.reduce((sum, { digest }) => sum + digest.messageCount, 0);
  const estTokens = selectedItems.reduce((sum, { digest }) => sum + (digest.tokens ?? 0), 0);

  const visibleSelectable = visible.filter(({ digest }) => selectable(statusOf(digest)));
  const allChecked =
    visibleSelectable.length > 0 &&
    visibleSelectable.every(({ digest }) => selected.has(digest.sessionId));
  const someChecked = visibleSelectable.some(({ digest }) => selected.has(digest.sessionId));

  const toggle = useCallback((sessionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const { digest } of visibleSelectable) {
        if (checked) next.add(digest.sessionId);
        else next.delete(digest.sessionId);
      }
      return next;
    });
  };

  // ---------- import flow ----------

  const importOne = useCallback(
    async (digest: HeteroSessionDigest): Promise<ImportRowState> => {
      const payload = await electronHeteroSessionService.readLocalSession({
        filePath: digest.filePath,
        source: digest.source,
      });
      if (!payload) return { ok: false };
      const [result] = await topicService.importHeteroSessions({
        agentId,
        sessions: [payload],
      });
      return { inserted: result?.insertedMessages ?? 0, ok: true };
    },
    [agentId],
  );

  const runImport = useCallback(async () => {
    setPhase('importing');
    const items = allSessions.filter(({ digest }) => selected.has(digest.sessionId));
    setProgress(Object.fromEntries(items.map(({ digest }) => [digest.sessionId, 'pending'])));

    for (const { digest } of items) {
      if (abortedRef.current) return;
      setProgress((prev) => ({ ...prev, [digest.sessionId]: 'running' }));
      let state: ImportRowState;
      try {
        state = await importOne(digest);
      } catch {
        state = { ok: false };
      }
      setProgress((prev) => ({ ...prev, [digest.sessionId]: state }));
    }
    setPhase('done');
    refreshTopic();
  }, [allSessions, importOne, refreshTopic, selected]);

  const retry = useCallback(
    async (sessionId: string) => {
      const item = allSessions.find(({ digest }) => digest.sessionId === sessionId);
      if (!item) return;
      setProgress((prev) => ({ ...prev, [sessionId]: 'running' }));
      let state: ImportRowState;
      try {
        state = await importOne(item.digest);
      } catch {
        state = { ok: false };
      }
      setProgress((prev) => ({ ...prev, [sessionId]: state }));
      // mirror runImport: a successful retry also created a topic, so refresh
      // the sidebar/topic cache or it stays hidden until an unrelated reload
      if (typeof state === 'object' && state.ok) refreshTopic();
    },
    [allSessions, importOne, refreshTopic],
  );

  // the currently importing row scrolls into view
  useEffect(() => {
    if (phase !== 'importing') return;
    const runningId = Object.entries(progress).find(([, v]) => v === 'running')?.[0];
    if (!runningId) return;
    document
      .querySelector(`[data-session-row="${CSS.escape(runningId)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [progress, phase]);

  // ---------- stats ----------

  const doneStates = Object.values(progress).filter((v) => typeof v === 'object');
  const doneStats = {
    failed: doneStates.filter((v) => !v.ok).length,
    inserted: doneStates.reduce((sum, v) => sum + (v.ok ? v.inserted : 0), 0),
    ok: doneStates.filter((v) => v.ok).length,
  };
  const pct = selectedItems.length
    ? Math.round((doneStates.length / selectedItems.length) * 100)
    : 0;

  // ---------- render ----------

  if (phase === 'scanning')
    return (
      <div
        className="flex flex-col items-center gap-4 justify-center"
        style={{ height: CONTENT_HEIGHT }}
      >
        <NeuralNetworkLoading size={48} />
        <div className="text-muted-foreground">{t('heteroImport.scanning')}</div>
      </div>
    );

  if (phase === 'empty')
    return (
      <div
        className="flex flex-col items-center gap-3 justify-center"
        style={{ height: CONTENT_HEIGHT }}
      >
        <FolderSearch size={40} style={{ opacity: 0.4 }} />
        <div className="font-medium">{t('heteroImport.empty.title')}</div>
        <div
          className="text-[13px] text-muted-foreground"
          style={{ maxWidth: 380, textAlign: 'center' }}
        >
          {t('heteroImport.empty.desc')}
        </div>
        <Button size="sm" onClick={scan}>
          {t('heteroImport.footer.rescan')}
        </Button>
      </div>
    );

  if (phase === 'error')
    return (
      <div
        className="flex flex-col items-center gap-3 justify-center"
        style={{ height: CONTENT_HEIGHT }}
      >
        <TriangleAlert size={40} style={{ opacity: 0.5 }} />
        <div className="font-medium">{t('heteroImport.error.title')}</div>
        <div
          className="text-[13px] text-muted-foreground"
          style={{ maxWidth: 380, textAlign: 'center' }}
        >
          {t('heteroImport.error.desc')}
        </div>
        <Button size="sm" onClick={scan}>
          {t('heteroImport.footer.rescan')}
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col">
      <div className="flex" style={{ height: CONTENT_HEIGHT }}>
        {!importing && (
          <SidebarTree groups={groups} scope={scope} onScopeChange={setScope} onSetPref={setPref} />
        )}
        <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
          {!importing && (
            <div className="flex flex-col gap-2" style={{ padding: '0 16px 10px' }}>
              <div className="relative">
                <FolderSearch
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={14}
                />
                <Input
                  className="h-7 pl-8"
                  placeholder={t('heteroImport.searchPlaceholder')}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={allChecked}
                    indeterminate={!allChecked && someChecked}
                    onCheckedChange={toggleAll}
                  />
                  <div className="text-[13px] text-muted-foreground">
                    {t('heteroImport.selectAll')}
                  </div>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox checked={hideImported} onCheckedChange={setHideImported} />
                  <div className="text-[13px] text-muted-foreground">
                    {t('heteroImport.hideImported')}
                  </div>
                </label>
              </div>
            </div>
          )}
          <ScrollArea style={{ flex: 1, padding: '0 8px 8px' }}>
            {rows.map(({ digest }) => (
              <SessionRow
                checked={selected.has(digest.sessionId)}
                importState={progress[digest.sessionId]}
                importing={importing}
                item={{ digest, status: statusOf(digest) }}
                key={`${digest.source}-${digest.sessionId}`}
                showDir={!scope.includes('::')}
                showRetry={phase === 'done'}
                onRetry={retry}
                onToggle={toggle}
              />
            ))}
            {rows.length === 0 && (
              <div className="flex flex-col items-center py-12">
                <div className="text-muted-foreground">{t('heteroImport.searchEmpty')}</div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {phase === 'select' && (
        <div className={cx(styles.footer, 'flex items-center justify-between')}>
          <div className="text-[13px] text-muted-foreground">
            {selected.size > 0
              ? t('heteroImport.footer.selected', {
                  messages: estMessages.toLocaleString(),
                  sessions: selected.size,
                  tokens: fmtTokens(estTokens),
                })
              : t('heteroImport.footer.hint')}
          </div>
          <div className="flex gap-2">
            <Button onClick={scan}>{t('heteroImport.footer.rescan')}</Button>
            <Button disabled={selected.size === 0} variant="default" onClick={runImport}>
              {selected.size > 0
                ? t('heteroImport.footer.import', { count: selected.size })
                : t('heteroImport.footer.importEmpty')}
            </Button>
          </div>
        </div>
      )}

      {phase === 'importing' && (
        <div className={cx(styles.footer, 'flex flex-col gap-1')} style={{ width: '100%' }}>
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-muted-foreground">
              {t('heteroImport.progress', { done: doneStates.length, total: selectedItems.length })}
            </div>
            <div className="text-[13px] text-muted-foreground">{pct}%</div>
          </div>
          <Progress value={pct} />
        </div>
      )}

      {phase === 'done' && (
        <div className={cx(styles.footer, 'flex items-center justify-between')}>
          <div className="flex items-center gap-2">
            {createElement(doneStats.failed ? X : Check, {
              size: 16,
              style: {
                color: doneStats.failed
                  ? 'var(--lobe-color-warning, #faad14)'
                  : 'var(--lobe-color-success, #52c41a)',
              },
            })}
            <div className="text-[13px]">
              {t('heteroImport.done.summary', {
                messages: doneStats.inserted.toLocaleString(),
                sessions: doneStats.ok,
              })}
              {doneStats.failed > 0 && t('heteroImport.done.failed', { count: doneStats.failed })}
            </div>
          </div>
          <Button variant="default" onClick={close}>
            {t('heteroImport.done.cta')}
          </Button>
        </div>
      )}
    </div>
  );
});

export default Content;
