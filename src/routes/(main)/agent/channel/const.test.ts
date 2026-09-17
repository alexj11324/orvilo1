import { describe, expect, it } from 'vitest';

import type { SerializedPlatformDefinition } from '@/server/services/bot/platforms/types';

import { visibleChannelPlatforms } from './const';

const platform = (id: string): SerializedPlatformDefinition =>
  ({ id, name: id, schema: [] }) as SerializedPlatformDefinition;

describe('visibleChannelPlatforms', () => {
  const platforms = [platform('telegram'), platform('imessage'), platform('slack')];

  it('hides the server-registered iMessage channel while its lab flag is off', () => {
    // iMessage is a real platform definition, but an experimental channel is
    // not an actionable entry until `enableImessage` turns the capability on.
    expect(visibleChannelPlatforms(platforms, { enableImessage: false }).map((p) => p.id)).toEqual([
      'telegram',
      'slack',
    ]);
  });

  it('keeps iMessage once the lab flag enables the experimental channel', () => {
    expect(visibleChannelPlatforms(platforms, { enableImessage: true }).map((p) => p.id)).toEqual([
      'telegram',
      'imessage',
      'slack',
    ]);
  });

  it('never synthesizes platforms the server did not return', () => {
    // The retired coming-soon placeholders (WhatsApp, flag-off iMessage) were
    // client-side virtual entries; the list must stay exactly what the server
    // returned, minus lab-gated channels.
    const serverList = [platform('telegram')];

    expect(visibleChannelPlatforms(serverList, { enableImessage: false })).toEqual(serverList);
    expect(visibleChannelPlatforms([], { enableImessage: true })).toEqual([]);
  });
});
