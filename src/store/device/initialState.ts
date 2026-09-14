import type { DeviceListItem } from '@orvilo/types';

export interface DeviceState {
  devices: DeviceListItem[];
  isDevicesInit: boolean;
}

export const initialState: DeviceState = {
  devices: [],
  isDevicesInit: false,
};
