import { SettingsTabs } from '@/store/global/initialState';
import { WorkspaceSettingsTabs } from '@/types/workspaceSettings';

/** Settings content roles from DESIGN.md; page-owned layouts consume the same cap. */
export const settingWidthClassNames = {
  form: 'max-w-160',
  wide: 'max-w-256',
} as const;

export type SettingWidth = keyof typeof settingWidthClassNames;

const personalSettingsWidths: Partial<Record<SettingsTabs, SettingWidth>> = {
  [SettingsTabs.About]: 'form',
  [SettingsTabs.Advanced]: 'form',
  [SettingsTabs.Agents]: 'form',
  [SettingsTabs.APIKey]: 'wide',
  [SettingsTabs.Appearance]: 'form',
  [SettingsTabs.Connector]: 'wide',
  [SettingsTabs.Creds]: 'wide',
  [SettingsTabs.Devices]: 'wide',
  [SettingsTabs.Hotkey]: 'form',
  [SettingsTabs.Memory]: 'form',
  [SettingsTabs.Notification]: 'form',
  [SettingsTabs.Orchestrator]: 'form',
  [SettingsTabs.Profile]: 'form',
  [SettingsTabs.Provider]: 'wide',
  [SettingsTabs.Proxy]: 'form',
  [SettingsTabs.ServiceModel]: 'form',
  [SettingsTabs.Stats]: 'wide',
  [SettingsTabs.Storage]: 'form',
  [SettingsTabs.SystemTools]: 'form',
  // Public business pages are empty slots. Keep the existing wide shell and
  // skeleton caps; a real implementation must select its own content role.
  [SettingsTabs.Billing]: 'wide',
  [SettingsTabs.Credits]: 'wide',
  [SettingsTabs.Plans]: 'wide',
  [SettingsTabs.Usage]: 'wide',
};

const workspaceSettingsWidths: Partial<Record<WorkspaceSettingsTabs, SettingWidth>> = {
  [WorkspaceSettingsTabs.Creds]: 'wide',
  [WorkspaceSettingsTabs.Devices]: 'wide',
  [WorkspaceSettingsTabs.General]: 'form',
  [WorkspaceSettingsTabs.Imports]: 'wide',
  [WorkspaceSettingsTabs.Integrations]: 'wide',
  [WorkspaceSettingsTabs.Members]: 'wide',
  [WorkspaceSettingsTabs.Notification]: 'form',
  [WorkspaceSettingsTabs.Stats]: 'wide',
  // As above, the public billing slots have no rendered content to classify.
  [WorkspaceSettingsTabs.Billing]: 'wide',
  [WorkspaceSettingsTabs.Budget]: 'wide',
  [WorkspaceSettingsTabs.Credits]: 'wide',
  [WorkspaceSettingsTabs.Plans]: 'wide',
  [WorkspaceSettingsTabs.Usage]: 'wide',
};

/** Both route scopes keep their own tab ids; new configuration pages default to form. */
export const getSettingsWidth = (tab?: string): SettingWidth => {
  const width =
    personalSettingsWidths[tab as SettingsTabs] ??
    workspaceSettingsWidths[tab as WorkspaceSettingsTabs];
  return width === 'wide' ? 'wide' : 'form';
};
