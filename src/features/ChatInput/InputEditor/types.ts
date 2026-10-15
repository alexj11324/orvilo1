import type { ReactNode } from 'react';

import type { PlaceholderVariant } from './Placeholder';

/** Published composer surface, independent of either editor's runtime graph. */
export interface InputEditorProps {
  defaultRows?: number;
  initialContent?: string;
  placeholder?: ReactNode;
  placeholderVariant?: PlaceholderVariant;
}
