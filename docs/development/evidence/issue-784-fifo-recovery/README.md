# Issue 784: retained first-round completion and preservation

Local backend **Q, `d21041e8ce54bb5c2e3e2ed1f29e6e01b4817ca4`**; retained Electron renderer **H, `cec4c8397ec8aa1ed0aee43a36382f3f06039b25`**. The `src` and `apps/desktop` product bytes are identical between H and Q. This receipt establishes local QA only.

All normal judgments and Reviewer execution used the saved OpenCode Agent, `opencode/mimo-v2.6-flash-free`, on Owner host `b26d477ac30d6080a4a038b66cb28a80`. Source reviews used independent coding reviewers.

## Historical failure and corrected recovery

The historical H callback replay received a successful handler acknowledgment but left the original topic running and never entered Reviewer. A legacy parked marker excluded its completion claim. Both `historical-H-*` receipts preserve this failed outcome; the acknowledgment is not a recovery pass.

On Q, one supported Resume followed by immediate Pause cleared that legacy marker. Exactly four scheduler timer fields changed. The standing delivery/proof inputs, three genuine occurrences and two queued records were preserved. A separately guarded operator replay invoked the retained real 574-character completion exactly once. It did not create another timer capture, builder run, verdict or proof. The original topic then settled, and its handoff hash matched the original output.

A fresh native Reviewer passed both current required checks and completed on a genuine ACP session. `r1-review-pass-before-human-safe.json` records the actual intermediate state: items and final delivery were still unaccepted. Later supported R1 acceptance while paused and the exact queue state are recorded by the separate FIFO lane.

The one PNG is a real Owner Electron cold reload after that acceptance. It shows paused automation, completed rows and a nonempty persisted result. The API receipts establish acceptance and queued dispatch identities.

## Preservation after the Q cutover

Cold reads preserved all seven previously accepted artifact and cross-repository Issues as Done. Stored A/B/C report GETs returned the exact original bytes and SHA-256 values, with document references and markers retained. The read-only legacy archive contained twelve runs, including all seven original archive IDs and readable results. These preservation reads invoked no retired mutation.

The final R2 cancellation and automatic R3 completion belong to the separate FIFO receipt. This bundle records the operator recovery limit explicitly; it does not claim unattended recovery of a lost callback or a cloud deployment.

All JSON files contain selected safe fields. The manifest records per-file hashes and byte counts. Callback bodies, cookies, environment values, signed URLs, raw native logs and credentials are excluded.
