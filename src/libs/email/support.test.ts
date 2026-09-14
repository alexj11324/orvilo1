import { describe, expect, it } from 'vitest';

import { getEmailSupportHtml, getEmailSupportText } from './support';

describe('email support helpers', () => {
  it('renders actionable support links for HTML and plain-text emails', () => {
    const copy = { discordUrl: 'https://discord.gg/example', supportAddress: 'help@example.com' };

    const html = getEmailSupportHtml(copy);
    const text = getEmailSupportText(copy);

    expect(html).toContain('href="mailto:help@example.com"');
    expect(html).toContain('https://discord.gg/example');
    expect(text).toContain('help@example.com');
    expect(text).toContain('https://discord.gg/example');
  });

  it('escapes localized labels before rendering HTML', () => {
    const html = getEmailSupportHtml({
      contactSupport: '<script>alert("support")</script>',
      discordUrl: 'https://discord.gg/example',
      joinDiscord: '<strong>Discord</strong>',
      supportAddress: 'help@example.com',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<strong>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;strong&gt;');
  });

  // A deployment without a support inbox or Discord server must not ship dead
  // links; the segment is dropped instead.
  it('omits segments whose branding value is unset', () => {
    const onlySupport = getEmailSupportHtml({
      discordUrl: undefined,
      supportAddress: 'help@example.com',
    });
    expect(onlySupport).toContain('mailto:help@example.com');
    expect(onlySupport).not.toContain('discord');

    const onlyDiscord = getEmailSupportHtml({
      discordUrl: 'https://discord.gg/example',
      supportAddress: undefined,
    });
    expect(onlyDiscord).toContain('https://discord.gg/example');
    expect(onlyDiscord).not.toContain('mailto:');

    const neither = getEmailSupportHtml({ discordUrl: undefined, supportAddress: undefined });
    expect(neither).toBe('');
    expect(
      getEmailSupportText({ discordUrl: undefined, supportAddress: undefined }),
    ).toBe('');
  });
});
