import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Entry } from '@napi-rs/keyring';

import { resolveCliDirName } from '../constants/identity';
import { OFFICIAL_SERVER_URL } from '../constants/urls';
import { loadSettings, resolveServerUrl } from '../settings';
import { log } from '../utils/logger';

export interface StoredCredentials {
  accessToken: string;
  expiresAt?: number; // Unix timestamp (seconds)
  refreshToken?: string;
}

const ORVILO_DIR_NAME = resolveCliDirName();
const CREDENTIALS_DIR = path.join(os.homedir(), ORVILO_DIR_NAME);
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

// Read-only compatibility for legacy machine-derived ciphertext. Never used for new writes.
function deriveKey(): Buffer {
  const material = `orvilo-cli:${os.hostname()}:${os.userInfo().username}`;
  return crypto.pbkdf2Sync(material, 'orvilo-cli-salt', 100_000, 32, 'sha256');
}

function decrypt(encoded: string): string {
  const key = deriveKey();
  const packed = Buffer.from(encoded, 'base64');
  const iv = packed.subarray(0, 12);
  const authTag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

function entry(serverUrl = resolveServerUrl()) {
  const account = crypto
    .createHash('sha256')
    .update(`${CREDENTIALS_DIR}:${serverUrl}`)
    .digest('hex');
  return new Entry('orvilo-cli', account, { linux: { store: 'secret-service' } });
}

function parseCredentials(data: string): StoredCredentials {
  const parsed = JSON.parse(data) as StoredCredentials;
  if (
    !parsed ||
    typeof parsed.accessToken !== 'string' ||
    !parsed.accessToken ||
    (parsed.refreshToken !== undefined && typeof parsed.refreshToken !== 'string') ||
    (parsed.expiresAt !== undefined && !Number.isFinite(parsed.expiresAt))
  ) {
    throw new Error('Corrupt credentials');
  }
  return parsed;
}

function legacyServerUrl() {
  return loadSettings()?.serverUrl || OFFICIAL_SERVER_URL;
}

function readLegacyCredentials(): StoredCredentials | null {
  let data: string;
  try {
    data = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('Credential file unreadable', { cause: error });
  }
  try {
    return parseCredentials(data.trim().startsWith('{') ? data : decrypt(data));
  } catch {
    throw new Error('Corrupt legacy credentials');
  }
}

export function saveCredentials(
  credentials: StoredCredentials,
  serverUrl = resolveServerUrl(),
): void {
  // Preserve the legacy source before login changes its persisted server setting.
  const legacyServer = legacyServerUrl();
  if (serverUrl !== legacyServer && fs.existsSync(CREDENTIALS_FILE)) {
    let sourceData: string | null;
    try {
      sourceData = entry(legacyServer).getPassword();
    } catch {
      throw new Error(
        'Protected credential storage unavailable; legacy source could not be preserved',
      );
    }
    if (sourceData !== null) {
      try {
        parseCredentials(sourceData);
      } catch {
        throw new Error('Corrupt protected source credentials');
      }
      fs.unlinkSync(CREDENTIALS_FILE);
    } else {
      const legacy = readLegacyCredentials();
      if (legacy) saveCredentials(legacy, legacyServer);
    }
  }
  const encoded = JSON.stringify(credentials);
  try {
    const protectedEntry = entry(serverUrl);
    protectedEntry.setPassword(encoded);
    if (protectedEntry.getPassword() !== encoded) throw new Error('Verification failed');
  } catch {
    throw new Error('Protected credential storage unavailable; credentials were not persisted');
  }
  if (serverUrl === legacyServer && fs.existsSync(CREDENTIALS_FILE))
    fs.unlinkSync(CREDENTIALS_FILE);
}

export function loadCredentials(): StoredCredentials | null {
  let backendUnavailable = false;
  let protectedData: string | null = null;
  try {
    protectedData = entry().getPassword();
  } catch {
    backendUnavailable = true;
  }
  if (protectedData !== null) {
    try {
      return parseCredentials(protectedData);
    } catch {
      throw new Error('Corrupt protected credentials');
    }
  }
  // An environment override must never send the persisted server's legacy tokens elsewhere.
  if (resolveServerUrl() !== legacyServerUrl()) {
    if (backendUnavailable) throw new Error('Protected credential storage unavailable');
    return null;
  }
  const credentials = readLegacyCredentials();
  if (!credentials) {
    if (backendUnavailable) throw new Error('Protected credential storage unavailable');
    return null;
  }
  try {
    saveCredentials(credentials);
  } catch {
    log.warn('Legacy credentials loaded; protected migration unavailable, original retained.');
  }
  return credentials;
}

export function clearCredentials(): boolean {
  let removed: boolean;
  try {
    removed = entry().deleteCredential();
  } catch {
    throw new Error(
      'Protected credential storage unavailable; stored credentials could not be cleared',
    );
  }
  if (resolveServerUrl() !== legacyServerUrl()) return removed;
  try {
    fs.unlinkSync(CREDENTIALS_FILE);
    removed = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('Legacy credentials could not be cleared', { cause: error });
  }
  return removed;
}
