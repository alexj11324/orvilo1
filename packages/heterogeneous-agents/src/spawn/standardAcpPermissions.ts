import { isRecord } from '@orvilo/utils/object';

import type { AskUserBridge } from '../askUser/AskUserBridge';
import type { HeterogeneousAgentPermissionCatalog } from '../types';
import type { AcpRpcMessage } from './acpStdioClient';
import { AcpServerRequestError } from './acpStdioClient';

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

/**
 * An unattended mode this session actually advertised. Names stay verbatim:
 * Bypass / Full access, Autonomous, Run Everything, and YOLO are the same
 * kind of choice. Auto, Ask, Smart, Accept edits, and Allowlist are not.
 */
const ADVERTISED_UNATTENDED_PERMISSION =
  /^(?:bypass(?: permissions|permissions)?|(?:agent-|danger-)?full[-_ ]access|(?:agent \()?full access\)?|autonomous|run[-_ ]everything|yolo)$/i;

export const isAdvertisedUnattendedPermission = (label: string) =>
  ADVERTISED_UNATTENDED_PERMISSION.test(label.trim());

/** Select only an unattended choice actually advertised by this ACP session. */
export const resolveNativeFullAccessPermission = (
  catalogs: HeterogeneousAgentPermissionCatalog[],
) => {
  for (const catalog of catalogs) {
    const option = catalog.options.find(
      ({ name, value }) =>
        isAdvertisedUnattendedPermission(value) || isAdvertisedUnattendedPermission(name),
    );
    if (option) return { configId: catalog.configId, value: option.value };
  }
};

/** Native requests wait for an explicit answer; clients never synthesize tool approval. */
export const answerNativePermissionRequest = async (
  message: AcpRpcMessage,
  bridge: AskUserBridge | undefined,
  push: (update: Record<string, unknown>) => Promise<void>,
  provider: string,
  strings = { fallbackTitle: 'Permission required', header: 'Permission required' },
) => {
  if (!bridge)
    throw new AcpServerRequestError(
      -32_603,
      `${provider} permission requires an interactive bridge`,
    );
  const params = isRecord(message.params) ? message.params : undefined;
  const tool = isRecord(params?.toolCall) ? params.toolCall : undefined;
  const options = (Array.isArray(params?.options) ? params.options : []).flatMap((option) =>
    isRecord(option) && typeof option.optionId === 'string' && typeof option.name === 'string'
      ? [{ id: option.optionId, label: option.name }]
      : [],
  );
  if (!options.length) throw new AcpServerRequestError(-32_602, 'No native permission options');
  const question = typeof tool?.title === 'string' ? tool.title : strings.fallbackTitle;
  const toolCallId = `${provider}-permission-${String(message.id)}-${String(tool?.toolCallId ?? '')}`;
  const arguments_ = {
    questions: [{ header: strings.header, multiSelect: false, options, question }],
  };
  await push({
    identifier: provider,
    rawInput: arguments_,
    sessionUpdate: 'tool_call',
    title: 'askUserQuestion',
    toolCallId,
  });
  const answer = await bridge.pending({
    arguments: arguments_,
    interactionKind: 'permission',
    toolCallId,
  });
  await push({
    rawOutput: answer,
    sessionUpdate: 'tool_call_update',
    status: 'completed',
    toolCallId,
  });
  const selection =
    !answer.cancelled && isRecord(answer.result) ? answer.result[question] : undefined;
  const values = Array.isArray(selection) ? selection : [selection];
  const selected = options.find(({ id }) => values.includes(id));
  return {
    outcome: selected ? { optionId: selected.id, outcome: 'selected' } : { outcome: 'cancelled' },
  };
};
