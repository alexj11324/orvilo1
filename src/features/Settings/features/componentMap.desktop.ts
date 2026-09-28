import Billing from '@/business/client/BusinessSettingPages/Billing';
import Credits from '@/business/client/BusinessSettingPages/Credits';
import Plans from '@/business/client/BusinessSettingPages/Plans';
import Usage from '@/business/client/BusinessSettingPages/Usage';
import { SettingsTabs } from '@/store/global/initialState';

import About from '../about';
import Advanced from '../advanced';
import APIKey from '../apikey';
import Appearance from '../appearance';
import Connector from '../connector';
import Creds from '../creds';
import Devices from '../devices';
import Hotkey from '../hotkey';
import Labels from '../labels';
import Labs from '../labs';
import Memory from '../memory';
import { DesktopNotificationSettings } from '../notification';
import Profile from '../profile';
import Proxy from '../proxy';
import Security from '../security';
import Stats from '../stats';
import Storage from '../storage';
import SystemTools from '../system-tools';

export const componentMap = {
  [SettingsTabs.Advanced]: Advanced,
  [SettingsTabs.Labs]: Labs,
  [SettingsTabs.Appearance]: Appearance,
  [SettingsTabs.Memory]: Memory,
  [SettingsTabs.Notification]: DesktopNotificationSettings,
  [SettingsTabs.About]: About,
  [SettingsTabs.Hotkey]: Hotkey,
  [SettingsTabs.Proxy]: Proxy,
  [SettingsTabs.SystemTools]: SystemTools,
  [SettingsTabs.Storage]: Storage,
  [SettingsTabs.Devices]: Devices,
  [SettingsTabs.Labels]: Labels,
  // Profile related tabs
  [SettingsTabs.Profile]: Profile,
  [SettingsTabs.Stats]: Stats,
  [SettingsTabs.Usage]: Usage,
  [SettingsTabs.APIKey]: APIKey,
  [SettingsTabs.Creds]: Creds,
  [SettingsTabs.Security]: Security,
  [SettingsTabs.Connector]: Connector,

  [SettingsTabs.Plans]: Plans,
  [SettingsTabs.Credits]: Credits,
  [SettingsTabs.Billing]: Billing,
};
