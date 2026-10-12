import { describe, expect, it } from 'vitest';

import { filterAuthorizedDevicePresence } from './scopedDevicePresence';

describe('registered device presence', () => {
  it('never treats an unregistered live connection as an execution grant', () => {
    expect(
      filterAuthorizedDevicePresence(new Set(['registered']), [
        { deviceId: 'registered' },
        { deviceId: 'unregistered' },
      ]),
    ).toEqual([{ deviceId: 'registered' }]);
  });
});
