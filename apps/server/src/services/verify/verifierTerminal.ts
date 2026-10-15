import type { OrviloDatabase } from '@/database/type';

export interface SettleVerifierCheckFromTerminalParams {
  checkItemId: string;
  errorMessage?: string;
  parentOperationId: string;
  reason?: string;
  verifierOperationId: string;
}

/** A stale verifier completion cannot write results or advance its former Issue. */
export const settleVerifierCheckFromTerminal = async (
  _db: OrviloDatabase,
  _userId: string,
  _params: SettleVerifierCheckFromTerminalParams,
  _workspaceId?: string,
): Promise<void> => {};
