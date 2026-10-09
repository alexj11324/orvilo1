/** @vitest-environment happy-dom */
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { ActionDropdownMenuItems } from '@/features/ChatInput/ActionBar/components/ActionDropdown';

import HeteroPlus from './HeteroPlus';

const mocks = vi.hoisted(() => ({
  items: [] as ActionDropdownMenuItems,
  schedule: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/ChatInput/ActionBar/components/ChatInputAction', () => ({
  ChatInputAction: ({ dropdown }: { dropdown: { menu: { items: ActionDropdownMenuItems } } }) => {
    mocks.items = dropdown.menu.items;
    return <div />;
  },
}));
vi.mock('@/features/ChatInput/store', () => ({
  useChatInputStore: (selector: (state: unknown) => unknown) =>
    selector({ editor: {}, showTypoBar: false, setShowTypoBar: mocks.toggle }),
}));
vi.mock('@/features/Conversation', () => ({
  useConversationStore: (selector: (state: unknown) => unknown) =>
    selector({ scheduledSendAt: undefined, setScheduledSendAt: mocks.schedule }),
}));
vi.mock('@/store/user', () => ({ useUserStore: () => true }));
vi.mock('@/features/ChatInput/InputEditor/ActionTag/goalTag', () => ({ insertGoalTag: vi.fn() }));

it('retains scheduling and formatting without an application goal action', () => {
  render(<HeteroPlus />);
  const keys = mocks.items.map((item) => ('key' in item ? item.key : item.type));
  expect(keys).toEqual(['scheduleSend', 'divider', 'typo']);
  const formatting = mocks.items.find((item) => 'key' in item && item.key === 'typo');
  if (formatting && 'onCheckedChange' in formatting) formatting.onCheckedChange?.(true);
  expect(mocks.toggle).toHaveBeenCalledWith(true);
});
