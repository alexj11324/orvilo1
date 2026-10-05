import { useMemo } from 'react';

import { flattenSelectOptions, type SelectOption } from '@/components/SelectOptions';

import { APPLICATION_DEFAULT_FONT } from '../useSystemFontOptions';
import { MAX_FALLBACK_FONTS } from './fontStack';

interface UseFontFallbackStackParams {
  onChange: (stack: string[]) => void;
  options: SelectOption[];
  stack: string[];
}

export const useFontFallbackStack = ({ onChange, options, stack }: UseFontFallbackStackParams) => {
  const [primary, ...fallbacks] = stack;

  const candidates = useMemo(
    () =>
      flattenSelectOptions(options)
        .filter((option) => option.value !== APPLICATION_DEFAULT_FONT)
        .map((option) => (stack.includes(option.value) ? { ...option, disabled: true } : option)),
    [options, stack],
  );

  const labelOf = (value: string) =>
    flattenSelectOptions(options).find((option) => option.value === value)?.label ?? value;

  return {
    add: (value: string) => onChange([...stack, value]),
    atLimit: fallbacks.length >= MAX_FALLBACK_FONTS,
    candidates,
    fallbacks,
    labelOf,
    primary,
    remove: (value: string) => onChange(stack.filter((font) => font !== value)),
    reorder: (next: string[]) => onChange([primary, ...next]),
  };
};
