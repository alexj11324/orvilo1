'use client';

import { LockIcon } from 'lucide-react';
import { createElement, memo } from 'react';

import LibIcon from './index';

const styles = {
  badge:
    'absolute -inset-be-0.5 -end-1 flex items-center justify-center rounded-full bg-background p-0.5 text-muted-foreground',
  root: 'relative flex',
};

interface LockedLibIconProps {
  color?: string;
  size?: number;
}

/**
 * The shared "restricted library" visual: the library keeps its folder icon
 * (it is shared workspace content), and a small corner lock says members
 * cannot open it. Use this everywhere a member-restricted KB renders an icon,
 * so the state reads the same across sidebar, cards, and pickers.
 */
const LockedLibIcon = memo<LockedLibIconProps>(({ color, size = 20 }) => (
  <span className={styles.root}>
    <LibIcon color={color} size={size} />
    <span className={styles.badge} style={color === undefined ? undefined : { color }}>
      {createElement(LockIcon, { size: 14 })}
    </span>
  </span>
));

export default LockedLibIcon;
