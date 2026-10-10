import type { Edge, Node } from '@xyflow/react';
import { cn } from 'cn';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CirclePause,
  CircleX,
  CornerDownRight,
} from 'lucide-react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import type { FlowGraphData } from './flowGraph';
import { flowStateColor } from './FlowNode';
import { buildOutlineTree, type OutlineBranch, type OutlineStep } from './flowOutlineTree';

const styles = {
  item: 'w-full h-auto min-h-9 py-1.5 px-3 text-start whitespace-normal',
  branch:
    'justify-start w-fit max-w-full h-auto min-h-6 py-0.5 px-3 text-[12px] leading-[18px] text-start whitespace-normal',
  branchContent: 'text-(--ant-color-text-tertiary)',
  nested: 'ms-[18px] ps-2 border-s border-sidebar-border',
};

/** A readable traversal of the same graph: dependent steps are indented under the branch that leads to them. */
export function FlowOutline({
  nodes,
  edges,
  onSelect,
}: {
  nodes: Node<FlowGraphData>[];
  edges: Edge[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation('verify');
  const renderItem = (node: Node<FlowGraphData>) => {
    const { data } = node;
    const group = node.type === 'flowGroup';
    const glyph =
      data.state === 'passed'
        ? CheckCircle2
        : data.state === 'failed'
          ? CircleX
          : data.state === 'blocked'
            ? CirclePause
            : data.state === 'uncertain'
              ? CircleHelp
              : data.state === 'partial'
                ? CircleDot
                : CircleDashed;
    return (
      <Button
        aria-expanded={group ? !data.collapsed : undefined}
        className={cn(styles.item)}
        variant={data.selected ? 'outline' : 'ghost'}
        onClick={() => (group ? data.onToggle?.() : onSelect(node.id))}
      >
        <div className="flex items-center gap-2.5 w-full">
          {group && (data.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
          {createElement(glyph, {
            'aria-label': t(`flow.state.${data.state ?? 'pending'}`),
            'size': 18,
            'style': { color: flowStateColor(data.state), flex: 'none' },
          })}
          <div className="font-semibold" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            {data.title}
          </div>
          {group ? (
            <div className="text-[12px] text-muted-foreground">
              {data.passed}/{data.total}
            </div>
          ) : (
            <ChevronRight size={16} />
          )}
        </div>
      </Button>
    );
  };
  const renderBranchLabel = (branch: OutlineBranch, reference: boolean) => {
    const label = String(branch.edge.label ?? '');
    // A trigger that merely repeats the next step's title adds nothing above that step.
    if (!reference && (!label || label === branch.target.data.title)) return null;
    return (
      <Button
        className={cn(styles.branch)}
        key={branch.edge.id}
        variant="ghost"
        onClick={() => onSelect(branch.edge.id)}
      >
        {/* Top-aligned: a caption that wraps keeps its glyph on the first line and
            its later lines under the text, not under the glyph. */}
        <div className={`flex items-start gap-1.5 ${styles.branchContent}`}>
          {reference ? (
            <ArrowRight size={12} style={{ flex: 'none', marginBlockStart: 3 }} />
          ) : (
            <CornerDownRight size={12} style={{ flex: 'none', marginBlockStart: 3 }} />
          )}
          <span>{reference ? `${label} → ${branch.target.data.title}` : label}</span>
        </div>
      </Button>
    );
  };
  // A single continuation stays at the same level; a fork indents each path under its branch.
  const renderSequence = (step: OutlineStep): React.ReactNode[] => {
    const out: React.ReactNode[] = [
      <div className="flex flex-col gap-0.5" key={step.node.id}>
        {renderItem(step.node)}
        {step.node.type === 'flowGroup' && !step.node.data.collapsed && (
          <div className={`flex flex-col gap-0.5 ${styles.nested}`}>
            {step.members.flatMap(renderSequence)}
          </div>
        )}
      </div>,
    ];
    const expanded = step.branches.filter((branch) => branch.step);
    for (const branch of step.branches) {
      const label = renderBranchLabel(branch, !branch.step);
      if (!branch.step) {
        if (label) out.push(label);
        continue;
      }
      const steps = renderSequence(branch.step);
      if (expanded.length === 1) out.push(label, ...steps);
      else
        out.push(
          <div className="flex flex-col gap-0.5" key={`branch:${branch.edge.id}`}>
            {label}
            <div className={`flex flex-col gap-0.5 ${styles.nested}`}>{steps}</div>
          </div>,
        );
    }
    return out;
  };
  return (
    <div className="flex flex-col gap-0.5">
      {buildOutlineTree(nodes, edges).flatMap(renderSequence)}
    </div>
  );
}
