'use client';

import { StyleProvider } from '@ant-design/cssinjs';
import { memo, type PropsWithChildren } from 'react';

/**
 * Puts everything antd injects through cssinjs (component styles and the global
 * `a` / `:focus-visible` link reset) into `@layer antd`. The layer order is
 * declared first in `src/app/globals.css`:
 * `@layer theme, base, antd, components, utilities;`
 *
 * Must wrap the @lobehub/ui ThemeProvider (it renders antd `<App>`). An antd
 * component rendered outside this provider registers an unlayered copy that
 * beats Tailwind again. antd-style classes (`createStaticStyles` etc.) go through
 * emotion, not cssinjs, so they stay unlayered and keep overriding antd.
 *
 * See docs/development/antd-global-style-layer.md.
 */
const AntdStyleLayer = memo<PropsWithChildren>(({ children }) => (
  <StyleProvider layer>{children}</StyleProvider>
));

AntdStyleLayer.displayName = 'AntdStyleLayer';

export default AntdStyleLayer;
