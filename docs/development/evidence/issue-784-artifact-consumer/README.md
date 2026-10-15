# Issue 784 artifact consumer runtime receipt

Execution acceptance source: `6ae9741a75482e2267228c945c116907142e7c28`, local Electron with backend 31784, Owner CDP 9284 and Member CDP 9285. Post-cutover preservation/retirement source: `e24075992d1c0888e3ac5db80481b06efba755b3`, same local profiles/database/storage. This is local QA evidence, not cloud deployment evidence.

The saved OpenCode Agent `agt_taIxMIVssPhE` on Owner host `b26d477ac30d6080a4a038b66cb28a80` used `opencode/mimo-v2.6-flash-free` for all native product roles. Source code reviews were independent of this QA Agent. The native artifact chain produced A=14, B=6 and C=20; C actually read both upstream documents and downloaded both stored report files. Fresh native reviewers inspected the persisted artifacts and submitted actual current-proof evidence. The requester supported file uploads through the product file API when the native implementers deferred that step; upload provenance explicitly identifies the requester.

A/B passing deliveries released C while A/B remained unfinished, and C's passing delivery released the parent while C remained unfinished. Individual and batch Checklist item acceptance were exercised through real Electron controls. One final parent Accept Delivery completed all four Issues at approximately 2026-10-15T01:40:19Z. No child final delivery was separately accepted. Cold reload preserved parent/children Done, all accepted item timestamps and nonempty current/history evidence.

Current runs: parent `0339f756-f018-4e87-a206-f6d4bd7547d5`; A `63601250-78ab-4853-a541-82422e61d44d`; B `93957ffa-5262-43ce-b5ae-8f4f345a8ec2`; C `245f0248-1f9d-4098-ae9d-8e5bc2435367`. Post-cutover readback preserved each current run and its passing review, accepted items and accepted final delivery. B's older failed run `037bb34f-a2b9-447f-aea1-9f051b69febb` remains readable with its original pending-upload failure evidence.

| Report | Uploaded file     | Pinned document       | Bytes | SHA-256                                                          |
| ------ | ----------------- | --------------------- | ----: | ---------------------------------------------------------------- |
| A      | file_2DvPaa1JwyxK | docs_Lu8p6WwZCBC6qrET |   361 | ca989a0ffe5284cbaaf366c9159882d4047ff66ebea51fe6c3761a2bd378af32 |
| B      | file_G2kROrN2YQK2 | docs_OTnPfHBlRUQme08I |   234 | 09478b497ee1a155c8c328b98382268eea164aca260ae98c8d396808ada245b6 |
| C      | file_g0bihcYksVaH | docs_YpvBE2f9GSkWy9cI |  2789 | 4a1896539b7594b3fb3f8859afbb71c1925f99d53e87cc3fac029c0471903864 |

Post-cutover actual GETs at 2026-10-15T01:51:14Z returned HTTP 200 for all three files with exactly these sizes and hashes. Their pinned documents retain full contents, file IDs and report markers. The parent summary is pinned as `docs_30ysNLGc5Q5m8nfD`; its source references use the artifact byte hashes. A prose timestamp in that generated summary confuses topic creation with completion; actual operation/database receipts provide chronology.

The original Owner private chat retains five messages including the initial ambiguous request and the clarified artifact scope. The Member cannot read that private topic (detail null, transcript 404), while the Member can read the shared completed Issues, Checklists and prior evidence. Post-cutover API checks preserved these boundaries.

Retirement probes on e240: archived Verify runs and per-run results remain readable. `verify.createRun({})` rejects HTTP 412/PRECONDITION_FAILED with the retirement message; `goal.pause` against a no-write sentinel rejects HTTP 405/METHOD_NOT_SUPPORTED before lookup/write. Real Electron sidebar and More menu contain no standalone Goal/Acceptance/Verify entry. Historical Goal graph contents were not fixture-tested in this lane; only its list read boundary was exercised.

Selected safe receipts: `6ae9-group-final-safe.json`, `6ae9-final-consumer-privacy-safe.json`, `e240-retirement-probe-safe.json`, `e240-final-consumer-privacy-safe.json`, `e240-artifact-readback-safe.json`, `e240-native-config-shape-safe.json`. Selected visually inspected images: `6ae9-group-done-cold.png`, `6ae9-parent-final-accepted-cold.png`, `6ae9-b-history-failed-verdict-postfinal-cold.png`, `e240-member-accepted-ledger.png`, `e240-retired-sidebar-menu.png`.

No repository source changes or QA commits were created by this lane. Uploads were requester-supported exact native bytes into LOCAL QA S3, not autonomous uploads or production/cloud acceptance. Cross-repository delivery, FIFO recurrence, Slack acceptance and remote CI remain pending in the wider Issue 784 task; this bundle does not claim all Issue 784 work is complete.

Temporary QA Agent config and supporting services remain available for other authorized QA; restoration requires coordination after those runs settle. Private raw prompts, tokens, signed URLs, native logs and profiles are excluded from this summary.
