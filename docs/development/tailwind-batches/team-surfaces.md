# Team surface presentation

Six WorkTeams files remove direct antd-style imports: issue filters and peek
layout, project summary sidebar, team identity, home section frame and members.
Native controls, loading states, filtering, paging, navigation and data loading
remain unchanged. Dynamic team glyph colors still use the existing contrast
calculation.

Named work-surface container queries preserve inclusive 900px and 1000px
boundaries and the original overlay width, logical insets and shadow. Member
lists retain narrow-surface padding. Joined dates keep the text-sm line-height
variable explicitly after class merging replaces its font-size utility. Project rows/chips retain the existing
selected fill and hover precedence. Exact legacy radii, tertiary color and peek
shadow remain explicit. The home frame's redundant width:100% query is omitted.

Anchor reset interactions in other team surfaces and resource-dialog descendant
control overrides remain separate. No DOM changes, new tokens or important
modifiers. Scoped checks and independent review are recorded on the PR.
未做真机验证；no visual parity or Electron acceptance claimed.
