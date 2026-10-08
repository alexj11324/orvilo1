import { useMutation } from '@tanstack/react-query';

import { toast } from '@/components/toast';

export function useCredentialMutation<T>(
  write: (values: T) => Promise<void>,
  onSuccess: () => void,
  fallback: string,
) {
  return useMutation({
    mutationFn: write,
    onError: (error) =>
      toast.error(error instanceof Error && error.message ? error.message : fallback),
    onSuccess,
  });
}
