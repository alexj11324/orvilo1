/** Only registered devices enter execution inventories; live connections provide liveness. */
export const filterAuthorizedDevicePresence = <T extends { deviceId: string }>(
  registeredDeviceIds: ReadonlySet<string>,
  onlineDevices: T[],
): T[] => onlineDevices.filter((device) => registeredDeviceIds.has(device.deviceId));
