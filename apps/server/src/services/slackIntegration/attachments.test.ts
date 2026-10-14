import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadSlackAttachments } from './attachments';

describe('direct Slack attachments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves uploaded IDs with Slack and ingests the downloaded buffer', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            file: {
              id: 'F1',
              name: 'input.txt',
              mimetype: 'text/plain',
              url_private_download: 'https://files.slack.com/input',
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('task input'));
    vi.stubGlobal('fetch', fetch);
    const files = await downloadSlackAttachments('test-bot', ['F1']);
    expect(files[0].buffer.toString()).toBe('task input');
    expect(files[0].name).toBe('input.txt');
    expect(fetch.mock.calls[1][1].redirect).toBe('error');
  });

  it.each([
    'http://files.slack.com/input',
    'https://private.test/input',
    'https://files.slack.com.evil.test/input',
  ])('never forwards the bot credential to %s', async (url) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, file: { id: 'F1', url_private_download: url } })),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(downloadSlackAttachments('test-bot', ['F1'])).rejects.toThrow(
      'slack_file_url_invalid',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
