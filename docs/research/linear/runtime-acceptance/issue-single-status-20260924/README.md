# Issue rail — one Status row — acceptance evidence

Surface: VYG-2 issue detail (`/ws-useragenttes/task/VYG-2`), Electron dev app, zh-CN, 1440×900 @2x.

| Revision              | Screenshot                             | Rail                                                                                                     |
| --------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| before (v6 base)      | `candidate-before-two-status-rows.png` | execution "⊙ 进行中" row plus a workflow "◐ 进行中" chip                                                 |
| `6519f0e51` (on #227) | `candidate-status-row-and-picker.png`  | one "◐ 进行中" row; its picker lists 待办 / 待处理 / 进行中 / 审核中 / 已完成 / 已取消 with board glyphs |

`status-row-probe.mjs` output at `6519f0e51`:

```
RAIL {"rows":["进行中","无优先级","负责人","标签","设置计划"],"workflowNodes":1}
TOOLTIP 执行 · 进行中
MENU 待办 / 待处理 / 进行中 / 审核中 / 已完成 / 已取消
AFTER 0 menus; state=in_progress
```

The probe opens the picker and presses Escape without choosing, so fixture data is unchanged.

Reference: Linear's issue rail has a single Status (workflow state) row. Linear screenshots stay local.
