# Linear import catalog query boundary

The Linear importer needs team metadata, workflow states, and cycles before it can render the source picker and state mapping. Linear rejected the former query with HTTP 400 `Query too complex`: one page of 100 teams expanded up to 25 states and 25 cycles under each team.

The provider now fetches a paginated team metadata connection first. After checking the team's organization against the installation, it fetches that team's states and cycles through separate paginated connections. Foreign-organization teams receive no child queries. Private-team metadata remains available for the existing scope policy to evaluate.

The query split preserves complete state and cycle lists. It does add at least two requests per accepted team, so catalog latency in large organizations is a follow-up to measure; a successful small catalog does not establish a large-workspace latency target.

The regression models the previous HTTP 400 rejection and checks state/cycle assembly, pagination, and organization filtering. In the combined Electron candidate `de2d7098`, the live catalog returned successfully, eight workflow states were mapped, and the local import completed 148 issues across three pages. The full evidence is in the dependent pagination PR's `docs/research/linear/import-e2e-20260926/README.md`.
