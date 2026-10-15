import { createElement, type ElementType } from 'react';
import type { Components, ExtraProps } from 'streamdown';

/** Streamdown's custom-tag index requires a renderer accepting generic HAST
 * properties. React creates the actual element so intrinsic/native owners keep
 * their props, children, ref and node without an unsafe component-map cast. */
export function markdownComponentAdapters(
  components: Readonly<Record<string, ElementType | undefined>>,
): Components {
  return Object.fromEntries(
    Object.entries(components).map(([tag, Component]) => [
      tag,
      Component
        ? (props: Record<string, unknown> & ExtraProps) => createElement(Component, props)
        : undefined,
    ]),
  );
}
