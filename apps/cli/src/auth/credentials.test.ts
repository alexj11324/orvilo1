import crypto from 'node:crypto';
import fs from 'node:fs';
import type * as OsModule from 'node:os';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  password: null as string | null,
  unavailable: false,
  entries: new Map<string, string>(),
}));
vi.mock('@napi-rs/keyring', () => ({
  Entry: class {
    constructor(
      _service: string,
      private account: string,
    ) {}
    getPassword() {
      if (state.unavailable) throw new Error('locked');
      return state.entries.get(this.account) ?? null;
    }
    setPassword(value: string) {
      if (state.unavailable) throw new Error('locked');
      state.password = value;
      state.entries.set(this.account, value);
    }
    deleteCredential() {
      const existed = state.entries.delete(this.account);
      state.password = null;
      return existed;
    }
  },
}));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orvilo-creds-'));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof OsModule>();
  return { ...actual, default: { ...actual, homedir: () => tmpDir } };
});
const { clearCredentials, loadCredentials, saveCredentials } = await import('./credentials');
const file = path.join(tmpDir, process.env.ORVILO_CLI_HOME!, 'credentials.json');
const credentials = { accessToken: 'sentinel-access', refreshToken: 'sentinel-refresh' };
describe('protected credentials', () => {
  beforeEach(() => {
    state.password = null;
    state.entries.clear();
    state.unavailable = false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });
  it('stores in OS storage and survives reload without a credential file', () => {
    saveCredentials(credentials);
    expect(fs.existsSync(file)).toBe(false);
    expect(loadCredentials()).toEqual(credentials);
    expect(clearCredentials()).toBe(true);
    expect(loadCredentials()).toBeNull();
  });
  it('loads credentials under the selected custom server after login settings switch', () => {
    saveCredentials(credentials, 'https://custom-server.test');
    vi.stubEnv('ORVILO_SERVER', 'https://custom-server.test');
    expect(loadCredentials()).toEqual(credentials);
    vi.stubEnv('ORVILO_SERVER', 'https://another-server.test');
    expect(loadCredentials()).toBeNull();
    vi.unstubAllEnvs();
  });
  it('refuses insecure persistence when OS storage is unavailable', () => {
    state.unavailable = true;
    expect(() => saveCredentials(credentials)).toThrow(/protected/i);
    expect(fs.existsSync(file)).toBe(false);
    expect(() => loadCredentials()).toThrow(/protected/i);
  });
  it('preserves legacy data until a protected roundtrip succeeds', () => {
    fs.writeFileSync(file, JSON.stringify(credentials));
    state.unavailable = true;
    expect(loadCredentials()).toEqual(credentials);
    expect(fs.existsSync(file)).toBe(true);
    state.unavailable = false;
    expect(loadCredentials()).toEqual(credentials);
    expect(fs.existsSync(file)).toBe(false);
  });
  it('keeps legacy tokens with their persisted server when the selected server differs', () => {
    fs.writeFileSync(
      path.join(path.dirname(file), 'settings.json'),
      JSON.stringify({ serverUrl: 'https://server-a.test' }),
    );
    fs.writeFileSync(file, JSON.stringify(credentials));
    vi.stubEnv('ORVILO_SERVER', 'https://server-b.test');
    expect(loadCredentials()).toBeNull();
    expect(fs.readFileSync(file, 'utf8')).toBe(JSON.stringify(credentials));
    expect(state.entries.size).toBe(0);
    expect(clearCredentials()).toBe(false);
    expect(fs.existsSync(file)).toBe(true);
  });
  it('preserves legacy server credentials in protected storage before switching login server', () => {
    fs.writeFileSync(
      path.join(path.dirname(file), 'settings.json'),
      JSON.stringify({ serverUrl: 'https://server-a.test' }),
    );
    fs.writeFileSync(file, JSON.stringify(credentials));
    const credentialsB = { accessToken: 'server-b-access', refreshToken: 'server-b-refresh' };
    saveCredentials(credentialsB, 'https://server-b.test');
    fs.writeFileSync(
      path.join(path.dirname(file), 'settings.json'),
      JSON.stringify({ serverUrl: 'https://server-b.test' }),
    );
    expect(loadCredentials()).toEqual(credentialsB);
    vi.stubEnv('ORVILO_SERVER', 'https://server-a.test');
    expect(loadCredentials()).toEqual(credentials);
  });
  it('keeps newer protected source credentials when stale legacy remains after failed unlink', () => {
    const settingsFile = path.join(path.dirname(file), 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ serverUrl: 'https://server-a.test' }));
    fs.writeFileSync(file, JSON.stringify(credentials));
    const freshA = { accessToken: 'fresh-a-access', refreshToken: 'fresh-a-refresh' };
    const unlink = vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
      throw new Error('unlink failed');
    });
    expect(() => saveCredentials(freshA, 'https://server-a.test')).toThrow('unlink failed');
    unlink.mockRestore();
    expect(fs.existsSync(file)).toBe(true);
    saveCredentials({ accessToken: 'server-b-access' }, 'https://server-b.test');
    fs.writeFileSync(settingsFile, JSON.stringify({ serverUrl: 'https://server-b.test' }));
    vi.stubEnv('ORVILO_SERVER', 'https://server-a.test');
    expect(loadCredentials()).toEqual(freshA);
    expect(fs.existsSync(file)).toBe(false);
  });
  it('refuses cross-server preservation if the existing protected source is corrupt', () => {
    fs.writeFileSync(
      path.join(path.dirname(file), 'settings.json'),
      JSON.stringify({ serverUrl: 'https://server-a.test' }),
    );
    saveCredentials(credentials, 'https://server-a.test');
    const sourceAccount = [...state.entries.keys()][0];
    state.entries.set(sourceAccount, 'corrupt-protected-source');
    fs.writeFileSync(file, JSON.stringify(credentials));
    expect(() =>
      saveCredentials({ accessToken: 'server-b-access' }, 'https://server-b.test'),
    ).toThrow('Corrupt protected source credentials');
    expect(state.entries.get(sourceAccount)).toBe('corrupt-protected-source');
    expect(state.entries.size).toBe(1);
    expect(fs.readFileSync(file, 'utf8')).toBe(JSON.stringify(credentials));
  });
  it('refuses switching login server when legacy source migration cannot be verified', () => {
    const settingsFile = path.join(path.dirname(file), 'settings.json');
    const settings = JSON.stringify({ serverUrl: 'https://server-a.test' });
    fs.writeFileSync(settingsFile, settings);
    fs.writeFileSync(file, JSON.stringify(credentials));
    state.unavailable = true;
    expect(() =>
      saveCredentials({ accessToken: 'server-b-access' }, 'https://server-b.test'),
    ).toThrow(/protected/i);
    expect(fs.readFileSync(file, 'utf8')).toBe(JSON.stringify(credentials));
    expect(fs.readFileSync(settingsFile, 'utf8')).toBe(settings);
    expect(state.entries.size).toBe(0);
  });
  it('reads old ciphertext and migrates only after protected verification', () => {
    const key = crypto.pbkdf2Sync(
      `orvilo-cli:${os.hostname()}:${os.userInfo().username}`,
      'orvilo-cli-salt',
      100_000,
      32,
      'sha256',
    );
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);
    fs.writeFileSync(file, Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64'));
    expect(loadCredentials()).toEqual(credentials);
    expect(fs.existsSync(file)).toBe(false);
    expect(JSON.parse(state.password!)).toEqual(credentials);
  });
  it('reports corruption separately from no credentials and preserves the artifact', () => {
    fs.writeFileSync(file, 'corrupt');
    expect(() => loadCredentials()).toThrow(/corrupt/i);
    expect(fs.existsSync(file)).toBe(true);
  });
});
