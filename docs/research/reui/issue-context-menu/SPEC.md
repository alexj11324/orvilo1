# Issue context menu — functional contract

Observed 2026-09-29 in an authenticated private copied Brave profile over CDP9337. Reference: Linear Team Issues board, English/dark/populated. Private screenshots/snapshots stay under /tmp/orvilo-linear-context-reference and must not be published. Candidate: local seeded Electron, /agent-testing/tasks, My Issues and Team Issues. ReUI default component appearance is an explicit user exception to pixel fidelity.

## Root cause and owners

TaskBoardCard places ContextMenuTrigger around GeneratingBorder. The animation component drops injected onContextMenu and data props, so the actual DOM card has no menu handler. Fix at the real DOM trigger; preserve animation and drag/row interaction. List and subtasks share the same command boundary and need genuine ReUI menu primitives too. Owners: AgentTaskList/TaskBoardCard.tsx; features/AgentTaskItem.tsx; features/useTaskItemContextMenu.tsx; AgentTaskDetail/TaskSubtasks.tsx. Shared foundation: existing components/ui/context-menu and actual command renderer from NavPanel/components/SidebarDropdownMenu.

## Observed reference commands

Status; Priority; Assignee; Due date; Labels; Project; More properties; Create related; Mark as; Copy; Convert to; Make a copy; Move; Open in; Favorite; Subscribe/Unsubscribe; Remind me; Delete. Status submenu checks the current workflow state; priority includes None/Urgent/High/Medium/Low. Assignee includes unassigned plus authorized members. Labels is multi-select. Project includes No project plus authorized projects. Copy includes ID/URL/title/title as link/Markdown/git branch. Related operations distinguish parent/subissue/related/blocking directions. Hover opens submenus, Escape closes, disabled operations do not write.

## Approved implementation slice

First repair and migrate the shared DOM menu boundary for board/list/subtasks. Preserve existing Status, Priority, Assignee, copy ID/URL, permission-gated Delete and Orvilo Run/Open run. Add applicable commands backed by existing models/services: Labels, Project, Rename, copy title/title link/issue Markdown, Favorite, explicit subscribe/unsubscribe, existing dependency/parent operations and duplication where supported. Reuse existing creation/picker/dependency dialogs and persistence actions rather than adding menu-only mock controls. Extend only the smallest current shared command boundary. Keep current selection/drag/modifier-navigation behavior.

No placeholder options or fake saves. A missing model/API must be reported, not invented from the screenshot. Due date and Remind me backend expansion was explicitly approved by the user on 2026-09-29. Implement nullable date-only dueDate and a user-owned persisted reminder, with real notification delivery and edit/cancel; the backend/client API contract is a separate foundation slice before menu/picker wiring. Generic team reassignment, task-to-project/template conversion and external IDE configuration are not established capabilities and remain explicit gaps, requiring a separate scope decision before backend expansion.

## Verification

Regression must prove a real DOM contextmenu reaches the board handler before/after the fix. Scoped lint/tests; no local tsgo. Actual local Electron right-click opens populated ReUI options at the clicked card; status/priority/assignee/label/project changes persist after refresh, with permissions and disabled states retained. Copy payloads and related direction use synthetic fixture data. Delete is exercised only on an independently created disposable issue. Close and keyboard cleanup must cover ReUI menus (legacy imperative closeContextMenu alone cannot close a new controlled root).
