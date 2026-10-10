'use client';

import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { type CSSProperties } from 'react';
import { memo } from 'react';

// Pending an exact shared colorFill alias; keep the actual theme role until then.
const themeStyles = createStaticStyles(({ css, cssVar }) => ({
  ring: css`
    stroke: ${cssVar.colorFill};
  `,
}));

const styles = {
  center: 'fill-muted-foreground animate-neural-scale',
  connection: 'opacity-30 stroke-muted-foreground [stroke-width:0.5]',
  container: 'flex items-center justify-center',
  node: 'fill-muted-foreground animate-neural-pulse',
  particle: 'fill-muted-foreground animate-neural-flow',
  ring: cn(
    'origin-center fill-none stroke-1 [stroke-dasharray:0_8] animate-neural-rotate',
    themeStyles.ring,
  ),
  svg: 'size-full',
};

interface NeuralNetworkLoadingProps {
  size?: number;
}

const NeuralNetworkLoading = memo<NeuralNetworkLoadingProps>(({ size = 16 }) => {
  const nodeCount = 3;
  const layerCount = 3;

  // Generate nodes for each layer
  const nodes = [];
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
      const x = 25 + layerIndex * 25;
      const y = 25 + nodeIndex * 25;
      const delay = (layerIndex * nodeCount + nodeIndex) * 0.2;
      nodes.push(
        <circle
          className={styles.node}
          cx={x}
          cy={y}
          key={`node-${layerIndex}-${nodeIndex}`}
          r="3"
          style={{ animationDelay: `${delay}s` }}
        />,
      );
    }
  }

  // Generate connections between layers
  const connections = [];
  for (let layerIndex = 0; layerIndex < layerCount - 1; layerIndex++) {
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
      const x1 = 25 + layerIndex * 25;
      const y1 = 25 + nodeIndex * 25;
      for (let targetIndex = 0; targetIndex < nodeCount; targetIndex++) {
        const x2 = 25 + (layerIndex + 1) * 25;
        const y2 = 25 + targetIndex * 25;
        connections.push(
          <line
            className={styles.connection}
            key={`connection-${layerIndex}-${nodeIndex}-${targetIndex}`}
            x1={x1}
            x2={x2}
            y1={y1}
            y2={y2}
          />,
        );
      }
    }
  }

  // Generate particles
  const particles = [0, 1, 2].map((index) => (
    <circle
      className={styles.particle}
      cx={25}
      cy={50}
      key={`particle-${index}`}
      r="1.5"
      style={
        {
          '--flow-distance': '50px',
          'animationDelay': `${index * 0.6}s`,
        } as CSSProperties
      }
    />
  ));

  return (
    <div className={styles.container} style={{ height: size, width: size }}>
      <svg className={styles.svg} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {/* Connections */}
        {connections}

        {/* Nodes */}
        {nodes}

        {/* Particles */}
        {particles}

        {/* Central processing unit */}
        <rect className={styles.center} height="6" width="6" x="47" y="47" />

        {/* Rotating outer ring */}
        <circle className={styles.ring} cx="50" cy="50" r="40" />
      </svg>
    </div>
  );
});

export default NeuralNetworkLoading;
