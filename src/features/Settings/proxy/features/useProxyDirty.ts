import { type NetworkProxySettings } from '@orvilo/electron-client-ipc';
import { useMemo } from 'react';

const WATCH_FIELDS: readonly (keyof NetworkProxySettings)[] = [
  'enableProxy',
  'proxyType',
  'proxyServer',
  'proxyPort',
  'proxyRequireAuth',
  'proxyUsername',
  'proxyPassword',
];

const normalize = (v: unknown) => (v === undefined || v === null ? '' : v);

export const useProxyDirty = (
  values: Partial<NetworkProxySettings>,
  saved: NetworkProxySettings | undefined,
): { isDirty: boolean } => {
  const isDirty = useMemo(() => {
    if (!saved || !values) return false;
    return WATCH_FIELDS.some((key) => normalize(values[key]) !== normalize(saved[key]));
  }, [values, saved]);

  return { isDirty };
};
