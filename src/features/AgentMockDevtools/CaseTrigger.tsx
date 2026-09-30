import type { MockCase } from '@orvilo/agent-mock';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { ChevronDown } from 'lucide-react';
import { isValidElement, memo, type ReactNode, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useMockCases } from './hooks/useMockCases';
import { useAgentMockStore } from './store/agentMockStore';

const styles = createStaticStyles(({ css }) => ({
  empty: css`
    padding: 16px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-align: center;
  `,
  group: css`
    padding-block: 8px 4px;
    padding-inline: 12px;

    font-size: 11px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
  `,
  item: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    padding-block: 6px;
    padding-inline: 12px;
    border-inline-start: 1px solid transparent;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  itemActive: css`
    border-inline-start-color: ${cssVar.colorText};
    font-weight: 500;
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillSecondary};
  `,
  itemMeta: css`
    flex-shrink: 0;
    font-size: 11px;
    font-feature-settings: 'tnum';
    color: ${cssVar.colorTextTertiary};
  `,
  itemName: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  list: css`
    overflow-y: auto;
    max-height: 360px;
    padding-block: 4px;
  `,
  panel: css`
    width: 320px;
  `,
  search: css`
    padding-block: 8px 4px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  trigger: css`
    cursor: pointer;
    user-select: none;

    display: inline-flex;
    gap: 6px;
    align-items: center;

    max-width: 240px;
    padding-block: 4px;
    padding-inline: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 6px;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorText};

    background: ${cssVar.colorBgContainer};

    &:hover {
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  triggerName: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  triggerPlaceholder: css`
    color: ${cssVar.colorTextTertiary};
  `,
}));

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
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.list}>
        {totalVisible === 0 && <div className={styles.empty}>No cases match.</div>}
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <div className="flex flex-col" key={group.key} style={{ paddingBlockEnd: 4 }}>
              <div className={styles.group}>
                {group.label} ({group.items.length})
              </div>
              {group.items.map((c) => {
                const active = selectedCaseId === c.id;
                const events = sourceEvents(c).length;
                const tools = countTools(c);
                return (
                  <div
                    className={`${styles.item} ${active ? styles.itemActive : ''}`}
                    key={c.id}
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          children === undefined ? (
            <span className={styles.trigger}>
              {current ? (
                <span className={styles.triggerName}>{current.name}</span>
              ) : (
                <div className={cn(styles.triggerPlaceholder)}>Pick a case</div>
              )}
              <ChevronDown size={12} />
            </span>
          ) : isValidElement(children) ? (
            children
          ) : (
            <span>{children}</span>
          )
        }
      />
      <PopoverContent
        align={placement.endsWith('Right') ? 'end' : 'start'}
        side={placement.startsWith('top') ? 'top' : 'bottom'}
        style={{ padding: 0 }}
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
