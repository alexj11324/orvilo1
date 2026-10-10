import type { App, Receiver } from '@slack/bolt';

/** Ingress is verified and durably queued by the HTTP route before reaching this receiver. */
export class SlackChannelsReceiver implements Receiver {
  private app?: App;
  private started = false;

  init(app: App) {
    this.app = app;
  }

  async start() {
    this.started = true;
  }

  async stop() {
    this.started = false;
  }

  async dispatch(body: Record<string, unknown>) {
    if (!this.app || !this.started) throw new Error('Slack Channels receiver is not started');
    // The public request was already acknowledged after enqueueing; Bolt still needs an ack callback.
    await this.app.processEvent({ ack: async () => {}, body });
  }
}
