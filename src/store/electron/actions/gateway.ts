import { isDesktop } from '@orvilo/const';
import type { GatewayConnectionStatus } from '@orvilo/electron-client-ipc';
import { useEffect } from 'react';
import { type SWRResponse } from 'swr';
import useSWR from 'swr';

import { electronKeys } from '@/libs/swr/keys';
import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { primeLocalExecutionIdentity } from '@/services/localExecutionIdentity';
import { type StoreSetter } from '@/store/types';
import { useUserStore } from '@/store/user';

import { type ElectronStore } from '../store';

type Setter = StoreSetter<ElectronStore>;
export const gatewaySlice = (set: Setter, get: () => ElectronStore, _api?: unknown) =>
  new ElectronGatewayActionImpl(set, get, _api);

export interface GatewayDeviceInfo {
  deviceId: string;
  hostname: string;
  platform: string;
  userId?: string;
}

export class ElectronGatewayActionImpl {
  readonly #set: Setter;

  constructor(set: Setter, _get: () => ElectronStore, _api?: unknown) {
    void _get;
    void _api;
    this.#set = set;
  }

  connectGateway = async (): Promise<void> => {
    this.#set({ gatewayConnectionStatus: 'connecting' });
    try {
      const result = await gatewayConnectionService.connect();
      if (!result.success) {
        this.#set({ gatewayConnectionStatus: 'disconnected' });
      }
    } catch (error) {
      console.error('Gateway connect failed:', error);
      this.#set({ gatewayConnectionStatus: 'disconnected' });
    }
  };

  disconnectGateway = async (): Promise<void> => {
    try {
      await gatewayConnectionService.disconnect();
      this.#set({ gatewayConnectionStatus: 'disconnected' });
    } catch (error) {
      console.error('Gateway disconnect failed:', error);
    }
  };

  setGatewayConnectionStatus = (status: GatewayConnectionStatus): void => {
    this.#set({ gatewayConnectionStatus: status }, false, 'setGatewayConnectionStatus');
  };

  useFetchGatewayDeviceInfo = (): SWRResponse<GatewayDeviceInfo> => {
    const ownerId = useUserStore((state) => state.user?.id);
    const response = useSWR<GatewayDeviceInfo>(
      isDesktop && ownerId ? [...electronKeys.gatewayDeviceInfo(), ownerId] : null,
      async () => {
        const info = await gatewayConnectionService.getDeviceInfo();
        if (info.userId !== ownerId)
          throw new Error('Local device identity belongs to another account');
        return info;
      },
      // Ownership changes must commit the clearing effect while the next IPC is pending.
      { suspense: false },
    );
    useEffect(() => {
      if (useUserStore.getState().user?.id === ownerId) {
        primeLocalExecutionIdentity(response.data?.deviceId, ownerId);
        this.#set({ gatewayDeviceInfo: response.data }, false, 'setGatewayDeviceInfo');
      }
    }, [ownerId, response.data]);
    return response;
  };

  useFetchGatewayStatus = (): SWRResponse<{ status: GatewayConnectionStatus }> => {
    return useSWR<{ status: GatewayConnectionStatus }>(
      isDesktop ? 'electron:getGatewayConnectionStatus' : null,
      async () => gatewayConnectionService.getConnectionStatus(),
      {
        onSuccess: (data) => {
          this.#set({ gatewayConnectionStatus: data.status }, false, 'setGatewayConnectionStatus');
        },
      },
    );
  };
}

export type ElectronGatewayAction = Pick<
  ElectronGatewayActionImpl,
  keyof ElectronGatewayActionImpl
>;
