const { recordNativeConsoleDiagnostic } = require('./native-console-diagnostics.cjs');
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { READY_EVENT, createPublicAssetReadyGate } = require('./public-asset-ready-gate.cjs');

const output = process.env.ORVILO_NATIVE_OUTPUT;
app.setPath('userData', path.join(output, 'electron-user-data'));
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
app.enableSandbox();
app.whenReady().then(async () => {
  const origin = new URL(process.env.ORVILO_NATIVE_URL).origin;
  const websocketOrigin = origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  let fixtureContents, publicAssetGate;
  const isFixtureURL = (value) => {
    try {
      return new URL(value).origin === origin;
    } catch {
      return false;
    }
  };
  const permissionDecision = (kind, webContents, permission, requestingOrigin, details = {}) => {
    const sameContents = webContents === fixtureContents && !webContents?.isDestroyed();
    const sameOrigin =
      sameContents && isFixtureURL(webContents.getURL()) && requestingOrigin === origin;
    const gesture = typeof details.userGesture === 'boolean' ? details.userGesture : null;
    const allowed =
      sameOrigin &&
      (permission === 'pointerLock' ||
        (permission === 'clipboard-sanitized-write' &&
          details.isMainFrame === true &&
          isFixtureURL(details.requestingUrl) &&
          gesture !== false));
    fs.appendFileSync(
      path.join(output, 'actual-permission-decisions.jsonl'),
      JSON.stringify({
        kind,
        permission,
        allowed,
        sameContents,
        webContentsId: webContents?.id,
        requestingOrigin,
        requestingUrl: details.requestingUrl,
        isMainFrame: details.isMainFrame,
        userGestureExposed: gesture !== null,
        userGesture: gesture,
      }) + '\n',
    );
    return allowed;
  };
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const originalAllowed =
      details.url.startsWith(origin + '/') ||
      details.url.startsWith(websocketOrigin + '/') ||
      /^(?:data|blob|devtools):/.test(details.url);
    let plannedPublicAsset = false;
    try {
      plannedPublicAsset = !originalAllowed && !!publicAssetGate?.permits(details);
    } catch (error) {
      fs.appendFileSync(
        path.join(output, 'public-asset-gate-failed.jsonl'),
        JSON.stringify({ url: details.url, message: String(error) }) + '\n',
      );
    }
    const allowed = originalAllowed || plannedPublicAsset;
    if (plannedPublicAsset)
      fs.appendFileSync(
        path.join(output, 'actual-public-asset-boundary-admissions.jsonl'),
        JSON.stringify({
          url: details.url,
          method: details.method,
          resourceType: details.resourceType,
          webContentsId: details.webContentsId,
          gate: publicAssetGate.snapshot(),
          transportBodyFulfilledClaimed: false,
        }) + '\n',
      );
    if (!allowed)
      fs.appendFileSync(
        path.join(output, 'external-request-denied.jsonl'),
        JSON.stringify({ url: details.url, resourceType: details.resourceType }) + '\n',
      );
    callback({ cancel: !allowed });
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) =>
    callback(
      permissionDecision(
        'request',
        webContents,
        permission,
        isFixtureURL(details.requestingUrl) ? origin : null,
        details,
      ),
    ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) =>
      permissionDecision('check', webContents, permission, requestingOrigin, details),
  );
  const window = new BrowserWindow({
    width: 1240,
    height: 960,
    show: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  fixtureContents = window.webContents;
  window.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const row = {
      level: event.level ?? level,
      message: event.message ?? message,
      line: event.lineNumber ?? line,
      sourceId: event.sourceId ?? sourceId,
    };
    recordNativeConsoleDiagnostic({ output, webContents: window.webContents, row, isFixtureURL });
  });
  window.webContents.on('render-process-gone', (_event, detail) =>
    fs.appendFileSync(path.join(output, 'renderer-gone.jsonl'), JSON.stringify(detail) + '\n'),
  );
  window.webContents.on('did-fail-load', (_event, code, description, url) =>
    fs.appendFileSync(
      path.join(output, 'did-fail-load.jsonl'),
      JSON.stringify({ code, description, url }) + '\n',
    ),
  );
  // Construct/capture the real main window at its initial blank document.
  // Only trusted main-process automation can emit this one-shot application
  // event; no renderer IPC channel or renderer capability is exposed.
  publicAssetGate = createPublicAssetReadyGate({
    directory: __dirname,
    fixtureURL: process.env.ORVILO_NATIVE_URL,
    root: process.env.ORVILO_PRODUCT_ROOT || '/workspace/orvilo1',
    scope: process.env.ORVILO_NATIVE_SCOPE || 'next117-core',
    webContents: fixtureContents,
  });
  app.once(READY_EVENT, (payload) => {
    try {
      const admitted = publicAssetGate.admitOnce(payload);
      fs.writeFileSync(
        path.join(output, 'actual-public-assets-main-ready.json'),
        JSON.stringify(admitted, null, 2) + '\n',
      );
      window.loadURL(process.env.ORVILO_NATIVE_URL).catch((error) => {
        fs.appendFileSync(
          path.join(output, 'public-asset-gate-failed.jsonl'),
          JSON.stringify({ message: String(error), phase: 'fixture-loadURL' }) + '\n',
        );
      });
    } catch (error) {
      fs.appendFileSync(
        path.join(output, 'public-asset-gate-failed.jsonl'),
        JSON.stringify({ message: String(error), phase: 'readiness-admission' }) + '\n',
      );
      app.exit(1);
    }
  });
  // Commit an explicit initial blank document so the real renderer initializes before trusted asset readiness.
  await window.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
