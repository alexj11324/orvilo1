import { isRecord } from '@orvilo/utils/object';

import type { HeterogeneousAgentPermissionCatalog } from '../types';

/** Keep the agent's labels and values verbatim; modes are the legacy ACP fallback. */
export const parseStandardAcpPermissionCatalogs = (session: {
  configOptions?: unknown;
  modes?: unknown;
}): HeterogeneousAgentPermissionCatalog[] => {
  const catalogs: HeterogeneousAgentPermissionCatalog[] = [];
  for (const entry of Array.isArray(session.configOptions) ? session.configOptions : []) {
    if (!isRecord(entry) || entry.type !== 'select') continue;
    const configId = entry.configId ?? entry.id;
    const isPermission =
      ['mode', 'permission', 'approval'].includes(String(entry.category)) ||
      (entry.category === undefined &&
        ['mode', 'permission', 'approval', 'permission-mode', 'approval-mode'].includes(
          String(configId),
        ));
    if (!isPermission) continue;
    if (
      typeof configId !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.currentValue !== 'string' ||
      !Array.isArray(entry.options)
    )
      continue;
    const options = entry.options
      .flatMap((option) =>
        isRecord(option) && typeof option.group === 'string' && Array.isArray(option.options)
          ? option.options
          : [option],
      )
      .flatMap((option) =>
        isRecord(option) && typeof option.value === 'string' && typeof option.name === 'string'
          ? [
              {
                name: option.name,
                value: option.value,
                ...(typeof option.description === 'string'
                  ? { description: option.description }
                  : {}),
              },
            ]
          : [],
      );
    if (options.length > 0)
      catalogs.push({ configId, currentValue: entry.currentValue, name: entry.name, options });
  }
  if (catalogs.length > 0) return catalogs;
  const modes = session.modes;
  if (
    !isRecord(modes) ||
    typeof modes.currentModeId !== 'string' ||
    !Array.isArray(modes.availableModes)
  )
    return [];
  const options = modes.availableModes.flatMap((mode) =>
    isRecord(mode) && typeof mode.id === 'string' && typeof mode.name === 'string'
      ? [
          {
            name: mode.name,
            value: mode.id,
            ...(typeof mode.description === 'string' ? { description: mode.description } : {}),
          },
        ]
      : [],
  );
  // ACP modes have no group label. Use the protocol identifier instead of inventing one.
  return options.length > 0
    ? [{ configId: 'mode', currentValue: modes.currentModeId, name: 'mode', options }]
    : [];
};
