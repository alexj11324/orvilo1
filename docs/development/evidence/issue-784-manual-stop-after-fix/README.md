# T17 generation-2 manual Stop UI acceptance after the fix

Real local Electron acceptance on backend and renderer U `e2f4f6fb56cf7448f1fe89baa0d5f0ca6245c87b` passed the affected cold UI path. This is separate from the immutable historical gen1 failure at [issue-784-manual-stop-before-fix](../issue-784-manual-stop-before-fix/README.md). It is local acceptance, not cloud deployment evidence.

The existing confirmed T16/T17 plan revision 1 was reused without editing instructions, Checklists, reviewers, assignments or the graph. Owner normally reopened only T17 to Backlog, then performed idle Start to create a genuine 600-second revision-2 timer, idle Pause, and exactly one new manual run. T16 stayed canceled and future-paused throughout. Original generation-1 canceled Topic and contract history were retained.

| Event                                      | UTC          |
| ------------------------------------------ | ------------ |
| Genuine revision-2 timer scheduled         | 06:51:24.215 |
| Real pending deadline                      | 07:01:24.215 |
| One manual generation-2 run returned       | 06:51:43.406 |
| First/only native command: exact sleep 300 | 06:53:08.212 |
| Actual UI Resume once                      | 06:55:01.982 |
| Actual UI Stop Issue once                  | 06:55:49.176 |
| Native cancel requested                    | 06:55:49.847 |
| Native cancel acknowledged                 | 06:55:50.454 |
| First cold reload after ACK                | 06:56:12.779 |
| Explicit Owner Pause receipt               | 06:59:50.411 |
| T17 truthfully End/canceled                | 06:59:52.564 |

The actual new manual dispatch was `dsp_c4WCxclcIuMd`, generation 2, requestedBy manual Owner, with no automation occurrence. Topic `tpc_7AzS55z2m2Y2` and operation `op_1792047098412_agt_taIxMIVssPhE_tpc_7AzS55z2m2Y2_Ueq2gRKF` used saved MiMo `opencode/mimo-v2.6-flash-free` on Owner's saved device. Actual ACP session was `ses_ec1ab1a6dffeDcGwO5pRpZCmRh`. First/only bash command was exact sleep300. No arithmetic/artifact/Reviewer delivery was exercised or accepted; the null reviewer remains an explicit unexercised limit.

While native execution was active, real Owner UI Paused filter included T17. UI Resume preserved the same manual operation/dispatch and original revision-2 tick, changing futurePause to false. UI Stop received actual host cancellation ACK; operation interrupted, dispatch and Topic canceled, global native count zero. Stop preserved futurePause false and the genuine pending tick.

Cold UI proof before cleanup passed: detail switch On/Active; countdown matched the original deadline; run/trigger controls showed active future scheduling, the same next occurrence (03:01 local), and no redundant Start control; cold Paused filter excluded T17 while retaining original T14; Active filter included T17. Runtime QA individually opened and visually inspected all eight included PNGs. The noncold intermediate Paused-filter screenshot with a stale open popover is excluded; the subsequent clean cold screenshot supersedes it.

Provenance distinction: after-ui-stop-safe.json uses raw read-only SQL task fields (legacy status backlog). after-ui-stop-derived-api-safe.json is a separately timed supported task.find API read at 06:56:54.844 with derived status paused. Both prove workflow in_progress, heartbeat600, generation2 and scheduler.automationPaused=false with the original tick. The unchanged legacy execution label does not determine whether future automation is enabled.

After all enabled cold proofs were captured, QA explicitly released cleanup. Owner Pause at 06:59:50.411 preceded the genuine deadline by more than 93 seconds and preserved the original tick. Only T17 received a new End/cancel write; T16 stayed canceled. Both canceled Topics, plan revision/fingerprint, sole parent-to-leaf edge, and original T14 history were preserved. The final OFF/Inactive PNG is after terminal End; it is not presented as a pre-End Paused UI proof.

Limits: exact network RPC issuance was not captured; the old zero-match observer was not rerun and Stop was not repeated to manufacture a request receipt. Native cancel ACK plus terminal operation/dispatch establish cancellation even though the stored bash tool message remains in_progress. No cloud, arithmetic artifact, full Reviewer or final delivery acceptance claim is made.

The selected safe receipts and PNGs exclude executable scripts, genuine tick tokens, credentials, JWTs, raw messages and raw native output. manifest.json hashes the final selected files; credential-scan-safe.json records the bounded text credential scan.

JSON receipts use .txt suffixes to preserve the frozen source bytes under normal repository hooks. The manifest records their original names and hashes. Root also visually inspected all eight PNGs.
