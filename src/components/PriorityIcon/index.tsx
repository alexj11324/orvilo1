'use client';

import type { IconType } from '@lobehub/icons';
import { cssVar } from 'antd-style';
import type { ComponentProps } from 'react';
import { memo } from 'react';

export const PRIORITY_LEVELS = [0, 1, 2, 3, 4] as const;

export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const isPriorityLevel = (value: unknown): value is PriorityLevel =>
  typeof value === 'number' && PRIORITY_LEVELS.includes(value as PriorityLevel);

export const resolvePriorityLevel = (value: null | number | undefined): PriorityLevel =>
  isPriorityLevel(value) ? value : 0;

export const getPriorityIconColor = (priority: null | number | undefined) =>
  resolvePriorityLevel(priority) === 1 ? cssVar.orange : cssVar.colorTextSecondary;

export const PriorityNoneIcon: IconType = memo(({ size = '1em', style, ...rest }) => (
  <svg
    fill="currentColor"
    fillRule="evenodd"
    height={size}
    style={{ flex: 'none', lineHeight: 1, ...style }}
    viewBox="0 0 16 16"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    <path
      d="M4 7.25H2a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-.5a.5.5 0 00-.5-.5zM9 7.25H7a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-.5a.5.5 0 00-.5-.5zM14 7.25h-2a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-.5a.5.5 0 00-.5-.5z"
      opacity=".9"
    />
  </svg>
));

export const PriorityLowIcon: IconType = memo(({ size = '1em', style, ...rest }) => (
  <svg
    fill="currentColor"
    fillRule="evenodd"
    height={size}
    style={{ flex: 'none', lineHeight: 1, ...style }}
    viewBox="0 0 16 16"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    <path d="M3.5 8h-1a1 1 0 00-1 1v4a1 1 0 001 1h1a1 1 0 001-1V9a1 1 0 00-1-1z" />
    <path
      d="M8.5 5h-1a1 1 0 00-1 1v7a1 1 0 001 1h1a1 1 0 001-1V6a1 1 0 00-1-1zM13.5 2h-1a1 1 0 00-1 1v10a1 1 0 001 1h1a1 1 0 001-1V3a1 1 0 00-1-1z"
      fillOpacity={0.4}
    />
  </svg>
));

export const PriorityMediumIcon: IconType = memo(({ size = '1em', style, ...rest }) => (
  <svg
    fill="currentColor"
    fillRule="evenodd"
    height={size}
    style={{ flex: 'none', lineHeight: 1, ...style }}
    viewBox="0 0 16 16"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    <path d="M3.5 8h-1a1 1 0 00-1 1v4a1 1 0 001 1h1a1 1 0 001-1V9a1 1 0 00-1-1zM8.5 5h-1a1 1 0 00-1 1v7a1 1 0 001 1h1a1 1 0 001-1V6a1 1 0 00-1-1z" />
    <path
      d="M13.5 2h-1a1 1 0 00-1 1v10a1 1 0 001 1h1a1 1 0 001-1V3a1 1 0 00-1-1z"
      fillOpacity={0.4}
    />
  </svg>
));

export const PriorityHighIcon: IconType = memo(({ size = '1em', style, ...rest }) => (
  <svg
    fill="currentColor"
    fillRule="evenodd"
    height={size}
    style={{ flex: 'none', lineHeight: 1, ...style }}
    viewBox="0 0 16 16"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    <path d="M3.5 8h-1a1 1 0 00-1 1v4a1 1 0 001 1h1a1 1 0 001-1V9a1 1 0 00-1-1zM8.5 5h-1a1 1 0 00-1 1v7a1 1 0 001 1h1a1 1 0 001-1V6a1 1 0 00-1-1zM13.5 2h-1a1 1 0 00-1 1v10a1 1 0 001 1h1a1 1 0 001-1V3a1 1 0 00-1-1z" />
  </svg>
));

export const PriorityUrgentIcon: IconType = memo(({ size = '1em', style, ...rest }) => (
  <svg
    fill="currentColor"
    fillRule="evenodd"
    height={size}
    style={{ flex: 'none', lineHeight: 1, ...style }}
    viewBox="0 0 16 16"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    <path d="M3 1c-1.09 0-2 .91-2 2v10c0 1.09.91 2 2 2h10c1.09 0 2-.91 2-2V3c0-1.09-.91-2-2-2H3zm4 3h2l-.246 4.998H7.25L7 4zm2 7a1 1 0 11-2 0 1 1 0 012 0z" />
  </svg>
));

export const PRIORITY_ICONS = {
  0: PriorityNoneIcon,
  1: PriorityUrgentIcon,
  2: PriorityHighIcon,
  3: PriorityMediumIcon,
  4: PriorityLowIcon,
} as const satisfies Record<PriorityLevel, IconType>;

export type PriorityIconProps = ComponentProps<IconType> & {
  priority?: null | number;
};

export const PriorityIcon = memo<PriorityIconProps>(({ color, priority, ...rest }) => {
  const level = resolvePriorityLevel(priority);
  const Icon = PRIORITY_ICONS[level];

  return <Icon color={color ?? getPriorityIconColor(level)} {...rest} />;
});

PriorityIcon.displayName = 'PriorityIcon';
