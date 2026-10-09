# Board card generating border follows the workflow category

The board card's generating border now requires both a running run state and an in-progress or in-review workflow category, so a stale `running` state no longer animates a card that was moved back to Todo or Backlog. Taken from `codex/issue-ui-corrections` (4b2af76e2), re-applied by hand against canary.
