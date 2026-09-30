import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import * as editor from '@/features/EditorModal';
import { userMemoryService } from '@/services/userMemory';
import { useUserStore } from '@/store/user';
import { createLegacyMemory } from '@/store/userMemory/useLegacyMemoryPage';
import { getMemorySession } from '@/store/userMemory/utils/session';
import { LayersEnum } from '@/types/userMemory';

import { useScopedMemoryEditor } from './useScopedMemoryEditor';

afterEach(() => {
  vi.restoreAllMocks();
  useUserStore.getState().reset();
});

it('saves a manually entered experience through the manual API', async () => {
  const create = vi.spyOn(userMemoryService, 'createManual').mockResolvedValue({ id: 'new' });
  const modal = vi.spyOn(editor, 'openEditorModal').mockReturnValue({ close: vi.fn() } as never);
  const { result, unmount } = renderHook(useScopedMemoryEditor);
  const session = getMemorySession();
  act(() =>
    result.current({
      value: '',
      onConfirm: (value) => createLegacyMemory(LayersEnum.Experience, value, session),
    }),
  );
  await modal.mock.calls[0][0].onConfirm?.('User-authored experience');
  expect(create).toHaveBeenCalledWith(LayersEnum.Experience, 'User-authored experience');
  unmount();
});

it('closes a private dialog on account change and fences its retained confirm callback', async () => {
  useUserStore.setState({ user: { id: 'alice' } as never });
  const close = vi.fn();
  const confirm = vi.fn();
  const modal = vi.spyOn(editor, 'openEditorModal').mockReturnValue({ close } as never);
  const { result, unmount } = renderHook(useScopedMemoryEditor);
  act(() => result.current({ value: 'Alice private text', onConfirm: confirm }));
  const oldConfirm = modal.mock.calls[0][0].onConfirm;
  act(() => useUserStore.setState({ user: { id: 'bob' } as never }));
  expect(close).toHaveBeenCalled();
  await oldConfirm?.('Changed Alice text');
  expect(confirm).not.toHaveBeenCalled();
  unmount();
});
