# Automations presentation

Continues #577 across all eleven Automations sources that imported antd-style: creation/detail references, run/schedule lists, skeletons, settings, trigger preview, template gallery and status badges. The feature no longer directly imports antd-style. DOM, task scheduling, permissions, filtering, selection, actions, routing, translations and payloads remain unchanged.

Run and schedule header/body/skeleton grids retain the same tracks and 12px gaps. Headers keep 6px/8px padding and 12px labels; rows keep 8px padding, 8px radius and the existing hover wash. The batch bar remains sticky 16px from the bottom with 12px radius, elevated surface and exact secondary shadow. Title truncation and inherited line heights stay intact.

The gallery retains one 1fr track below 900px and two 1fr tracks from 900px inclusive; summary text remains two-line clamped. Preview panels retain their 12px radius and quaternary background. Existing inline card backgrounds remain inline and therefore retain their precedence over hover utilities; this batch does not activate previously overridden hover backgrounds.

Status fill aliases map to success/destructive/info and accent. Status background washes and tertiary/quaternary/description colors retain exact legacy variables. No derived status wash substitutions, raw color additions, new tokens, global cascade or motion changes.

Validation: scoped check with selected related tests, normal hooks and one independent light review. No source-string tests for class-only substitutions. 未做真机验证；no Electron visual parity or mobile runtime acceptance claimed.
