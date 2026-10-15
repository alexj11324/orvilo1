import { execFileSync } from 'node:child_process';
import net from 'node:net';

export const LOCAL_DEVICE_GATEWAY_SETUP =
  '.agents/acceptance/scripts/agent-gateway/local-device-gateway-setup.sh';

export const PRODUCTION_DEVICE_GATEWAY_HOST = 'device-gateway.aspectlylabs.com';

/** Settings printed by `local-device-gateway-setup.sh env`. The token itself is never printed. */
export function parseGatewayEnv(output) {
  const urlLine = /^(?:export )?DEVICE_GATEWAY_URL=(.+)$/m.exec(output);
  if (!urlLine) throw new Error('Local device gateway env did not print DEVICE_GATEWAY_URL');
  const url = urlLine[1].trim();
  const tokenFile = /DEVICE_GATEWAY_SERVICE_TOKEN="\$\(cat '([^']+)'\)"/.exec(output)?.[1];
  if (!tokenFile) {
    throw new Error('Local device gateway env did not print the service token file');
  }
  return { tokenFile, url };
}

export function localPortIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: Number(port) });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(true);
    });
  });
}

export async function waitForLocalPort(port, { shouldStop, timeoutMs = 180_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!shouldStop?.() && Date.now() < deadline) {
    if (await localPortIsOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (shouldStop?.()) return;
  if (await localPortIsOpen(port)) return;
  throw new Error(
    `Local device gateway did not listen on localhost:${port}. Install go and git, or check that the gateway repository is reachable. skip-login does not use the production gateway.`,
  );
}

export function isLocalDeviceGatewayUrl(value) {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/** The DEVICE_GATEWAY_URL inherited by the process listening on the Electron CDP port. */
export function electronDeviceGatewayUrl(cdpPort) {
  if (process.platform === 'win32') return;
  let pids;
  try {
    pids = execFileSync('lsof', ['-nP', `-tiTCP:${cdpPort}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 2000,
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return;
  }
  for (const pid of pids) {
    try {
      const command = execFileSync('ps', ['eww', '-p', pid], {
        encoding: 'utf8',
        timeout: 2000,
      });
      const match = /\bDEVICE_GATEWAY_URL=(\S+)/.exec(command);
      if (match) return match[1];
    } catch {
      /* The next pid may still carry the variable. */
    }
  }
}

export function assertElectronUsesLocalGateway(cdpPort) {
  const url = electronDeviceGatewayUrl(cdpPort);
  if (isLocalDeviceGatewayUrl(url)) return url;
  throw new Error(
    `This Electron is not using a local device gateway (DEVICE_GATEWAY_URL=${url || 'unset'}). Start it with bun run dev:desktop:skip-login so Next and Electron share the local gateway.`,
  );
}
