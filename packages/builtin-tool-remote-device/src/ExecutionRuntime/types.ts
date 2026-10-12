/** A single live gateway connection (channel) of a device. */
export interface DeviceChannel {
  channel?: string;
  connectedAt: string;
  connectionId: string;
}

/** Which principal pool a device belongs to. */

export interface DeviceAttachment {
  /** Live connections backing this device; absent for offline devices. */
  channels?: DeviceChannel[];
  deviceId: string;
  /**
   * User-set alias from the device-settings page. The gateway only knows the raw
   * `hostname`; this is merged in from the DB so the device shows the name the
   * user recognises. Null when never aliased.
   */
  friendlyName?: string | null;
  hostname: string;
  lastSeen: string;
  online: boolean;
  platform: string;
}
