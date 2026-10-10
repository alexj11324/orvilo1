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
  frame:
    'box-border size-full border border-border rounded-[12px] bg-[color-mix(in_srgb,var(--info)_3%,transparent)]',
  header:
    'py-3 px-4 [border-block-end:1px_solid_var(--sidebar-border)] rounded-t-[12px] rounded-b-none bg-card',
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
          className={cn('nodrag')}
          size="sm"
          style={{ minWidth: 0 }}
          title={view.node.title}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <ChevronDown size={14} />
          <FlaskConical size={14} />
          <span className={styles.title}>
            {t('goalExperiment.number', { number: view.seq })} · {view.node.title}
          </span>
        </Button>
        <div className="flex gap-1" style={{ flexShrink: 0 }}>
          <Button
            className={cn('nodrag')}
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onInspect();
            }}
          >
            {t('goalExperiment.inspect')}
          </Button>
          <Button
            aria-label={t('goalExperiment.drillNamed', { title: view.node.title })}
            className={cn('nodrag')}
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onEnter();
            }}
          >
            {t('goalExperiment.drill')}
          </Button>
        </div>
      </div>
      <div className="flex gap-3" style={{ paddingBlock: 6, paddingInline: 16 }}>
        <div className="flex items-center gap-[5px]">
          <status.icon color={status.color} size={13} />
          <div className="text-[12px]" style={{ color: status.color }}>
            {t(`goalExperiment.status.${view.node.status}`)}
          </div>
        </div>
        <div className="text-[12px] text-muted-foreground">
          {t('goalExperiment.members', { count: memberCount ?? 0 })}
        </div>
      </div>
      <Handle position={Position.Bottom} type={'source'} />
    </div>
  );
};

export default ExperimentGroup;
