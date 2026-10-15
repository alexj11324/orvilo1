/** Renew this long before expiry, so a slow or failed attempt still has room to retry. */
const RENEW_BEFORE_EXPIRY_MS = 60 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;
const MIN_DELAY_MS = 30 * 1000;

/**
 * The server will never renew after these: the token is gone, out of scope, the
 * run ended, or the server predates the renewal endpoint.
 */
const TERMINAL_CODES = new Set(['CONFLICT', 'FORBIDDEN', 'NOT_FOUND', 'UNAUTHORIZED']);

interface OperationTokenRenewalOptions {
  /** Current operation token. Defaults to `process.env.ORVILO_JWT` (the CLI contract). */
  getToken?: () => string | undefined;
  operationId: string;
  renew: (operationId: string) => Promise<{ jwt: string }>;
  /** Store a renewed token where the run's clients read it. Defaults to `process.env.ORVILO_JWT`. */
  setToken?: (jwt: string) => void;
  warn?: (message: string) => void;
}

const readEnvToken = () => process.env.ORVILO_JWT;
const writeEnvToken = (jwt: string) => {
  process.env.ORVILO_JWT = jwt;
};

/** Expiry of a server-minted operation token; undefined for any other credential. */
const readOperationTokenExpiry = (jwt: string): number | undefined => {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return payload?.purpose === 'hetero-operation' && typeof payload.exp === 'number'
      ? payload.exp * 1000
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Keep the operation token of a long `hetero exec` run valid.
 *
 * The server signs it for four hours, and a Goal Task can run far longer. Once
 * it expires every ingest is rejected — heartbeats included — so the lease stops
 * renewing and the server reclaims the operation as abandoned while the agent is
 * still working. Renewing stores the new token through `setToken` (by default
 * `ORVILO_JWT`, which the CLI's tRPC clients read on every request).
 *
 * Only a `hetero-operation` token is renewed. A desktop run authenticates with
 * its own session token, which has its own refresh flow.
 */
export const createOperationTokenRenewal = ({
  getToken = readEnvToken,
  operationId,
  renew,
  setToken = writeEnvToken,
  warn = console.warn,
}: OperationTokenRenewalOptions) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => void attempt(), Math.max(delayMs, MIN_DELAY_MS));
    timer.unref?.();
  };

  const scheduleFromCurrentToken = () => {
    const jwt = getToken();
    const expiresAt = jwt ? readOperationTokenExpiry(jwt) : undefined;
    if (expiresAt === undefined) return false;
    schedule(expiresAt - RENEW_BEFORE_EXPIRY_MS - Date.now());
    return true;
  };

  const attempt = async () => {
    try {
      const { jwt } = await renew(operationId);
      if (stopped) return;
      setToken(jwt);
      scheduleFromCurrentToken();
    } catch (error) {
      const code = (error as { data?: { code?: string } } | null)?.data?.code;
      const message = error instanceof Error ? error.message : String(error);
      if (code && TERMINAL_CODES.has(code)) {
        warn(`Operation token can no longer be renewed (${code}): ${message}`);
        return;
      }
      warn(`Could not renew the operation token, retrying: ${message}`);
      schedule(RETRY_DELAY_MS);
    }
  };

  const active = scheduleFromCurrentToken();

  return {
    /** Whether this run holds a token that gets renewed at all. */
    active,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
};
