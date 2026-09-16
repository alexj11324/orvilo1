import { describe, expect, it } from 'vitest';

import { buildHatchetWorkflowMetricAttributes, normalizeHatchetWorkflowPath } from '.';

describe('Hatchet workflow observability', () => {
  it('normalizes absolute and route workflow URLs to paths', () => {
    expect(normalizeHatchetWorkflowPath('https://worker.example/api/workflows/run')).toBe(
      '/api/workflows/run',
    );
    expect(normalizeHatchetWorkflowPath('/api/workflows/run')).toBe('/api/workflows/run');
    expect(normalizeHatchetWorkflowPath('workflow-name')).toBeUndefined();
  });

  it('emits Hatchet names for workflow lifecycle attributes', () => {
    expect(
      buildHatchetWorkflowMetricAttributes({
        interface: 'hatchet',
        operation: 'serve',
        status: 'success',
        url: 'https://worker.example/api/workflows/run',
      }),
    ).toMatchObject({
      hatchet_workflow_interface: 'hatchet',
      hatchet_workflow_operation: 'serve',
      hatchet_workflow_path: '/api/workflows/run',
      hatchet_workflow_status: 'success',
      hatchet_workflow_url: '/api/workflows/run',
    });
  });
});
