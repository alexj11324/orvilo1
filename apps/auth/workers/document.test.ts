import { describe, expect, it } from 'vitest';

import { SERVER_CONFIG_PLACEHOLDER } from '../app/lib/serverConfig';
import {
  injectPortalConfig,
  injectServerConfig,
  PORTAL_CONFIG_PLACEHOLDER,
  withDocumentLocale,
} from './document';

const documentWith = (head: string) => `<html lang="en-US"><head>${head}</head></html>`;

describe('injectServerConfig', () => {
  it('replaces the placeholder the renderer emits', () => {
    const html = injectServerConfig(documentWith(SERVER_CONFIG_PLACEHOLDER), { enableOIDC: true });

    expect(html).toContain('window.__SERVER_CONFIG__ = {"enableOIDC":true};');
    expect(html).not.toContain(SERVER_CONFIG_PLACEHOLDER);
  });

  it('escapes sequences that would break out of the script', () => {
    const html = injectServerConfig(documentWith(SERVER_CONFIG_PLACEHOLDER), {
      html: '</script><script>alert(1)</script>',
    });

    expect(html).not.toContain('</script><script>');
  });

  it('leaves the document untouched when no config was resolved', () => {
    const original = documentWith(SERVER_CONFIG_PLACEHOLDER);

    expect(injectServerConfig(original, undefined)).toBe(original);
  });
});

describe('injectPortalConfig', () => {
  it('injects the clerk publishable key, proxy override and product origin', () => {
    const html = injectPortalConfig(documentWith(PORTAL_CONFIG_PLACEHOLDER), {
      clerkProxyUrl: '/__clerk',
      clerkPublishableKey: 'pk_live_x',
      productOrigin: 'https://orvilo.aspectlylabs.com',
    });

    expect(html).toContain(
      'window.__PORTAL_CONFIG__ = {"clerkProxyUrl":"/__clerk","clerkPublishableKey":"pk_live_x","productOrigin":"https://orvilo.aspectlylabs.com"};',
    );
    expect(html).not.toContain(PORTAL_CONFIG_PLACEHOLDER);
  });

  it('escapes sequences that would break out of the script', () => {
    const html = injectPortalConfig(documentWith(PORTAL_CONFIG_PLACEHOLDER), {
      clerkProxyUrl: '</script><script>alert(1)</script>',
    });

    expect(html).not.toContain('</script><script>alert(1)</script>');
  });
});

describe('withDocumentLocale', () => {
  it('rewrites the lang the SPA fallback was prerendered with', () => {
    expect(
      withDocumentLocale('<html suppressHydrationWarning dir="ltr" lang="en-US">', 'zh-CN'),
    ).toBe('<html suppressHydrationWarning dir="ltr" lang="zh-CN">');
  });
});
