'use client';

import { cn } from 'cn';
import { memo } from 'react';
import { useMediaQuery } from 'react-responsive';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

const styles = {
  center: 'fill-muted-foreground motion-reduce:animate-none',
  connection: 'opacity-30 stroke-muted-foreground [stroke-width:0.5]',
  container: 'flex items-center justify-center',
  node: 'fill-muted-foreground motion-reduce:animate-none',
  particle: 'fill-muted-foreground [--flow-distance:50px] motion-reduce:animate-none',
  ring: 'origin-center fill-none stroke-(--loading-ring-fill) stroke-1 [stroke-dasharray:0_8] motion-reduce:animate-none',
  svg: 'size-full',
};

interface NeuralNetworkLoadingProps {
  size?: number;
}

const NeuralNetworkLoading = memo<NeuralNetworkLoadingProps>(({ size = 16 }) => {
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const shouldAnimate = animationMode !== 'disabled' && !prefersReducedMotion;

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
          className={cn(styles.node, shouldAnimate && 'animate-neural-pulse')}
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
      className={cn(styles.particle, shouldAnimate && 'animate-neural-flow')}
      cx={25}
      cy={50}
      key={`particle-${index}`}
      r="1.5"
      style={{ animationDelay: `${index * 0.6}s` }}
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
        <rect
          className={cn(styles.center, shouldAnimate && 'animate-neural-scale')}
          height="6"
          width="6"
          x="47"
          y="47"
        />

        {/* Rotating outer ring */}
        <circle
          className={cn(styles.ring, shouldAnimate && 'animate-neural-rotate')}
          cx="50"
          cy="50"
          r="40"
        />
      </svg>
    </div>
  );
});

export default NeuralNetworkLoading;
