import { join } from 'node:path';

import { app } from 'electron';

// Must run BEFORE any module captures `app.getPath('userData')` (e.g. `@/const/dir`
// reads it at top level). Once a path is read, `setName` / `setPath` no-op for it.
//
// Keep this module self-contained: import only node builtins and `electron`. The
// bundler emits it as its own chunk required ahead of `main-app`; importing any
// shared first-party module (even `@/utils/platform`) would make this chunk require
// `main-app` first and capture the default userData again. The build fails if that
// happens (see scripts/preAppInitChunk.mjs).
//
// Dev now uses the same `app://renderer/` origin as prod, so localStorage / cookies /
// IndexedDB would collide if both shared the packaged-app's userData dir. Pin dev to
// a sibling directory so prod sessions stay clean.

// Mirrors `dev()` in `@/utils/platform`, which this module must not import.
const isDev = (): boolean =>
  'ELECTRON_IS_DEV' in process.env
    ? Number.parseInt(process.env.ELECTRON_IS_DEV ?? '', 10) === 1
    : Boolean(process.defaultApp || /node_modules[\\/]electron[\\/]/.test(process.execPath));

if (isDev()) {
  // App name stays constant so safeStorage / Chromium cookie encryption keys
  // (OS-keychain entries derived from the app name) keep decrypting a copied
  // login state across instances. Only userData varies per instance, which is
  // enough: Electron's single-instance lock is keyed by the userData dir, so
  // distinct dirs let multiple dev instances run concurrently. Override with an
  // absolute path via ORVILO_DESKTOP_USER_DATA_DIR for multi-instance testing.
  app.setName('orvilo-desktop-dev');
  const userDataOverride = process.env.ORVILO_DESKTOP_USER_DATA_DIR;
  app.setPath('userData', userDataOverride || join(app.getPath('appData'), 'orvilo-desktop-dev'));
}
