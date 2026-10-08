# zh-CN wording for the Issue entity

Product decision: in the Simplified Chinese UI the entity "Issue" is **not translated**. It is written
as the English word `Issue`.

## Rule

- The entity shown as Issue / Issues / sub-issue in the product is written `Issue` in
  `locales/zh-CN/*.json`: `创建 Issue`, `我的 Issue`, `子 Issue`, `共 2 个 Issue`, `Issue 已删除`, `暂无 Issue`.
- Do not use 事项，任务，议题 or 问题 for that entity.
- Put a half-width space between Chinese characters and `Issue` where they touch. No space next to
  full-width punctuation, and keep the existing space after quantifiers (`3 个 Issue`). `子 Issue` has
  no space after the preceding Chinese character (`添加子 Issue`).
- 任务 stays 任务 where it is not the Issue entity: scheduled tasks and automations (定时任务), agent
  task runs and goal plan nodes, Claude Code / Codex built-in task tools, the home task manager, and
  generic to-do items.
- 问题 stays 问题 where it means a question or a problem (error copy, feedback, FAQ, prompts).
- 事项 stays where it means a matter or an item (优先事项，待办事项).
- When the English source says "Task(s)" for what is clearly the Issues surface, the zh-CN value
  still uses `Issue`; the English wording is a separate decision.

## Where it applies

Namespaces `taskList.*`, `taskDetail.*`, `createTask.*` in `chat.json`; `myWork.*`, `teams.*`,
`savedViews.*`, `drafts.*` and the command-palette/navigation entries in `common.json`; the project
pages in `project.json`; Linear import copy in `setting.json`; Issue notifications; and the other
entries listed in the PR that introduced this document.

## English source

The English source follows the same entity decision: where it names the Issue entity on an Issues
surface, "Task(s)" is worded "Issue(s)" ("sub-task" becomes "sub-issue", "a task" becomes "an issue").
Only values change in `packages/locales/src/default/*.ts` (mirrored in `locales/en-US/*.json`); i18n
keys, identifiers, routes and tool/API names keep their `task` names. Scheduled tasks, goal nodes,
agent run cards, Claude Code / Codex built-in tools, to-do lists and the task manager assistant keep
"task". The marketing description `metadata.chat.description` and the unused `viewSwitcher.task` key
are unchanged.
