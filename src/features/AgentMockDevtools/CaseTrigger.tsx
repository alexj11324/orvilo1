import type { MockCase } from '@orvilo/agent-mock';
import { cn } from 'cn';
import { ChevronDown } from 'lucide-react';
import { isValidElement, memo, type ReactNode, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { useMockCases } from './hooks/useMockCases';
import { useAgentMockStore } from './store/agentMockStore';

const styles = {
  empty: 'p-4 text-center text-sm leading-5.5 text-foreground-tertiary',
  group: 'px-3 pbs-2 pbe-1 text-xs font-medium leading-5 text-foreground-tertiary',
  item: 'flex min-h-9 cursor-pointer items-center justify-between gap-2 border-s border-transparent px-3 py-1.5 text-sm leading-5.5 text-muted-foreground hover:bg-accent pointer-coarse:min-h-11',
  itemActive: 'border-s-foreground bg-selected font-medium text-foreground',
  itemMeta: 'shrink-0 text-xs leading-5 tabular-nums text-foreground-tertiary',
  itemName: 'truncate',
  list: 'max-h-90 overflow-y-auto py-1',
  panel: 'w-80',
  search: 'border-be border-divider px-2 pbs-2 pbe-1',
  trigger:
    "relative max-w-60 gap-1.5 rounded-(--radius-input) border-divider bg-card px-2 text-sm font-medium leading-5.5 text-foreground hover:border-border hover:bg-accent pointer-coarse:after:absolute pointer-coarse:after:inset-[calc(var(--spacing)*-1.75)] pointer-coarse:after:content-['']",
  triggerName: 'min-w-0 truncate',
  triggerPlaceholder: 'text-foreground-tertiary',
};

const countTools = (c: MockCase): number => {
  if (typeof c.meta?.toolCount === 'number') return c.meta.toolCount;
  const events = sourceEvents(c);
  return events.filter((e) => e.type === 'tool_start').length;
};

const sourceEvents = (c: MockCase) => {
  if (c.source.type === 'fixture') return c.source.events;
  if (c.source.type === 'snapshot') return c.source.events ?? [];
  if (c.source.type === 'generator') return c.source.events ?? [];
  return [];
};

interface CasePanelProps {
  onClose: () => void;
  selectedCaseId: string | null;
  setSelectedCaseId: (id: string) => void;
}

const CasePanel = memo<CasePanelProps>(({ onClose, selectedCaseId, setSelectedCaseId }) => {
  const { builtins, snapshots, generated } = useMockCases();

  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.toLowerCase();
    const match = (arr: MockCase[]) =>
      needle ? arr.filter((c) => c.name.toLowerCase().includes(needle)) : arr;
    return [
      { items: match(builtins), key: 'builtin', label: 'Builtin' },
      { items: match(snapshots), key: 'snapshots', label: 'Snapshots' },
      { items: match(generated), key: 'generated', label: 'Generated' },
    ];
  }, [builtins, snapshots, generated, query]);

  const totalVisible = groups.reduce((sum, g) => sum + g.items.length, 0);

  const handlePick = (id: string) => {
    setSelectedCaseId(id);
    onClose();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.search}>
        <Input
          autoFocus
          placeholder="Search cases…"
          value={query}
          visualSize="compact"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.list}>
        {totalVisible === 0 && <div className={styles.empty}>No cases match.</div>}
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <div className="flex flex-col pbe-1" key={group.key}>
              <div className={styles.group}>
                {group.label} ({group.items.length})
              </div>
              {group.items.map((c) => {
                const active = selectedCaseId === c.id;
                const events = sourceEvents(c).length;
                const tools = countTools(c);
                return (
                  <div
                    {...clickableProps()}
                    key={c.id}
                    className={cn(
                      `${styles.item} ${active ? styles.itemActive : ''}`,
                      CLICKABLE_FOCUS_RING,
                    )}
                    onClick={() => handlePick(c.id)}
                  >
                    <span className={styles.itemName}>{c.name}</span>
                    <span className={styles.itemMeta}>
                      {events}e · {tools}t
                    </span>
                  </div>
                );
              })}
            </div>
          ),
        )}
      </div>
    </div>
  );
});

CasePanel.displayName = 'AgentMockCasePanel';

interface CaseTriggerProps {
  children?: ReactNode;
  placement?: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
}

export const CaseTrigger = memo<CaseTriggerProps>(({ children, placement = 'bottomLeft' }) => {
  const selectedCaseId = useAgentMockStore((s) => s.selectedCaseId);
  const setSelectedCaseId = useAgentMockStore((s) => s.setSelectedCaseId);
  const { all } = useMockCases();
  const current = all.find((c) => c.id === selectedCaseId);
  const [open, setOpen] = useState(false);

  const trigger = (
    <PopoverTrigger
      nativeButton={children !== undefined && !isValidElement(children) ? false : undefined}
      render={
        children === undefined ? (
          <Button className={styles.trigger} size="compact" type="button" variant="outline">
            {current ? (
              <span className={styles.triggerName}>{current.name}</span>
            ) : (
              <span className={styles.triggerPlaceholder}>Pick a case</span>
            )}
            <ChevronDown aria-hidden size={16} />
          </Button>
        ) : isValidElement(children) ? (
          children
        ) : (
          <span>{children}</span>
        )
      }
    />
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {children === undefined ? (
        <span className="inline-flex pointer-coarse:p-1.5">{trigger}</span>
      ) : (
        trigger
      )}
      <PopoverContent
        align={placement.endsWith('Right') ? 'end' : 'start'}
        className="w-80 p-0"
        side={placement.startsWith('top') ? 'top' : 'bottom'}
      >
        <CasePanel
          selectedCaseId={selectedCaseId}
          setSelectedCaseId={setSelectedCaseId}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
});

CaseTrigger.displayName = 'AgentMockCaseTrigger';
