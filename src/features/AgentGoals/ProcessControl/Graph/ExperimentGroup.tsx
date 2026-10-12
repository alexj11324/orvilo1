import { Handle, type NodeProps, Position } from '@xyflow/react';
import { cn } from 'cn';
import { ChevronDown, FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { experimentStatusVisual } from './experimentStatus';
import type { GraphNodeData } from './GraphNode';

export interface ExperimentGroupData extends GraphNodeData {
  onEnter: () => void;
  onInspect: () => void;
  onToggle: () => void;
}

const styles = {
  frame: 'box-border size-full border border-border rounded-(--radius-card) bg-muted',
  header:
    'box-border h-[calc(var(--spacing)*12.5)] px-4 border-be border-divider rounded-t-(--radius-card) rounded-b-none bg-card',
  title: 'min-w-0 truncate',
};

/** An expanded answer encloses its work without replacing the surrounding map. */
const ExperimentGroup = ({ data }: NodeProps) => {
  const { view, memberCount, onToggle, onInspect, onEnter } = data as ExperimentGroupData;
  const { t } = useTranslation('chat');
  const status = experimentStatusVisual(view.node.status);
  return (
    <div className={styles.frame}>
      <Handle position={Position.Top} type={'target'} />
      <div className={`flex items-center gap-3 justify-between ${styles.header}`}>
        <Button
          aria-expanded
          aria-label={t('goalExperiment.collapseNamed', { title: view.node.title })}
          size="compact"
          title={view.node.title}
          className={cn(
            "nodrag flex-1 min-w-0 relative pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-px pointer-coarse:after:-inset-y-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <ChevronDown size={16} />
          <FlaskConical size={16} />
          <span className={styles.title}>
            {t('goalExperiment.number', { number: view.seq })} · {view.node.title}
          </span>
        </Button>
        <div className="flex shrink-0 gap-1">
          <Button
            size="compact"
            className={cn(
              "nodrag relative pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-px pointer-coarse:after:-inset-y-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onInspect();
            }}
          >
            {t('goalExperiment.inspect')}
          </Button>
          <Button
            aria-label={t('goalExperiment.drillNamed', { title: view.node.title })}
            size="compact"
            className={cn(
              "nodrag relative pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-px pointer-coarse:after:-inset-y-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onEnter();
            }}
          >
            {t('goalExperiment.drill')}
          </Button>
        </div>
      </div>
      <div className="box-border flex h-7 items-center gap-3 py-1 px-4">
        <div className="flex items-center gap-1.25">
          <status.icon color={status.color} size={16} />
          <div className="text-xs" style={{ color: status.color }}>
            {t(`goalExperiment.status.${view.node.status}`)}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {t('goalExperiment.members', { count: memberCount ?? 0 })}
        </div>
      </div>
      <Handle position={Position.Bottom} type={'source'} />
    </div>
  );
};

export default ExperimentGroup;
