const fs = require('node:fs');
const path = require('node:path');
// Every original console event is retained. No suppression/filtering or renderer
// capability is installed. Read-only main diagnostics operate on the owned window.
function recordNativeConsoleDiagnostic({ output, webContents, row, isFixtureURL }) {
  const atUTC = new Date().toISOString(),
    mainMonotonicNs = process.hrtime.bigint().toString(),
    windowURL = webContents.getURL(),
    tag = globalThis.__nativeFixtureDiagnostic || null;
  const event = {
    ...row,
    atUTC,
    mainMonotonicNs,
    webContentsId: webContents.id,
    windowURL,
    lastDriverObservation: tag,
  };
  fs.appendFileSync(path.join(output, 'all-renderer-console.jsonl'), JSON.stringify(event) + '\n');
  if (row.level !== 'error' && row.level !== 3) return;
  const append = (detail) =>
    fs.appendFileSync(
      path.join(output, 'native-console-error-diagnostics.jsonl'),
      JSON.stringify({ ...event, ...detail }) + '\n',
    );
  if (!isFixtureURL(windowURL) || webContents.isDestroyed()) {
    append({ actualRendererReadSkipped: 'not-live-owning-fixture-document' });
    return;
  }
  webContents
    .executeJavaScript(
      `(()=>({readAtUTC:new Date().toISOString(),url:location.href,documentTimeOrigin:performance.timeOrigin,scene:window.nativeFixture?.scene??null,host:window.nativeFixture?.host?.()??null,context:{theme:document.documentElement.dataset.theme,rootFont:getComputedStyle(document.documentElement).fontSize,width:innerWidth,height:innerHeight,pointer:matchMedia('(pointer:coarse)').matches?'coarse':'fine'},fontsStatus:document.fonts.status,readyState:document.readyState,masonryMounted:!!document.querySelector('[data-testid="masonry-sticky-fixture"]')}))()`,
    )
    .then((actualRenderer) =>
      append({
        actualRenderer,
        observationBoundary:
          'Renderer read occurs after the preserved exact main console event; it is diagnostic, not a claimed simultaneous sample.',
      }),
    )
    .catch((error) =>
      append({
        actualRendererReadError: String(error),
        observationBoundary: 'Original console error remains in original archive/checks.',
      }),
    );
}
module.exports = { recordNativeConsoleDiagnostic };
