import assert from 'node:assert/strict';

import { ENABLE_BUSINESS_FEATURES as desktopBusiness } from '../../apps/desktop/stubs/business-const/src';
import { isCloudDesktopBuild, loadDesktopEnv } from '../../apps/desktop/vite.shared';
import { ENABLE_BUSINESS_FEATURES as sharedBusiness } from '../../packages/business/const/src';

loadDesktopEnv('production');
assert.equal(
  isCloudDesktopBuild(),
  false,
  'Open-source desktop releases must not use CLOUD_DESKTOP=1',
);
assert.equal(desktopBusiness, false, 'Desktop business feature flag must remain disabled');
assert.equal(sharedBusiness, false, 'Shared business feature flag must remain disabled');
assert.equal(
  Boolean(process.env.ORVILO_DESKTOP_VITE_CONFIG_EXTENSION),
  false,
  'Open-source release config must not be overridden',
);
