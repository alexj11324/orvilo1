'use client';

import { componentMap } from '@/features/Settings/features/componentMap';
import { SettingsTabs } from '@/store/global/initialState';

/**
 * Notification preferences are personal: there is one set, not one per
 * workspace. Like hotkeys and appearance, the workspace settings sidebar
 * mirrors the personal page (the platform-specific one from `componentMap`).
 */
const WorkspaceNotificationSetting = componentMap[SettingsTabs.Notification];

export default WorkspaceNotificationSetting;
