import { describe, expect, it } from 'vitest';

import { activeProxyValues, type ProxyDraft, validateProxySettings } from './proxyValidation';

const valid: ProxyDraft = {
  enableProxy: true,
  proxyType: 'http',
  proxyServer: 'localhost',
  proxyPort: '7890',
  proxyRequireAuth: false,
};

describe('proxy validation compatibility', () => {
  it('does not require configuration when disabled', () => {
    expect(validateProxySettings({ enableProxy: false })).toEqual({});
  });
  it('requires type, host and port only when enabled', () => {
    expect(validateProxySettings({ enableProxy: true })).toEqual({
      proxyType: 'proxy.validation.typeRequired',
      proxyServer: 'proxy.validation.serverRequired',
      proxyPort: 'proxy.validation.portRequired',
    });
  });
  it.each(['localhost', 'proxy.example.com', '127.0.0.1', '999.999.999.999'])(
    'retains the existing host rule for %s',
    (proxyServer) => {
      expect(validateProxySettings({ ...valid, proxyServer })).toEqual({});
    },
  );
  it.each(['http://proxy', '::1', '-invalid', 'bad host'])(
    'rejects unsupported host %s',
    (proxyServer) => {
      expect(validateProxySettings({ ...valid, proxyServer }).proxyServer).toBe(
        'proxy.validation.serverInvalid',
      );
    },
  );
  it.each(['0', '-1', '65536', 'abc'])('rejects port %s', (proxyPort) => {
    expect(validateProxySettings({ ...valid, proxyPort }).proxyPort).toBe(
      'proxy.validation.portInvalid',
    );
  });
  it.each(['1', '65535', '80abc', ' 7890 '])(
    'retains parseInt acceptance for %s without changing values',
    (proxyPort) => {
      const values = { ...valid, proxyPort };
      expect(validateProxySettings(values)).toEqual({});
      expect(values.proxyPort).toBe(proxyPort);
    },
  );
  it('requires nonblank credentials only for enabled authenticated proxy', () => {
    expect(
      validateProxySettings({
        ...valid,
        proxyRequireAuth: true,
        proxyUsername: ' ',
        proxyPassword: ' ',
      }),
    ).toEqual({
      proxyUsername: 'proxy.validation.usernameRequired',
      proxyPassword: 'proxy.validation.passwordRequired',
    });
    expect(
      validateProxySettings({
        ...valid,
        proxyRequireAuth: true,
        proxyUsername: ' user ',
        proxyPassword: ' password ',
      }),
    ).toEqual({});
  });
  it('projects only mounted fields without losing the retained draft or bypass data', () => {
    const draft = {
      ...valid,
      proxyUsername: 'user',
      proxyPassword: 'password',
      proxyBypass: 'localhost',
    };
    expect(activeProxyValues(draft)).toEqual(valid);
    expect(activeProxyValues({ ...draft, proxyRequireAuth: true })).toEqual({
      ...valid,
      proxyRequireAuth: true,
      proxyUsername: 'user',
      proxyPassword: 'password',
    });
    expect(draft.proxyPassword).toBe('password');
    expect(draft.proxyBypass).toBe('localhost');
  });
});
