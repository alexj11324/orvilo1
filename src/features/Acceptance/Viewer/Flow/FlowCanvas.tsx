import {
  Background,
  ControlButton,
  Controls,
  type Edge,
  type Node,
  type NodeTypes,
  ReactFlow,
  useReactFlow,
  useStore,
  useStoreApi,
  type Viewport,
} from '@xyflow/react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { observeWidth } from '@/features/AgentGoals/ProcessControl/Graph/useFitViewOnResize';
import { useSingleton } from '@/hooks/useSingleton';

import { FlowAnchorContext } from './flowAnchor';
import { FlowEdge } from './FlowEdge';
import type { FlowGraphData } from './flowGraph';
import { getSelectedFlowNodeId, panNodeIntoView } from './flowViewport';

const edgeTypes = { transition: FlowEdge };

const fitOptions = { maxZoom: 1, minZoom: 0.65, padding: 0.08 };
const styles = {
  canvas:
    'overflow-hidden flex-none w-full min-w-0 h-[clamp(520px,calc(100dvh-400px),900px)] rounded-(--radius-card) bg-transparent [&_.react-flow\\_\\_edgelabel-renderer]:z-5',
  controls:
    'gap-1 rounded-(--radius-card) bg-card p-1 [--xy-controls-button-background-color:var(--card)] [--xy-controls-button-background-color-hover:var(--accent)] [--xy-controls-button-color:var(--muted-foreground)] [--xy-controls-button-color-hover:var(--foreground)] [--xy-controls-button-border-color:var(--divider)] [--xy-controls-box-shadow:var(--shadow-popover)]',
  control:
    'rounded-(--radius-button) outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
};

// React Flow's unlayered button and SVG rules win over layered utilities.
// Its public style props bind the compact 32px target and standard 16px glyph.
const controlButtonStyle: CSSProperties = {
  width: 'calc(var(--spacing) * 8)',
  height: 'calc(var(--spacing) * 8)',
};
const controlGlyphStyle: CSSProperties = {
  width: 'calc(var(--spacing) * 4)',
  height: 'calc(var(--spacing) * 4)',
  maxWidth: 'none',
  maxHeight: 'none',
  fill: 'none',
};

export function FlowCanvas({
  fullscreen = false,
  nodes,
  edges,
  nodeTypes,
  onSelect,
  viewKey,
}: {
  fullscreen?: boolean;
  nodes: Node<FlowGraphData>[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  onSelect: (id: string) => void;
  viewKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const store = useStoreApi();
  const { fitView, getNodesBounds, getViewport, setViewport, zoomIn, zoomOut } = useReactFlow();
  const ariaLabelConfig = useStore((state) => state.ariaLabelConfig);
  const minZoomReached = useStore((state) => state.transform[2] <= state.minZoom);
  const maxZoomReached = useStore((state) => state.transform[2] >= state.maxZoom);
  const anchor = useSingleton(() => ({ current: null as string | null }));
  // The toggled group has just changed height, so follow it rather than leaving
  // the user staring at whatever slid into its place.
  useEffect(() => {
    const toggled = anchor.current;
    anchor.current = null;
    const container = ref.current;
    if (!toggled || !container) return;
    panNodeIntoView(
      { getNodesBounds, getViewport, setViewport },
      { height: container.clientHeight, width: container.clientWidth },
      toggled,
    );
  }, [nodes, anchor, getNodesBounds, getViewport, setViewport]);
  const viewports = useSingleton(
    () => new Map<string, { viewport: Viewport; width: number; height: number }>(),
  );
  const selectedId = getSelectedFlowNodeId(nodes);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  // The details panel opens beside the canvas when a node is picked. Refitting
  // here would throw away the zoom the user just set, so only bring the picked
  // node back into view when the narrower canvas hid it.
  useEffect(() => {
    const container = ref.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    return observeWidth(container, () =>
      panNodeIntoView(
        { getNodesBounds, getViewport, setViewport },
        { height: container.clientHeight, width: container.clientWidth },
        selectedRef.current,
      ),
    );
  }, [getNodesBounds, getViewport, setViewport]);
  // Cache the outgoing camera during the layout commit, before ResizeObserver
  // can measure the next fullscreen layout ahead of passive effect cleanup.
  useLayoutEffect(() => {
    const container = ref.current;
    const saved = viewports.get(viewKey);
    let unsubscribe: (() => void) | undefined;
    let frame: number;
    const restoreViewport = () => {
      if (!container) return;
      const { width, height } = store.getState();
      // DOM layout changes before React Flow's ResizeObserver measurement.
      // Reconcile against that public measurement before restoring or fitting.
      if (width !== container.clientWidth || height !== container.clientHeight) {
        unsubscribe ??= store.subscribe((next, previous) => {
          if (next.width !== previous.width || next.height !== previous.height) {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(restoreViewport);
          }
        });
        return;
      }
      unsubscribe?.();
      unsubscribe = undefined;
      if (saved && saved.width === width && saved.height === height)
        void setViewport(saved.viewport);
      else void fitView(fitOptions);
    };
    frame = requestAnimationFrame(restoreViewport);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe?.();
      // getViewport reads this same store. Keep its measured dimensions rather
      // than pairing the old camera with an already-mutated container's size.
      const { width, height } = store.getState();
      viewports.set(viewKey, { viewport: getViewport(), width, height });
    };
  }, [viewKey, fullscreen, fitView, getViewport, setViewport, store, viewports]);
  return (
    // Custom nodes render inside React Flow, not under its `children`, so the
    // anchor channel has to sit above the canvas to reach a group's toggle.
    <FlowAnchorContext value={anchor}>
      <div
        className={`flex flex-col ${styles.canvas}`}
        ref={ref}
        style={{ ...(fullscreen ? { flex: 1, height: '100%', minHeight: 0 } : undefined) }}
      >
        <ReactFlow
          fitView
          panOnDrag
          panOnScroll
          preventScrolling
          zoomOnDoubleClick
          zoomOnPinch
          colorMode="system"
          edgeTypes={edgeTypes}
          edges={edges}
          fitViewOptions={fitOptions}
          maxZoom={1.5}
          minZoom={0.08}
          nodeTypes={nodeTypes}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          proOptions={{ hideAttribution: true }}
          style={{ background: 'transparent' }}
          zoomOnScroll={false}
          // No onEdgeClick: the edge runs behind its own caption, so clicking
          // the caption selected the branch, opened the panel and shifted the
          // canvas out from under the pointer. Branches stay pickable in the
          // outline view; on the canvas the state card is the way in.
          onNodeClick={(_, n) => onSelect(n.id)}
          onPaneClick={() => onSelect('')}
        >
          <Background bgColor="transparent" color="var(--divider)" gap={18} size={1} />
          <Controls
            className={styles.controls}
            position="bottom-right"
            showFitView={false}
            showInteractive={false}
            showZoom={false}
          >
            <ControlButton
              aria-label={ariaLabelConfig['controls.zoomIn.ariaLabel']}
              className={`react-flow__controls-zoomin ${styles.control}`}
              disabled={maxZoomReached}
              style={controlButtonStyle}
              title={ariaLabelConfig['controls.zoomIn.ariaLabel']}
              type="button"
              onClick={() => void zoomIn()}
            >
              <Plus aria-hidden size={16} style={controlGlyphStyle} />
            </ControlButton>
            <ControlButton
              aria-label={ariaLabelConfig['controls.zoomOut.ariaLabel']}
              className={`react-flow__controls-zoomout ${styles.control}`}
              disabled={minZoomReached}
              style={controlButtonStyle}
              title={ariaLabelConfig['controls.zoomOut.ariaLabel']}
              type="button"
              onClick={() => void zoomOut()}
            >
              <Minus aria-hidden size={16} style={controlGlyphStyle} />
            </ControlButton>
            <ControlButton
              aria-label={ariaLabelConfig['controls.fitView.ariaLabel']}
              className={`react-flow__controls-fitview ${styles.control}`}
              style={controlButtonStyle}
              title={ariaLabelConfig['controls.fitView.ariaLabel']}
              type="button"
              onClick={() => void fitView()}
            >
              <Maximize aria-hidden size={16} style={controlGlyphStyle} />
            </ControlButton>
          </Controls>
        </ReactFlow>
      </div>
    </FlowAnchorContext>
  );
}
