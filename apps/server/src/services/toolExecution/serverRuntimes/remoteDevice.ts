import { type DeviceAttachment, RemoteDeviceIdentifier } from '@orvilo/builtin-tool-remote-device';
import { RemoteDeviceExecutionRuntime } from '@orvilo/builtin-tool-remote-device/executionRuntime';
import debug from 'debug';

import { getScopedOnlineDevices } from '@/server/services/deviceGateway/scopedDevices';

import { resolveRunWorkspaceId } from './resolveWorkspaceScope';
import { type ServerRuntimeRegistration } from './types';

// Enable with DEBUG=orvilo-server:remote-device (works in prod via the env var).
const log = debug('orvilo-server:remote-device');

/**
 * Registers remote-device discovery for a server-side agent tool execution.
 *
 * Use when:
 * - The tools engine activates the remote-device builtin runtime
 *
 * Expects:
 * - Workspace discovery has a server database handle for registry authorization
 *
 * Returns:
 * - A runtime whose device list is scoped to one authorized principal
 *
 * Call stack:
 *
 * ToolExecutionService
 *   -> {@link remoteDeviceRuntime.factory}
 *     -> getScopedOnlineDevices
 *       -> RemoteDeviceExecutionRuntime
 */
export const remoteDeviceRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    if (!context.userId) {
      throw new Error('userId is required for Remote Device execution');
    }

    const userId = context.userId;
    const serverDB = context.serverDB;

    return new RemoteDeviceExecutionRuntime({
      // Registered hosts available through the caller's Agent permissions.
      queryDeviceList: async (): Promise<DeviceAttachment[]> => {
        // Resolve the workspace scope used to decide which workspace device pool
        // to include. Recovers from the running agent when the run-scoped
        // workspaceId was lost on the way to this tool call — see
        // `resolveRunWorkspaceId`. Otherwise a workspace agent would silently
        // degrade to the personal-only pool.
        const workspaceId = await resolveRunWorkspaceId(context);

        // Gateway presence alone cannot prove a registered execution host.
        if (!serverDB) return [];

        const devices = await getScopedOnlineDevices(serverDB, userId, workspaceId);
        log(
          'listOnlineDevices: workspaceId=%o -> %d device(s): %o',
          workspaceId,
          devices.length,
          devices.map((d) => ({
            id: d.deviceId,
            name: d.friendlyName ?? d.hostname,
            online: d.online,
            scope: d.scope,
          })),
        );
        return devices;
      },
    });
  },
  identifier: RemoteDeviceIdentifier,
};
