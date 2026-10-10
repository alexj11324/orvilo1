# Portal comments and task detail presentation

Eleven Portal files remove direct antd-style imports: topic-comment styles and
consumers, goal-node attempts, acceptance body spacing and task titles. DOM,
comment operations, thread/message navigation and task/acceptance logic remain
unchanged. Existing semantic CSS references preserve title inline priority.

Comment action visibility retains hover-capability media behavior and the
existing descendant marker; disabled anchor previews retain their hover colors.
Editor focus-within border, reply indentation, opacity and exact transition ease
remain. Goal attempt separators retain the first-row exemption. Legacy radii,
tertiary/quaternary values and timing remain exact theme references.

No new tokens, dependencies, important modifiers or layer changes. Markdown and
editor components remain for their later component migrations. Scoped checks and
independent review are recorded on the PR. 未做真机验证；no visual parity or
Electron acceptance claimed. No stylesheet-string tests.
