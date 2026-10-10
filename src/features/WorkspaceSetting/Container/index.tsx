'use client';

import SettingContainer, { type SettingContainerProps } from '@/features/Setting/SettingContainer';

type WorkspaceSettingsContainerProps = Omit<SettingContainerProps, 'variant'>;

/** Shared width and DOM owner, retaining the workspace's CSS-only card surface. */
const WorkspaceSettingsContainer = (props: WorkspaceSettingsContainerProps) => (
  <SettingContainer {...props} variant="workspace" />
);

export default WorkspaceSettingsContainer;
