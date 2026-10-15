import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

// Mock process.exit to prevent actual exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

// Mock console methods
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('checkDeprecatedAuth', () => {
  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    // Clear module cache to ensure fresh import
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it('should not exit when no deprecated env vars are set', async () => {
    const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
    checkDeprecatedAuth();

    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should exit with code 1 when NextAuth env vars are detected', async () => {
    process.env.NEXT_AUTH_SECRET = 'test-secret';

    const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
    checkDeprecatedAuth();

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalled();
  });

  it('should exit with code 1 when NEXTAUTH env vars are detected', async () => {
    process.env.NEXTAUTH_SECRET = 'test-secret';

    const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
    checkDeprecatedAuth();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit with code 1 when Clerk env vars are detected', async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_key';

    const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
    checkDeprecatedAuth();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should not exit when only the Clerk session-exchange vars are set', async () => {
    process.env.CLERK_SECRET_KEY = 'test-key';
    process.env.CLERK_ISSUER = 'https://clerk.example.com';
    process.env.CLERK_AUTHORIZED_PARTIES = 'https://app.example.com';

    const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
    checkDeprecatedAuth();

    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should exit with code 1 when ACCESS_CODE is set', async () => {
    process.env.ACCESS_CODE = 'test-code';

    const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
    checkDeprecatedAuth();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit with code 1 when APP_URL has trailing slash', async () => {
    process.env.APP_URL = 'https://example.com/';

    const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
    checkDeprecatedAuth();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should not exit when APP_URL has no trailing slash', async () => {
    process.env.APP_URL = 'https://example.com';

    const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
    checkDeprecatedAuth();

    expect(mockExit).not.toHaveBeenCalled();
  });

  describe('retired Better Auth configuration', () => {
    it('warns without blocking when an old AUTH_SECRET remains', async () => {
      process.env.AUTH_SECRET = 'retired-secret';
      const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
      checkDeprecatedAuth();
      expect(mockExit).not.toHaveBeenCalled();
      expect(mockConsoleWarn.mock.calls.flat().join(' ')).toContain('Clerk');
      expect(mockConsoleWarn.mock.calls.flat().join(' ')).not.toContain('retired-secret');
    });

    it('routes old SSO settings to Clerk instead of removed provider variables', async () => {
      process.env.AUTH_SSO_PROVIDERS = 'casdoor,logto';
      const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
      checkDeprecatedAuth();
      const output = mockConsoleWarn.mock.calls.flat().join(' ');
      expect(mockExit).not.toHaveBeenCalled();
      expect(output).toContain('Clerk');
      expect(output).not.toContain('CASDOOR_WEBHOOK_SECRET');
      expect(output).not.toContain('LOGTO_WEBHOOK_SIGNING_KEY');
    });

    it('does not direct NextAuth installations to the removed Better Auth runtime', async () => {
      process.env.NEXT_AUTH_SECRET = 'old-secret';
      const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
      checkDeprecatedAuth();
      const output = mockConsoleError.mock.calls.flat().join(' ');
      expect(output).toContain('Clerk');
      expect(output).not.toContain('migrate to Better Auth');
    });

    it('does not tell SMTP setups to enable AUTH_EMAIL_VERIFICATION', async () => {
      delete process.env.AUTH_EMAIL_VERIFICATION;
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.EMAIL_SERVICE_PROVIDER = 'resend';

      const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
      checkDeprecatedAuth();

      const output = [...mockConsoleWarn.mock.calls, ...mockConsoleError.mock.calls]
        .flat()
        .join(' ');
      expect(mockExit).not.toHaveBeenCalled();
      expect(output).not.toContain('AUTH_EMAIL_VERIFICATION');
      expect(output).not.toContain('verify user email ownership');
    });
  });

  describe('mixed errors and warnings', () => {
    it('should exit when there are errors even if there are also warnings', async () => {
      process.env.AUTH_SSO_PROVIDERS = 'logto'; // warning
      process.env.ACCESS_CODE = 'test-code'; // error

      const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
      checkDeprecatedAuth();

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleWarn).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalled();
    });
  });

  describe('action parameter', () => {
    it('should use "redeploy" as default action', async () => {
      process.env.ACCESS_CODE = 'test-code';

      const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
      checkDeprecatedAuth();

      const calls = mockConsoleError.mock.calls.flat().join(' ');
      expect(calls).toContain('redeploy');
    });

    it('should use custom action when provided', async () => {
      process.env.ACCESS_CODE = 'test-code';

      const { checkDeprecatedAuth } = await import('./checkDeprecatedAuth.js');
      checkDeprecatedAuth({ action: 'restart' });

      const calls = mockConsoleError.mock.calls.flat().join(' ');
      expect(calls).toContain('restart');
    });
  });
});
