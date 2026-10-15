'use client';

import { NativePageEditor, type NativePageEditorProps } from './index';
import { type NativeMathRenderer, NativeMathWidget } from './math';
import type { NativeEditorWidgets } from './session';

export interface NativePageEditorWithMathProps extends Omit<NativePageEditorProps, 'widgets'> {
  /** Required actual renderer; the host must also supply its local CSS/fonts. */
  mathRenderer: NativeMathRenderer;
  /** Every remaining complex owner remains explicitly required. */
  widgets: Omit<NativeEditorWidgets, 'math'>;
}

/** Explicit opt-in composition. Never changes the default PageEditor or invents
 * a renderer when the host does not yet own an approved implementation. */
export function NativePageEditorWithMath({
  mathRenderer,
  widgets,
  ...props
}: NativePageEditorWithMathProps) {
  return (
    <NativePageEditor
      {...props}
      widgets={{
        ...widgets,
        math: (widgetProps) => <NativeMathWidget {...widgetProps} renderer={mathRenderer} />,
      }}
    />
  );
}
