/**
 * Host contract — the access shell (viewer) as an orthogonal dimension to the
 * execution device. Pure types only: no React, no Electron, no DOM, no Node.
 *
 * A Host answers "what can this access surface do?" — manage windows, open a
 * native file picker, apply an app update. A Host is NEVER an execution
 * device: `localDeviceId` below is only the identity handshake result for a
 * Desktop whose own machine happens to be registered, not a default target.
 *
 * Normative sources: docs/development/web-desktop-architecture.md (ADR) and
 * web-desktop-boundary-plan.md §4.1.
 */

/** Access surfaces the product ships. */
export type HostKind = 'desktop' | 'mobile' | 'popup' | 'web';

/**
 * What a host shell can natively do. Business features must never be gated on
 * these — they describe shell capabilities only.
 */
export type HostCapability =
  /** Apply the host app's own OTA update (electron-updater). Desktop-only. */
  | 'app.update'
  /** Native file/directory picker on the machine the shell runs on. */
  | 'dialog.openFile'
  /** Open an attachment picker (any host; browser uses user-authorized picks). */
  | 'file.pickAttachment'
  /** Open an OS-level external link handler. */
  | 'link.openExternal'
  /** Native application menus / context menus. */
  | 'menu.native'
  /** Native OS notifications (not web Notification API). */
  | 'notification.native'
  /** Open OS permission panes for the machine this shell runs on. */
  | 'os.openPermissionSettings'
  /** Register OS-global hotkeys. */
  | 'shortcut.global'
  /** Open a native terminal app on the machine this shell runs on. */
  | 'shell.openTerminal'
  /** Reveal a path in the host machine's file manager (Finder/Explorer). */
  | 'shell.revealPath'
  /** System tray icon and menu. */
  | 'tray.manage'
  /** Create/focus/close host windows. */
  | 'window.manage';

export interface HostContext {
  /** Declared shell capabilities for the current host build. */
  capabilities: ReadonlySet<HostCapability>;
  kind: HostKind;
  /**
   * Present only after this shell's machine completed the device-identity
   * handshake — i.e. a Desktop whose own machine is a registered device. It is
   * a "this machine" marker for honest UI, never a default execution target:
   * target selection still goes through `resolveExecutionDevice`.
   */
  localDeviceId?: string;
}

/**
 * Structured "this host cannot do that" answer. Host adapters return this
 * instead of throwing on unsupported capabilities, so web shells degrade to a
 * clear unavailable state instead of a missing-preload crash.
 */
export interface HostUnsupportedResult {
  capability: HostCapability;
  code: 'HOST_UNSUPPORTED';
  status: 'unsupported';
}

export const hostUnsupported = (capability: HostCapability): HostUnsupportedResult => ({
  capability,
  code: 'HOST_UNSUPPORTED',
  status: 'unsupported',
});

export const isHostUnsupportedResult = (value: unknown): value is HostUnsupportedResult =>
  typeof value === 'object' &&
  value !== null &&
  (value as { code?: unknown }).code === 'HOST_UNSUPPORTED';
