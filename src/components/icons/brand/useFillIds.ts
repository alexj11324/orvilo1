import { useId, useMemo } from 'react';

export interface FillRef {
  fill: string;
  id: string;
}

/** Document-unique gradient ids for one icon instance, as `fill` url refs. */
export const useFillIds = (namespace: string, length: number): FillRef[] => {
  const uniqueId = useId();
  return useMemo(
    () =>
      Array.from({ length }, (_, index) => {
        const id = `orvilo-icon-${namespace.toLowerCase()}-${index}-${uniqueId}`;
        return { fill: `url(#${id})`, id };
      }),
    [namespace, length, uniqueId],
  );
};

export const useFillId = (namespace: string): FillRef => useFillIds(namespace, 1)[0];
