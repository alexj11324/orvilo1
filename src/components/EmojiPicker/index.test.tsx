import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import EmojiPicker from './index';

vi.mock('@/store/global', () => ({ useGlobalStore: () => 'en-US' }));
vi.mock('@/store/global/selectors', () => ({
  globalGeneralSelectors: { currentLanguage: vi.fn() },
}));
vi.mock('./EmojiMartPanel', () => ({
  default: ({ onSelect }: { onSelect: (emoji: string) => void }) => (
    <button type="button" onClick={() => onSelect('🦊')}>
      pick fox
    </button>
  ),
}));

afterEach(cleanup);

describe('EmojiPicker', () => {
  it('renders the custom trigger immediately, without waiting for the emoji grid', () => {
    render(<EmojiPicker customRender={(avatar) => <span>icon {avatar}</span>} value="📦" />);

    expect(screen.getByText('icon 📦')).toBeInTheDocument();
    expect(screen.queryByText('pick fox')).not.toBeInTheDocument();
  });

  it('loads the emoji grid on open and reports the picked emoji', async () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <EmojiPicker
        customRender={() => <span>trigger</span>}
        value="📦"
        onChange={onChange}
        onOpenChange={onOpenChange}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('trigger'));
    });
    fireEvent.click(await screen.findByText('pick fox'));

    expect(onChange).toHaveBeenCalledWith('🦊');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('restores the default avatar on delete', async () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <EmojiPicker
        allowDelete
        defaultOpen
        customRender={() => <span>trigger</span>}
        defaultAvatar="🤖"
        value="📦"
        onChange={onChange}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'emojiPicker.delete' }));

    expect(onChange).toHaveBeenCalledWith('🤖');
    expect(onDelete).toHaveBeenCalled();
  });
});
