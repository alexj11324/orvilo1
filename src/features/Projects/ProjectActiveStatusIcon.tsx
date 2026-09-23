'use client';

import { useId } from 'react';

// Measured on the Linear project Properties rail; the Projects list uses the
// same filled In Progress mark beside its status percentage.
const ACTIVE_STATUS_PERIMETER =
  'M2.95778 3.02069L5.70777 1.36023C6.50244 0.88041 7.49756 0.88041 8.29223 1.36024L11.0422 3.02074C11.7918 3.47336 12.25 4.2852 12.25 5.16086V8.84803C12.25 9.7251 11.7904 10.5381 11.0388 10.9902L8.29114 12.6433C7.49693 13.1211 6.50355 13.1203 5.71011 12.6412L2.95775 10.9792C2.20815 10.5266 1.75 9.7148 1.75 8.83911V5.16082C1.75 4.28516 2.20816 3.47332 2.95778 3.02069Z';
const ACTIVE_STATUS_MASK =
  'M8.3779 4.74233C8.14438 4.60607 7.85562 4.60607 7.6221 4.74233L5.37209 6.05513C5.14168 6.18957 5 6.4363 5 6.70311V9.34216C5 9.60897 5.14168 9.85573 5.37209 9.99016L7.6221 11.303C7.85562 11.4392 8.14438 11.4392 8.3779 11.303L10.6279 9.99016C10.8583 9.85573 11 9.60897 11 9.34216V6.70311C11 6.4363 10.8583 6.18957 10.6279 6.05513L8.3779 4.74233Z';

export function ProjectActiveStatusIcon({ color, percent }: { color: string; percent?: number }) {
  const maskId = `project-active-status-${useId().replaceAll(':', '')}`;
  // The filled arc encodes issue completion — Linear's In Progress mark is a
  // progress ring, not a fixed-fill glyph. r=4 → circumference ≈ 25.13.
  const fill = Math.min(1, Math.max(0, (percent ?? 60) / 100)) * 25.13;
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={16}
      stroke="none"
      style={{ color, flex: 'none' }}
      viewBox="-1 -1 16 16"
      width={16}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={ACTIVE_STATUS_PERIMETER}
        fill="none"
        stroke="currentColor"
        strokeDasharray="3.14 0"
        strokeDashoffset={1}
        strokeLinejoin="bevel"
        strokeWidth={1.5}
      />
      <g mask={`url(#${maskId})`}>
        <circle
          cx={7}
          cy={7}
          fill="none"
          r={4}
          stroke="currentColor"
          strokeDasharray={`${fill} 25.13`}
          strokeWidth={8}
          transform="rotate(-90) translate(-14, 0)"
        />
      </g>
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <path d={ACTIVE_STATUS_MASK} fill="white" transform="translate(-1, -1)" />
      </mask>
    </svg>
  );
}
