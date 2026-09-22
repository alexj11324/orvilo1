# PAGE-INVENTORY — 两端页面清单（立项枚举）

用户问「其他页面也要一并处理啊，为什么你现在还不动手做其他的呢」。
**根因是我从未枚举过页面清单** —— 这正是我写进 `tasks/lessons.md` 的第一条规则
（探查的第一步是枚举），却对自己没执行。这份文件补上那一步。

来源：两端**左栏实际渲染出的链接**（`/tmp/ctl-nav.js` 实测），不是路由表猜测 ——
路由表里还有大量无 Linear 对应面的 Orvilo 自有 surface
（`memory` / `acceptance` / `apps` / `automations` / `settings` 等），它们**不在 parity 范围内**。

采于 `2026-09-22`，候选 `:9222`、参考 `:9333`，两端均 1440×900。

## A. 两端都有 → **parity 工作对象**

| #   | 页面               | 候选端 URL                     | 参考端 URL                        | 状态               |
| --- | ------------------ | ------------------------------ | --------------------------------- | ------------------ |
| 1   | Inbox              | `/ws-useragenttes/inbox`       | `/bdiverifier/inbox`（角标 32）   | 未开始             |
| 2   | My issues          | `/ws-useragenttes/my-issues`   | `/bdiverifier/my-issues/assigned` | 未开始             |
| 3   | Reviews            | `/ws-useragenttes/reviews`     | `/bdiverifier/reviews`（角标 18） | 未开始             |
| 4   | Agent              | `/ws-useragenttes/agent/inbox` | `/bdiverifier/agent`              | 未开始             |
| 5   | Projects（列表）   | `/ws-useragenttes/projects`    | `/bdiverifier/projects/all`       | 未开始             |
| 6   | Views              | `/ws-useragenttes/views`       | `/bdiverifier/views/issues`       | 未开始             |
| 7   | Project · Overview | `/project/:slug/overview`      | `/project/:id/overview`           | **进行中**（本轮） |
| 8   | Project · Activity | `/project/:slug/activity`      | `/project/:id/activity`           | 未开始             |
| 9   | Project · Issues   | `/project/:slug/tasks`         | `/project/:id/issues`             | 未开始             |

## B. 参考端有、候选端**没有对应导航项** → 需产品裁决（**不是**样式工作）

| 参考端             | URL                     | 说明                                                   |
| ------------------ | ----------------------- | ------------------------------------------------------ |
| `Drafts`（角标 2） | `/bdiverifier/drafts`   | 候选端左栏无此项                                       |
| `Home`             | `/team/ORV/overview`    | 候选端 teams 组下无 Home                               |
| `Triage`           | `/team/ORV/triage`      | 候选端无                                               |
| team `Issues`      | `/team/ORV/all`         | 候选端有 `/my-issues`，但是不同语义（Linear 两者并存） |
| `Initiatives`      | `/settings/initiatives` | 候选端无                                               |
| `Cycles`           | （Linear nav「Try」组） | 候选端无                                               |

**这些不是「漏画了控件」，是整页功能缺席。** left-join 口径要求「Linear 有的我们要有」，
但补齐它们等于**新功能开发**（各自需要领域模型、路由、权限），不属于本轮样式对齐。
**必须交用户裁决**，不能自行开建。已记为待裁决项。

## C. 候选端有、参考端没有 → 按 left-join 需核查

| 候选端                                     | 是否属 parity 面                                    |
| ------------------------------------------ | --------------------------------------------------- |
| `Members` `/members`                       | 待核：Linear 有成员管理，但在 settings 下而非主 nav |
| `Teams` `/teams`                           | 参考端有 teams 组，但入口形态不同                   |
| 底部 `DevDock`、Electron 标签条、`AG` 头像 | **否** —— 开发 / 宿主 chrome，非产品 UI             |

## 用户裁决（2026-09-22）

**B 组：**

| 参考端项      | 裁决               |
| ------------- | ------------------ |
| `Drafts`      | **要** —— 补成功能 |
| `Home`        | **要**             |
| `Triage`      | **要**             |
| team `Issues` | **要**             |
| `Initiatives` | **不要**           |
| `Cycles`      | **不要**           |
| `Triggers`    | **不要**           |

**C 组**：用户要求**移除**候选端多出的导航项（`Members` / `Teams`）。

### ⚠️ 执行前必须先补一件事：我的参考端导航枚举**是截断的**

上面那张 B 组表里出现了 `Triggers` —— 这个项**不在我原始清单里**，说明我的枚举漏了东西。
回查确认：我当时用 `head -80` 截断了输出，只看到 13 条链接里的前 12 条就当作完整清单了。

**这是我这几天反复犯的同一类错误的又一次**：
把「我看到的部分」当成「全部」，然后**基于它做删除决定**。差别只在于这次要删的是导航项，
而不是控件 —— 但错误结构一模一样。

**规则**：任何**删除类**决定，动手前必须确认枚举**未被截断**（无 `head`/`tail` 截断、
无未展开的折叠分组、无虚拟滚动未渲染项）。判据是拿到「条目总数」并逐条核对，
而不是「我看完了」。

### 已查明的候选端导航来源（供删除时定位）

- `src/features/HomeSidebar/Body/WorkspaceSection.tsx:128-130` —— workspace 组的
  `projects` / `views` / **`members`** 三行
- 「Your teams」组另有 `Teams` 条目（**定义位置待定位**）
- **注意**：`/members`、`/teams` 两个**路由与功能本身不要删** —— 用户要求移除的是
  **导航入口**。删掉入口前必须确认该功能在别处仍可达（Linear 把成员 / 团队放在 settings 下），
  否则等于把一个功能变成不可达。这一步**没有完成**，不得只看导航项消失就收工。

## 执行顺序（本轮起）

1. **先做 A 组 1–6 的 triage**（每页两端各采一次，产出「差异有多大」的一页速览），
   目的是**排序**，不是验收 —— 我此前的问题正是没排序就深挖。
2. 按 triage 结果排序，逐页走「采集 → spec → builder → 验收」，与 Project 页同一条流水线。
3. A 组 7–9 是进行中的那条线。
4. B 组交用户裁决后才动手。

## 方法论提醒（写给未来的自己）

上一轮我花了极大力气在 A7 一个页面上，是因为**用户逐条指出问题**驱动我深挖，
而不是我按清单推进。这份清单的意义就是：**进度由清单决定，不由投诉决定。**
没列进清单的页面，不等于它没问题 —— 那只是我没看。
