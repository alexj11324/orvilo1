import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import {
  BUILTIN_HETEROGENEOUS_AGENT_CONFIGS,
  getHeterogeneousAgentConfig,
} from '@orvilo/heterogeneous-agents';
import { ChatErrorType, type ErrorType } from '@orvilo/types';

/**
 * Turn a raw device-gateway dispatch error code into a human-readable headline.
 * The gateway returns terse machine codes (e.g. `GATEWAY_NOT_CONFIGURED`) which,
 * surfaced verbatim, render as a cryptic error card. We rewrite the headline the
 * caller keeps for non-web surfaces (IM bots) while retaining the raw code in
 * `detail` for diagnostics. Web clients localize via the mapped error type below.
 */
/**
 * Exported so a consumer that reads a persisted `task.error` can recognise the same
 * failure it would have recognised from the raw code: dispatch failures reach storage
 * as a code on one path and as this headline on another.
 */
export const HETERO_DISPATCH_ERROR_HEADLINES: Record<string, string> = {
  DEVICE_CHANNEL_UNAVAILABLE:
    "The device this agent runs on isn't reachable right now — it went offline, went to sleep, or is reconnecting. Check that the Orvilo desktop app (or the `orvilo` CLI) is running and connected, then try again.",
  DEVICE_GATEWAY_ERROR:
    'The device connection service hit an error while starting this run. Nothing started on the device. This is usually temporary — try again in a moment.',
  DEVICE_GATEWAY_RATE_LIMITED:
    'Too many device requests at once, so this run was turned away. Wait a few seconds and try again.',
  DEVICE_GATEWAY_UNAUTHORIZED:
    "The device connection service rejected this run's credentials. This is a server configuration problem — retrying won't help.",
  DEVICE_GATEWAY_UNREACHABLE:
    "Couldn't reach the device connection service, so this run never started. Check the network, then try again.",
  DEVICE_NOT_FOUND:
    'The device this agent is bound to is no longer registered with the connection service. Reconnect the device, or bind this agent to another online device.',
  DEVICE_OFFLINE:
    "The device this agent runs on is offline, so the run couldn't start. Check that the Orvilo desktop app (or the `orvilo` CLI) is running and connected, then try again.",
  DEVICE_RESPONSE_TIMEOUT:
    "The device didn't answer in time, so we can't tell whether this run started. Check the device before starting it again.",
  GATEWAY_NOT_CONFIGURED:
    "The run device gateway isn't configured on the server, so this agent can't reach a device to run on. Configure the device gateway, or switch this agent to a connected local device.",
};

/**
 * The gateway may answer with a bare code (`DEVICE_OFFLINE`) or with a code the
 * device-gateway client annotated with the status it came from
 * (`DEVICE_CHANNEL_UNAVAILABLE (HTTP 503)`). Look the headline up by the code
 * itself so the annotation doesn't cost the user a readable message; `detail`
 * keeps the full raw string for diagnostics either way.
 */
const toDispatchErrorCode = (raw?: string): string | undefined =>
  raw?.trim().match(/^([A-Z][\dA-Z_]*)/)?.[1];

export const humanizeHeteroDispatchError = (raw?: string): string => {
  const code = toDispatchErrorCode(raw);

  return (code && HETERO_DISPATCH_ERROR_HEADLINES[code]) || raw || 'Device dispatch failed';
};

/**
 * Map a raw dispatch code to a dedicated `ChatErrorType` so the web client renders
 * its own localized headline (the generic `ServerAgentRuntimeError` copy would
 * otherwise mask the specific message). Unknown codes keep the generic type.
 */
const HETERO_DISPATCH_ERROR_TYPES: Record<string, ErrorType> = {
  // Every "we could not reach a device" flavour shares the localized
  // `DeviceGatewayNotConfigured` copy — the user-facing action ("connect a
  // device") is the same whether the gateway is unconfigured, the device is
  // offline, or its registration is gone.
  DEVICE_CHANNEL_UNAVAILABLE: ChatErrorType.DeviceGatewayNotConfigured,
  DEVICE_NOT_FOUND: ChatErrorType.DeviceGatewayNotConfigured,
  DEVICE_OFFLINE: ChatErrorType.DeviceGatewayNotConfigured,
  GATEWAY_NOT_CONFIGURED: ChatErrorType.DeviceGatewayNotConfigured,
};

export const resolveHeteroDispatchErrorType = (raw?: string): ErrorType => {
  const code = toDispatchErrorCode(raw);

  return (code && HETERO_DISPATCH_ERROR_TYPES[code]) || ChatErrorType.ServerAgentRuntimeError;
};

/**
 * Whether the type can run server-side in the cloud. `claude-code`/`codex`
 * spawn their CLI inside the cloud sandbox; the builtin `'orvilo'` agent's
 * Prime harness runs on the embedded control-plane host — it counts as
 * cloud-capable, but the dispatch seam routes a sandbox plan to the
 * embedded host instead of a sandbox spawn.
 */
export const supportsCloudHeterogeneousSandbox = (type: HeterogeneousAgentType): boolean =>
  type === 'orvilo' || type === 'claude-code' || type === 'codex';

/**
 * TRANSITIONAL embedded fence — see the `heteroDispatch` fork for the full
 * story. A builtin `'orvilo'` plan keeps routing off the device gateway
 * (into the embedded/sandbox fork) until the device-side Prime adapter
 * ships — docs/development/device-execution-contract.md §transitional-fence.
 * The package that admits the adapter must delete this predicate together
 * with the flip-pin test (`execAgent.device.test.ts` — the device-routing
 * suite asserts `'orvilo'` stays fenced until then).
 */
export const orviloDeviceFencedToEmbedded = (type: HeterogeneousAgentType): boolean =>
  type === 'orvilo';

export const getHeterogeneousAgentTitle = (type: HeterogeneousAgentType): string =>
  getHeterogeneousAgentConfig(type)?.title ??
  BUILTIN_HETEROGENEOUS_AGENT_CONFIGS.find((config) => config.type === type)?.title ??
  type;
