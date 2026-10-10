# Personal settings: truthful labels and chat-era leftovers

Branch `fix/personal-settings-truthful`. Front-end only.

## Removed

| Surface        | What                                                                                                                                                                                               | Why                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stats          | Header block: agent / topic / message cards, Tokens card, message heatmap, "Nth day with Orvilo" line, workspace welcome (`headerNode`)                                                            | Chat-era counters; Tokens card was derived from the message token heatmap, not usage/cost. The Usage section is now the whole page (personal and workspace). |
| Stats services | `messageService.getHeatmaps/getTokenHeatmaps`, `userService.getUserRegistrationDuration`, `topicService.getMaxTaskDuration`, `statsKeys.{agents,topics,messages,heatmaps,welcome,maxTaskDuration}` | No remaining callers. `countAgents/countTopics/countMessages` stay (used by `features/User/DataStatistics.tsx`).                                             |
| Locale         | `heatmaps.*` and `stats.*` in the `auth` namespace                                                                                                                                                 | Unused after the above.                                                                                                                                      |
| Hotkeys        | `addUserMessage` (id, registry row, handler, editor scope plumbing, locale)                                                                                                                        | Chat-era; the Send menu entry "Add User Message" stays but no longer shows a key hint.                                                                       |
| Storage        | 导入数据 / Import Data button and its search item                                                                                                                                                  | Imports the legacy sessions/messages/topics chat format.                                                                                                     |

Old stored `hotkey.addUserMessage` bindings are tolerated: `getHotkeyById` merges stored values over the registry defaults and `getHotkeyConflicts` only counts registered ids.

## Renamed / reworded

- `openChatSettings`: "Open agent settings" / "打开 Agent 设置" (the action opens the agent's settings page).
- `desktop.quickComposer`: now describes the full-screen composer overlay (screenshots are opt-in inside it).
- `general.contextMenuMode` description: applies to messages in conversations.
- `general.fontSize` row: "Message font size" / "消息字体大小" (only message Markdown and agent welcome text read it).
- `general.isDevMode`: "Developer mode" / "开发者模式", with a description listing what it reveals.
- `chatConfig.disableGatewayMode` description: built-in Orvilo agent only. `selectRuntimeType` returns `gateway` for any heterogeneous provider before it looks at `isGatewayMode`, and `resolveExecutionTarget` treats `isHetero` as sufficient for device routing.
- zh-CN `analytics.title`: "使用分析" (was "数据统计", the same as the Stats tab).
- API Key scope groups (display strings only): agent -> "Agents, Issues & projects", chat -> "Conversations & topics", knowledge -> "Documents & knowledge". Scope ids and server enforcement are untouched.
- System tools: `opencode` added to the CLI agents list (the desktop detector already registered it).

## Left alone on purpose

- Auto-scroll: the per-agent `chatConfig.enableAutoScrollOnStreaming` is a real override. `useAutoScrollEnabled` returns the agent value when defined, otherwise the global one.
- Telemetry switch in Storage: it is shown only when About is hidden (`hideDocs`), so the two copies are never visible together; removing it would leave no telemetry control in those deployments.
- `features/DataImporter` and `services/import`: `User/UserPanel/useMenu.tsx` still imports it behind `showDataImporter`, which is always `false`. Deleting it needs that dead menu branch removed too.
- `search` hotkey: both `SessionSearchBar` and `LibrarySearchBar` bind it, so it is not dead.
- `mcp:*` and `model` groups keep their names; they describe their contents.

## For backend

None.
