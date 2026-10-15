import type { ComponentProps, ReactNode } from 'react';

import type { StoreBoundNativeChatInputEditorProps } from '../native/StoreBoundNativeChatInputEditor';
import type InputEditor from './index';
import type LegacyInputEditor from './LegacyInputEditor';
import type { PlaceholderVariant } from './Placeholder';
import type { InputEditorProps } from './types';

type PublishedProps = {
  defaultRows?: number;
  initialContent?: string;
  placeholder?: ReactNode;
  placeholderVariant?: PlaceholderVariant;
};
type Assert<T extends true> = T;
type SameKeys<A, B> = keyof A extends keyof B ? (keyof B extends keyof A ? true : false) : false;
type SameProps<A, B> = A extends B ? (B extends A ? SameKeys<A, B> : false) : false;

/** Compile-only contracts. All imports erase; no editor is mounted or executed. */
export type InputOwnerPropContracts = [
  Assert<SameProps<InputEditorProps, PublishedProps>>,
  Assert<SameProps<ComponentProps<typeof InputEditor>, PublishedProps>>,
  Assert<SameProps<ComponentProps<typeof LegacyInputEditor>, PublishedProps>>,
  Assert<SameProps<Omit<StoreBoundNativeChatInputEditorProps, 'mathRenderer'>, PublishedProps>>,
];
