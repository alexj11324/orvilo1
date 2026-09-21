import debug from 'debug';

export { isDeviceToolIdentifier } from './deviceToolRegistry';

const log = debug('orvilo-server:agent-device-tool-audit');

export interface LogDeviceToolAuditParams {
  apiName: string;
  messageId?: string;
  operationId?: string;
  toolIdentifier: string;
  topicId?: string;
  userId?: string;
}

/**
 * Emit one audit record per device-tool dispatch. Caller is responsible for
 * gating on `isDeviceToolIdentifier(...)` first — calling this for non-device
 * tools is a no-op contract violation, not a runtime guard.
 *
 * Reason for being a logger (not a DB table): the goal here is post-incident
 * forensics ("who triggered this read_file?"), not real-time risk control.
 * The debug namespace keeps it cheap, fire-and-forget, and consistent with
 * the existing `orvilo-server:device-gateway` line at the actual proxy dispatch.
 *
 * Sensitive payloads (file contents, shell stdout, tool args) are NEVER
 * recorded here — only identity metadata.
 */
export const logDeviceToolAudit = (params: LogDeviceToolAuditParams): void => {
  log(
    'device-tool-call %s:%s userId=%s topicId=%s operationId=%s',
    params.toolIdentifier,
    params.apiName,
    params.userId ?? '-',
    params.topicId ?? '-',
    params.operationId ?? '-',
  );
};
