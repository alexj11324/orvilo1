// Sign the local seed user into an already running Electron dev instance.
// The dev server must run behind the local Clerk stub, which vouches for seed
// sessions (`ORVILO_CLERK_STUB=1 .agents/acceptance/scripts/dev-up.sh restart`,
// or `bun run dev:desktop:skip-login`, which starts everything).
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_SEED_EMAIL,
  seedElectron,
} from '../../.agents/acceptance/scripts/seed-session.mjs';

export function localServerUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== 'localhost' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('SERVER_URL must be http://localhost:<port>/');
  }
  return url;
}

// The session is written to the database the dev server uses, so read its URL
// from the same place the server does when the shell has not set it.
function databaseUrl() {
  if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env');
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required (set it, or put it in .env)');
  return process.env.DATABASE_URL;
}

/**
 * `authUrlFile` also authorizes the Electron main process — what connects this
 * machine as a device. Electron must have been started with
 * ORVILO_DESKTOP_AUTH_URL_FILE set to the same path.
 */
export async function seedElectronLogin({
  serverUrl = process.env.SERVER_URL || 'http://localhost:3010/',
  cdpPort = process.env.ORVILO_DESKTOP_CDP_PORT || '9263',
  email = process.env.SEED_EMAIL || DEFAULT_SEED_EMAIL,
  authUrlFile = process.env.ORVILO_DESKTOP_AUTH_URL_FILE,
  verifyTarget = () => true,
} = {}) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Local seed login is disabled in production');
  const url = localServerUrl(serverUrl);
  const port = Number(cdpPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid Electron CDP port');
  if (!verifyTarget()) throw new Error('Electron CDP target is not the launched instance');
  const { mainProcess, userId } = await seedElectron({
    cdpPort: port,
    databaseUrl: databaseUrl(),
    email,
    serverUrl: url.href,
    urlFile: authUrlFile,
  });
  return { mainProcess, serverUrl: url.origin, userId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedElectronLogin().then(
    ({ mainProcess, userId, serverUrl }) =>
      console.log(
        `Electron signed in as ${userId} on ${serverUrl}` +
          (mainProcess
            ? '; main process authorized'
            : ' (renderer only — start Electron with ORVILO_DESKTOP_AUTH_URL_FILE to authorize the main process too)'),
      ),
    (error) => {
      console.error(`Electron local login failed: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
