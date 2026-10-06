import CreateAgentPanel from '@/features/CreateAgent/CreateAgentPanel';

/** The API setup entry uses the same creation form as every other origin. */
export default function ApiAgentSetup({
  onCreated,
}: {
  deviceId?: string;
  onCreated: (agentId: string, deviceId: string) => Promise<void>;
}) {
  return (
    <CreateAgentPanel
      builtinOnly
      visibility="private"
      onCreated={async (agentId, config) => {
        const deviceId = config?.agencyConfig?.boundDeviceId;
        if (!deviceId) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
        await onCreated(agentId, deviceId);
      }}
    />
  );
}
