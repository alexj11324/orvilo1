/** @vitest-environment happy-dom */
import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { copyToClipboard } from '@/utils/clipboard';

import CommandLine from './index';

vi.mock('@/utils/clipboard', () => ({ copyToClipboard: vi.fn().mockResolvedValue(undefined) }));

it('names the command copy action and copies the complete command', () => {
  const command = 'lh connect --workspace workspace-with-a-long-identifier --public --daemon';
  const view = render(<CommandLine command={command} />);
  expect(view.getByText(command)).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: /copy/i }));
  expect(copyToClipboard).toHaveBeenCalledWith(command);
});
