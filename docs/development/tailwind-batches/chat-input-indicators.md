# Chat input controls and status indicators

Twelve files remove direct antd-style imports from search/memory action controls,
branch/worktree modal messages, directory/skill icons, token usage and upload
status. Controls use Tailwind utilities; dynamic component color/fill props keep
exact semantic CSS references. Store writes, permission guards, upload progress,
modal submission and model capability handling are unchanged.

Search and memory rows retain their hover/selected fill, 200ms CSS ease curve,
focus-ring composition and inherited line heights. Description/tertiary colors,
legacy radii and the empty usage track fill remain exact legacy theme references.
No DOM changes, new tokens, dependencies or important modifiers are introduced.

Scoped checks and independent review are recorded on the PR. 未做真机验证；
no visual parity or Electron acceptance claimed. No stylesheet-string tests.
