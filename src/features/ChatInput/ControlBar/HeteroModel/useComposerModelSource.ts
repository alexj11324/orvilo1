import type { ProviderBinding } from '@orvilo/types';

export const collectPrimeModelRoutes = (bindings: readonly ProviderBinding[]): string[] => {
  const routes = new Set<string>();
  for (const binding of bindings) {
    const selection = binding.selection;
    if (
      binding.enabled === true &&
      selection?.runtime === 'orvilo' &&
      selection.target === 'sandbox' &&
      binding.model
    ) {
      routes.add(binding.model);
    }
  }
  return [...routes];
};
