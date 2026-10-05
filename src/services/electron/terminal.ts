import type {
  TerminalCreateSessionParams,
  TerminalCreateSessionResult,
  TerminalKillParams,
  TerminalResizeParams,
  TerminalWriteParams,
} from '@orvilo/electron-client-ipc';

import { requireProvenLocalDeviceId } from '@/services/localExecutionIdentity';
import { ensureElectronIpc } from '@/utils/electron/ipc';

class ElectronTerminalService {
  private get ipc() {
    return ensureElectronIpc();
  }

  async createSession(params: TerminalCreateSessionParams): Promise<TerminalCreateSessionResult> {
    await requireProvenLocalDeviceId('createSession');
    return this.ipc.terminal.createSession(params);
  }

  async writeSession(params: TerminalWriteParams): Promise<void> {
    await requireProvenLocalDeviceId('writeSession');
    return this.ipc.terminal.writeSession(params);
  }

  async resizeSession(params: TerminalResizeParams): Promise<void> {
    await requireProvenLocalDeviceId('resizeSession');
    return this.ipc.terminal.resizeSession(params);
  }

  async killSession(params: TerminalKillParams): Promise<void> {
    await requireProvenLocalDeviceId('killSession');
    return this.ipc.terminal.killSession(params);
  }
}

export const electronTerminalService = new ElectronTerminalService();
