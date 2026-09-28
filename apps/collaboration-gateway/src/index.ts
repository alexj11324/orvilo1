import { listenGateway } from './server';

const port = Number(
  process.env.COLLABORATION_GATEWAY_PORT ?? process.env.PORT ?? 3012,
);

const start = async () => {
  const { close } = await listenGateway(port);
  console.log(`collaboration-gateway listening on :${port} (ws path /collaboration)`);

  const shutdown = () => {
    void close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

void start().catch((error) => {
  console.error('collaboration-gateway failed to start:', error);
  process.exitCode = 1;
});
