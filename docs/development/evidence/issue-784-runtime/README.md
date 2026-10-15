# Issue 784 saved-Agent runtime receipts

These are recorded local product observations, with the exact tested revisions. They do not certify the assembled delivery layer, remote CI, or a cloud deployment.

The environment used real Electron 43.2.0, separate seeded Owner and Member profiles, the isolated `orvilo_issue784_qa` PostgreSQL database, local backend port 31784 and the actual Go gateway on 8784. The gateway was built unmodified at `81f26f8af942484da644921eae08371f834bfd72`. Original data and unrelated local services were preserved.

## Saved runtime and authority

On renderer/backend `0caf355dcc65cc2284573a74362d4fc0e57aa474`, a cold-loaded current Issue assignee answered the original Member's native request through the actual conversation UI. The original operation, caller, model and saved Owner host remained bound. Redis recorded the answering actor and the producer acknowledgement, and the requested proof file was created. The screenshot records the selected provider choice; the persisted receipts establish the operation and write result. This earlier round used the retained Codex QA Agent.

See [result](native-reply-after.json), [actor and acknowledgement](native-reply-actor.json), and [actual UI](native-reply-dark.png).

Agent Manage without Use could read the provider-native permission catalog on the saved device, while actual chat and automation execution returned 403. Private Agent and standalone chat reads returned null to the other actor. An offline saved host did not fall back to the Member's connected host. Removing Use while the host was offline retained an unconfirmed cancellation; retrying after actual reconnect produced a confirmed acknowledgement and interrupted the same operation.

See [catalog UI](native-catalog-light.png), [execution denied](manage-no-use-execution.json), [automation denied](manage-no-use-automation.json), [private Agent](private-agent-member-read.json), [private chat](private-chat-owner-read.json), [offline host](offline-saved-host.json), [unconfirmed stop](stop-unconfirmed.json), and [confirmed stop](stop-confirmed.json).

## Focused privacy and native-footer follow-up

On renderer/backend `6de41fbbda6d03b338e050b51be1a021b0eef4e9`, actual Session list/group/count endpoints included private and public fixtures for Owner, and only public for Member. Both fixtures were removed through the supported API. Session search returned empty for both actors and fixtures because the local BM25 path errored, so search remains unknown.

An actual native permission request had no selected option, no countdown/default-answer footer and disabled Submit. Clicking Skip without choosing a permission produced the actual producer acknowledgement and left the requested file absent. This receipt covers cancellation of the request; the operation settled done.

See [Session privacy](session-api-privacy.json), [footer state](native-footer-dom.json), and [producer acknowledgement](native-cancel-ack.json).

## Native free MiMo full access

The saved OpenCode Agent ran `opencode/mimo-v2.6-flash-free` on its saved Owner host with `--pure` and a dedicated QA working directory. Its supported nonsecret per-process native policy advertised a real primary `full-access` mode. The native ACP mode was selected before prompt execution, and every execution stream model/provider record used free MiMo. The session's initial default model was superseded before the prompt and was not an execution fallback.

The real native write produced exactly `ISSUE784_MIMO_NATIVE_FULL_ACCESS`, 32 bytes without a newline, and completed with that response. Native trace contained zero permission requests; the product had zero intervention cards and zero permission-response events. There was no platform automatic grant or permission answer. Supported settings restored ordinary Build afterwards.

Renderer/backend were base `6de41fbbda6d03b338e050b51be1a021b0eef4e9` plus the two-file saved-provider environment patch. Its SHA256 was `07a46dcc9df202d1653a23f8ebb68c176a6e6d62d61361524516ca28a9dafe57`; the exact two-file diff committed in `8bab942713cb47d187c5fcc5329670d2711d8e35` has the same hash. The product receipt's saved Build setting was read after restoration; the native receipt records the actual full-access execution.

See [product](mimo-product.json), [native session](mimo-native.json), [exact file proof](mimo-proof.json), [stream](mimo-stream.json), [restoration](mimo-restore-build.json), and [real Electron result](mimo-full-access-dark.png).

Only selected structural JSON and visually inspected screenshots are included. Profiles, tokens, raw logs, native transports and fixture scripts remain private local diagnostics. Credential-shaped values and sensitive fields were rejected before publication.
