import type { ProviderBinding, ProviderBindingConfig } from '@orvilo/types';
import { create } from 'zustand';

import { mutate, useClientDataSWR } from '@/libs/swr';
import { providerBindingService } from '@/services/providerBinding';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

const userId = () => userProfileSelectors.userId(useUserStore.getState());
export const providerBindingKeys = {
  list: (owner: string, generation: number) => ['providerBinding:list', owner, generation] as const,
};
interface BindingState {
  bindings: ProviderBinding[];
  generation: number;
  pending: Record<string, boolean>;
}
export const useProviderBindingStore = create<BindingState>(() => ({
  generation: 0,
  bindings: [],
  pending: {},
}));
const scope = () => ({
  owner: userId(),
  generation: useProviderBindingStore.getState().generation,
});
const current = (captured: ReturnType<typeof scope>) =>
  captured.owner === userId() &&
  captured.generation === useProviderBindingStore.getState().generation;

export function useFetchProviderBindings() {
  const owner = useUserStore(userProfileSelectors.userId);
  const generation = useProviderBindingStore((s) => s.generation);
  return useClientDataSWR(
    owner ? providerBindingKeys.list(owner, generation) : null,
    () => providerBindingService.list(),
    {
      onSuccess: (result) => {
        if (current({ owner, generation }))
          useProviderBindingStore.setState({ bindings: result.data });
      },
    },
  );
}
async function change(key: string, operation: () => Promise<unknown>) {
  const captured = scope();
  if (!captured.owner) throw new Error('Authentication required');
  if (useProviderBindingStore.getState().pending[key]) throw new Error('Operation in progress');
  useProviderBindingStore.setState((s) => ({ pending: { ...s.pending, [key]: true } }));
  try {
    await operation();
    if (current(captured))
      await mutate(providerBindingKeys.list(captured.owner, captured.generation));
  } finally {
    if (current(captured))
      useProviderBindingStore.setState((s) => ({ pending: { ...s.pending, [key]: false } }));
  }
}
export const providerBindingActions = {
  save: (config: ProviderBindingConfig, binding?: ProviderBinding) =>
    change(binding?.id ?? 'create', () =>
      binding
        ? providerBindingService.update(binding.id, binding.revision, config)
        : providerBindingService.create(config),
    ),
  remove: (binding: ProviderBinding) =>
    change(binding.id, () => providerBindingService.delete(binding.id, binding.revision)),
};
useUserStore.subscribe((state, previous) => {
  if (userProfileSelectors.userId(state) !== userProfileSelectors.userId(previous)) {
    useProviderBindingStore.setState((s) => ({
      generation: s.generation + 1,
      bindings: [],
      pending: {},
    }));
  }
});
