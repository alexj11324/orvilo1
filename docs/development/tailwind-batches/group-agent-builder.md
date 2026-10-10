# Group Agent Builder

Fourteen Inspector, Streaming and Render files now use Tailwind utility strings
and existing semantic CSS variables instead of direct antd-style imports.
Agent/group creation, invitations, removal, prompt-length deltas, group tab
selection and result branches are unchanged.

Secondary labels, success/error indicators, card backgrounds and secondary
borders use the existing semantic bridge. Description, tertiary/quaternary text,
quaternary fill and runtime radius retain their exact existing variables until
the shared theme migration. The existing 8px result radius is preserved.

Logical bottom borders and status-icon margins retain their original direction
and values. Shared shiny text still owns its animation and secondary rest color;
the migrated labels use that same secondary semantic value. The shared shiny
group class only supplies positioning/custom properties, so combining it with
layout utility strings does not change a competing property. Shared Markdown,
tool tags and animation definitions remain separate migration work.

Scoped check, normal hooks and independent review evidence are recorded on the
PR. No source-string tests for this style conversion. 未做真机验证；no visual
parity or full dependency-removal claim.
