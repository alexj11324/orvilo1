import { describe, expect, it } from 'vitest';

import { NOTIFICATION_CHANNELS } from './channels';

describe('notification settings channels', () => {
  // The server keeps every Inbox record and has no Issue email sender, so a
  // switch for either channel would change nothing.
  it('offers only the channel whose preference the server honors', () => {
    expect(NOTIFICATION_CHANNELS).toEqual(['push']);
  });
});
