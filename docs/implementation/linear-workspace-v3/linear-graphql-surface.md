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

Anything else the catalog selects — `projects`, `teams`, `team(id:)`,
`issues(filter:)`, `Team.visibility/states/cycles`, `Cycle.startsAt/endsAt`,
comment/relation/issue mutations — is valid against the real schema. If a
future field stops resolving, Linear answers with
`Cannot query field "…" on type "Query"`; fix the field constant rather than
special-casing the error.
