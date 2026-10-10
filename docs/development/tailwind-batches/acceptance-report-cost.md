# Acceptance interaction cost

Continues #577 by replacing InteractionCost panel antd-style with existing Tailwind utilities. The report and aggregate acceptance view keep the same component, data readers, metric values, operator pricing, phase widths, titles and translations.

Retains the six component-local color mixes using the existing info/card/foreground roles; operator data attributes select the same colors for both legend chips and phase segments. The legend dot and bold values preserve their sizes and typography. Metrics still collapse at width <= 520px; phase rows at width <= 640px. Phase names stay nonshrinking with a 60% cap while check titles truncate; track segments keep their minimum width and dynamic percentage.

Validation: scoped lint and related tests, generated utility inspection and one independent light review before publication. No source-string tests for a style-only substitution. 未做真机验证；no Electron/mobile visual parity claimed.
