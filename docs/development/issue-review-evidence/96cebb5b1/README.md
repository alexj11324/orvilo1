# Issue review runtime checkpoint

The feature source was committed as
`96cebb5b1daaf8f2e4e76463b03de3046fb30b58`. The runs below exercised the
working-tree implementation before that commit; the screenshots show that
implementation, including the corrected execution-state copy. The checkout
base was `0ab1640e30a4db8f79003bdf5c8a5cac41df17a1`.

Environment: real Electron, isolated local Next backend (`31698`), real device
and Agent gateways (`31699` / `31700`), Electron CDP `9298`, and the retained
`orvilo_issue769_qa` database. Both saved OpenCode Agents used
`opencode/mimo-v2.6-flash-free` on one physical macOS device. Screenshots use the
native light appearance at 2584 × 1808 pixels. No cloud deployment is proved.

## Automatic failure, repair and pass

T-19 deliberately omitted the description's exact-reply criterion on its first
delivery. The reviewer posted a failure comment, the assignee automatically
repaired it, and a fresh reviewer session passed the corrected delivery. The
Issue moved In Progress → In Review → In Progress → In Review → Done without
human status changes or a manual retry.

- [Transcript and four distinct native sessions](automatic-loop.json)
- [Done, reviewer property and pass comment](automatic-done-light.png)

The first reviewer launch hit an OpenCode database lock. The Issue stayed In
Review; the next sweep retried it automatically. The failed launch is not
counted as a recorded verdict.

## Offline reviewer

The device disconnected after T-20's assignee started and before delivery. The
Issue entered In Review and showed a plain offline activity. Reconnect launched
the original queued reviewer operation, which passed and moved the Issue to
Done; no second reviewer operation or manual retry was created.

- [Queue identity, reconnect and verdict transcript](offline-reconnect.json)
- [In Review with offline activity](offline-review-waiting-light.png)
- [Done after reconnect](offline-reconnected-done-light.png)

Later checkpoints verify the three-failure stop, the saved-env dispatch repair,
and this same flow after removal of the inherited acceptance engine.
