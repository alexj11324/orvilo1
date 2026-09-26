# Linear GraphQL surface constraints

The sync provider (`apps/server/src/services/linearSync/provider.ts`) speaks
directly to Linear's public GraphQL API. Two schema properties constrain what
the catalog can ask for — both were verified against the official schema
(`linear/linear` SDK `schema.graphql`):

- **Organization is singular and implicit.** `Query` exposes `organization`
  (one `Organization`, resolved from the OAuth token's workspace) — there is no
  `organizations` connection. `listOrganizations()` therefore queries the
  singular field and returns a one-element snapshot.
- **`Project` has no `organization` field.** The API is already scoped to the
  token's organization, so every project the token can see belongs to the
  installation's organization by construction. `PROJECT_FIELDS` must not
  select `organization`; the snapshot reports `organizationId` from the
  provider's configured installation org instead.
- `Team.organization { id }` does exist and remains the authoritative org
  filter for teams (public/private/restricted visibility aside).
- Members paginate through `organization { users(first:after:) { nodes } }`.
- **Nested catalog connections must stay small.** Linear scores request cost
  per query and multiplies nested `first:` arguments — `first: 100` on both
  levels asks for tens of thousands of nodes and is rejected with
  `Query too complex`. `NESTED_PAGE_SIZE` keeps inline pages cheap; the
  per-item follow-up queries (`ListProjectTeams`, `ListTeamStates`,
  `ListTeamCycles`) page through the remainder.
- **`id: { eq: ... }` comparators take `ID`, not `String`.** Filter variables
  in `issues(filter: { project|team: { id: { eq: $var } } })` must be declared
  `$var: ID!` or Linear answers `used in position expecting type "ID"`.
  Identifier arguments like `issue(id:)` and `team(id:)` still take `String`.

Anything else the catalog selects — `projects`, `teams`, `team(id:)`,
`issues(filter:)`, `Team.visibility/states/cycles`, `Cycle.startsAt/endsAt`,
comment/relation/issue mutations — is valid against the real schema. If a
future field stops resolving, Linear answers with
`Cannot query field "…" on type "Query"`; fix the field constant rather than
special-casing the error.
