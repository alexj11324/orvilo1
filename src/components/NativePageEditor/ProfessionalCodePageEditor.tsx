'use client';

import { NativeProfessionalCodeWidget } from './code';
import { NativePageEditor, type NativePageEditorProps } from './index';
import type { NativeEditorWidgets } from './session';

export interface ProfessionalCodePageEditorProps extends Omit<NativePageEditorProps, 'widgets'> {
  /** All other complex owners remain mandatory, with no SDK/plain-text substitute. */
  widgets: Omit<NativeEditorWidgets, 'code'>;
}

/** Explicit opt-in business wiring. The existing PageEditor route stays unchanged. */
export function ProfessionalCodePageEditor({ widgets, ...props }: ProfessionalCodePageEditorProps) {
  return (
    <NativePageEditor
      {...props}
      widgets={{
        ...widgets,
        code: (widgetProps) => <NativeProfessionalCodeWidget {...widgetProps} />,
      }}
    />
  );
}
