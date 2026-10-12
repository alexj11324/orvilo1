import type { NetworkProxySettings } from '@orvilo/electron-client-ipc';
import { z } from 'zod';

export const PROXY_TYPES = ['http', 'https', 'socks5'] as const;
export type ProxyDraft = Partial<NetworkProxySettings>;
export type ProxyValidationKey =
  | 'proxy.validation.typeRequired'
  | 'proxy.validation.serverRequired'
  | 'proxy.validation.serverInvalid'
  | 'proxy.validation.portRequired'
  | 'proxy.validation.portInvalid'
  | 'proxy.validation.usernameRequired'
  | 'proxy.validation.passwordRequired';

const IP_HOST_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const DOMAIN_HOST_REGEX = /^[\dA-Z](?:[\dA-Z-]*[\dA-Z])?(?:\.[\dA-Z](?:[\dA-Z-]*[\dA-Z])?)*$/i;

const proxySchema = z
  .object({
    enableProxy: z.boolean().optional(),
    proxyType: z.string().nullish(),
    proxyServer: z.string().nullish(),
    proxyPort: z.string().nullish(),
    proxyRequireAuth: z.boolean().optional(),
    proxyUsername: z.string().nullish(),
    proxyPassword: z.string().nullish(),
  })
  .superRefine((values, ctx) => {
    if (!values.enableProxy) return;
    const error = (field: keyof ProxyDraft, message: ProxyValidationKey) =>
      ctx.addIssue({ code: 'custom', path: [field], message });
    if (!(PROXY_TYPES as readonly string[]).includes(values.proxyType ?? '')) {
      error('proxyType', 'proxy.validation.typeRequired');
    }
    const host = values.proxyServer?.trim();
    if (!host) error('proxyServer', 'proxy.validation.serverRequired');
    else if (!IP_HOST_REGEX.test(host) && !DOMAIN_HOST_REGEX.test(host)) {
      error('proxyServer', 'proxy.validation.serverInvalid');
    }
    const portText = values.proxyPort?.trim();
    if (!portText) error('proxyPort', 'proxy.validation.portRequired');
    else {
      // Preserve the existing parseInt rule; stricter numeric/IP validation is a separate change.
      const port = Number.parseInt(portText, 10);
      if (Number.isNaN(port) || port < 1 || port > 65_535) {
        error('proxyPort', 'proxy.validation.portInvalid');
      }
    }
    if (values.proxyRequireAuth) {
      if (!values.proxyUsername?.trim())
        error('proxyUsername', 'proxy.validation.usernameRequired');
      if (!values.proxyPassword?.trim())
        error('proxyPassword', 'proxy.validation.passwordRequired');
    }
  });

export const validateProxySettings = (values: ProxyDraft) => {
  const result = proxySchema.safeParse(values);
  const errors: Partial<Record<keyof ProxyDraft, ProxyValidationKey>> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      // Values come from typed controls; domain errors carry the existing translation keys.
      if (issue.code === 'custom') {
        errors[issue.path[0] as keyof ProxyDraft] = issue.message as ProxyValidationKey;
      }
    }
  }
  return errors;
};

/** Match GroupForm's mounted-field payload while retaining hidden credentials in the draft. */
export const activeProxyValues = (values: ProxyDraft): ProxyDraft => {
  const { enableProxy, proxyType, proxyServer, proxyPort, proxyRequireAuth } = values;
  return {
    enableProxy,
    proxyType,
    proxyServer,
    proxyPort,
    proxyRequireAuth,
    ...(enableProxy && proxyRequireAuth
      ? { proxyUsername: values.proxyUsername, proxyPassword: values.proxyPassword }
      : {}),
  };
};
