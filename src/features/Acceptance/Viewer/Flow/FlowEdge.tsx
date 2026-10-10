import type { Edge, EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';

import { getFlowEdgeLabelLayout } from './flowEdgeLabel';

// Non-interactive captions retain an opaque surface beneath the translucent wash.
const styles = {
  label:
    'pointer-events-none absolute line-clamp-5 max-w-[200px] max-h-[94px] py-[5px] px-2.5 rounded-[8px] text-[12px] leading-[18px] text-muted-foreground wrap-anywhere whitespace-normal bg-card bg-[linear-gradient(var(--ant-color-fill-quaternary),var(--ant-color-fill-quaternary))]',
};

type TransitionEdge = Edge<{ laneOffset?: number }>;

/** Labels share the graph scale so zooming out preserves their spacing. */
export function FlowEdge(props: EdgeProps<TransitionEdge>) {
  const lane = props.data?.laneOffset ?? 0;
  const [path, labelX, labelY] = lane
    ? ([
        `M ${props.sourceX},${props.sourceY} C ${props.sourceX + (props.targetX - props.sourceX) / 3},${props.sourceY + lane} ${props.targetX - (props.targetX - props.sourceX) / 3},${props.targetY + lane} ${props.targetX},${props.targetY}`,
        (props.sourceX + props.targetX) / 2,
        (props.sourceY + props.targetY) / 2 + lane * 0.75,
      ] as const)
    : getSmoothStepPath({ ...props, borderRadius: 20, offset: 32 });
  const label = getFlowEdgeLabelLayout({ ...props, lane, labelX, labelY });
  return (
    <>
      <BaseEdge id={props.id} markerEnd={props.markerEnd} path={path} style={props.style} />
      <EdgeLabelRenderer>
        <div
          className={styles.label}
          style={{
            maxWidth: label.maxWidth,
            transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)`,
          }}
        >
          {props.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
