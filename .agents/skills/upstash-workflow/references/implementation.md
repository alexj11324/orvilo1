# Current Workflow Implementation

Follow [Hatchet Workflows](../SKILL.md). The former Upstash three-route pattern
was retired. Current producers use `src/libs/hatchet/index.ts`; register work in
`apps/server/src/hatchet/tasks.ts` or `workflowTasks.ts` according to the existing
domain. Read the adjacent tests before changing retry or dispatch behavior.
