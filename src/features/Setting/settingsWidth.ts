/** Named content widths; pixel geometry belongs to SettingContainer. */
export type SettingsContentWidth = 'form' | 'wide';

// Lists, comparison grids and reports need the wide lane. All new form tabs
// inherit the form lane. Both personal `stats` and workspace `statistics` routes
// use this policy, including the route loading skeleton.
const WIDE_TABS = new Set([
  'apikey',
  'audit-log',
  'billing',
  'connector',
  'credential',
  'credits',
  'devices',
  'imports',
  'integrations',
  'members',
  'memory',
  'plans',
  'provider',
  'statistics',
  'stats',
  'storage',
  'usage',
]);

export const getSettingsContentWidth = (tab?: string): SettingsContentWidth =>
  tab && WIDE_TABS.has(tab) ? 'wide' : 'form';
