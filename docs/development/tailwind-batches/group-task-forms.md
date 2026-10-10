# Group task forms and results

This batch removes the four direct `antd-style` imports from group task
interventions and task results. Existing local Accordion, Input, Textarea,
InputNumber and Avatar components remain the control owners. Editing, timeout
conversion, task deletion and save-before-approval callbacks are unchanged.

Secondary text, container backgrounds and destructive hover use the existing
semantic tokens. Unmapped tertiary/quaternary text and the runtime radius retain
their exact existing CSS variables until the shared theme migration. Avatar
fallback backgrounds use the existing card variable without a theme hook.

Unused style definitions were removed. The result accordion's old
`.accordion-action` override was dead: the local accordion does not emit that
class. Its `!important` opacity override is removed with that selector.

Validation: scoped check and independent review are recorded on the PR. Pure
style migration does not add source-string tests. 未做真机验证；no claim of visual
parity or completion of shared Markdown/theme dependency removal.
