'use client';

import { type CSSProperties, type HTMLAttributes, memo, type ReactNode } from 'react';

interface WorkspaceSettingsContainerProps extends HTMLAttributes<HTMLDivElement> {
  addonAfter?: ReactNode;
  addonBefore?: ReactNode;
  maxWidth?: number | string;
  paddingBlock?: CSSProperties['paddingBlock'];
  paddingInline?: CSSProperties['paddingInline'];
}

const WorkspaceSettingsContainer = memo<WorkspaceSettingsContainerProps>(
  ({
    maxWidth = 1024,
    children,
    addonAfter,
    addonBefore,
    paddingBlock,
    paddingInline,
    style,
    ...rest
  }) => (
    <div
      className="flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto bg-background"
      style={{ paddingBlock, paddingInline, ...style }}
      {...rest}
    >
      {addonBefore}
      <div className="flex w-full flex-1 flex-col gap-9" style={{ maxWidth }}>
        {children}
      </div>
      {addonAfter}
    </div>
  ),
);

export default WorkspaceSettingsContainer;
