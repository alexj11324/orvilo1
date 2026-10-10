# Acceptance viewer presentation

Continues #577 by moving six viewer files from antd-style to Tailwind: status pills, interaction-cost disclosure, origin conversation trigger and panel, flow results and edge captions. State, permissions, review mutations, draft lifecycle, graph geometry and event handlers are unchanged.

Secondary text maps to muted-foreground, container surfaces to card and secondary borders to sidebar-border. Exact tertiary text, quaternary overlay and medium motion duration retain the existing theme variables. The caption keeps its opaque card base under the translucent gradient, pointer-event passthrough, five-line clamp, 94px height cap and runtime position/width.

Scoped legacy geometry is preserved: status gap 5px and 99px radius, caption 5px vertical inset and 8px radius, 12px metadata with inherited line height, panel title 13px, caption 18px line height and observation 1.7 line height. The native origin button inherits the complete font shorthand. Disclosure rotation retains the 150ms ease transition; pill filtering retains the engine duration and CSS ease curve.

This batch does not change React Flow handles, third-party controls, resizable history rails or the global legacy style layer. These require separate component/cascade migration.

Validation: scoped lint and related tests, normal hooks and one independent light review. No new behavior test is added for class-only changes. 未做真机验证；no Electron acceptance or visual parity claimed.

CI follow-up: the Chinese UI font guard parses arbitrary \[font:inherit] utilities as CSS text and rejects the trailing classes. The native button now retains the same complete font inheritance through its public inline style, which the guard explicitly allows. No font stack or guard rule changes.
