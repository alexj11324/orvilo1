import type { Command } from 'commander';

import { clearCredentials, loadCredentials } from '../auth/credentials';
import { stopDaemon } from '../daemon/manager';
import { resolveServerUrl, saveActiveWorkspace } from '../settings';
import { log } from '../utils/logger';

export function registerLogoutCommand(program: Command) {
  program
    .command('logout')
    .description('Log out and remove stored credentials')
    .action(async () => {
      // Tear down the connect daemon first — otherwise it keeps the device
      // online on the gateway with the cached token even after credentials are
      // gone, leaving the machine remotely driveable past "logout".
      const stopped = stopDaemon();
      if (stopped) {
        log.info('Disconnected device daemon.');
      }

      let revocationFailed = false;
      try {
        const credentials = loadCredentials();
        if (credentials?.refreshToken) {
          const response = await fetch(
            new URL(`${resolveServerUrl().replace(/\/+$/, '')}/oidc/token/revocation`),
            {
              body: new URLSearchParams({
                client_id: 'orvilo-cli',
                token: credentials.refreshToken,
                token_type_hint: 'refresh_token',
              }),
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              method: 'POST',
              signal: AbortSignal.timeout(10_000),
            },
          );
          revocationFailed = !response.ok;
        }
      } catch {
        revocationFailed = true;
      }
      // The workspace scope belongs to the account that set it. Leaving it behind
      // means the next login — possibly a different account — starts out claiming
      // a workspace it may have no membership in.
      saveActiveWorkspace(null);

      const removed = clearCredentials();
      if (revocationFailed) {
        log.warn('Local logout completed; remote grant revocation failed.');
        process.exitCode = 1;
      }
      if (removed) {
        log.info('Logged out. Credentials removed.');
      } else {
        log.info('No credentials found. Already logged out.');
      }
    });
}
