import { getHatchetClient } from '@/libs/hatchet';

import { createCoreHatchetTasks } from './tasks';
import { createWorkflowHatchetTasks } from './workflowTasks';

const startWorker = async () => {
  const hatchet = getHatchetClient();
  const worker = await hatchet.worker(process.env.HATCHET_WORKER_NAME || 'orvilo-core', {
    handleKill: true,
    slots: Number(process.env.HATCHET_WORKER_SLOTS || 20),
    workflows: [...createCoreHatchetTasks(hatchet), ...createWorkflowHatchetTasks(hatchet)],
  });

  await worker.start();
};

void startWorker().catch((error) => {
  console.error('Hatchet worker failed:', error);
  process.exitCode = 1;
});
