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

## B/C. 导航逐条枚举（2026-09-22 重测，取代此前那张表）

**这次是按 `PAGE-INVENTORY.md` 自己立的规矩重做的**：任何删除类决定前，必须证明枚举未被截断。
判据不是「我看完了」，而是**展开全部折叠组后拿到条目总数，逐条核对**。
做法也改了：**只读结构枚举，一个点击都不发** —— 上一版用 `.click()` 找 `More`，
结果把参考端一个 tab 从 `/my-issues/assigned` 导航到了 `/views/issues`（已恢复）。
「观察」和「戳一下」是两种方法，前者可复用，后者有副作用。

### 参考端 `nav` 实测：**13 个 `<a>`，全部可见**

| #   | 文本        | href                                 | 备注    |
| --- | ----------- | ------------------------------------ | ------- |
| 1   | Inbox       | `/bdiverifier/inbox`                 | 角标 31 |
| 2   | My issues   | `/bdiverifier/my-issues/assigned`    |         |
| 3   | Reviews     | `/bdiverifier/reviews`               | 角标 18 |
| 4   | Agent       | `/bdiverifier/agent`                 |         |
| 5   | Drafts      | `/bdiverifier/drafts`                | 角标 2  |
| 6   | Projects    | `/bdiverifier/projects/all`          |         |
| 7   | Views       | `/bdiverifier/views/issues`          |         |
| 8   | Home        | `/bdiverifier/team/ORV/overview`     | team 组 |
| 9   | Triage      | `/bdiverifier/team/ORV/triage`       | team 组 |
| 10  | Issues      | `/bdiverifier/team/ORV/all`          | team 组 |
| 11  | Projects    | `/bdiverifier/team/ORV/projects/all` | team 组 |
| 12  | Views       | `/bdiverifier/team/ORV/views/issues` | team 组 |
| 13  | Initiatives | `/bdiverifier/settings/initiatives`  |         |

**参考端侧栏没有折叠手风琴。** 那两个 `aria-expanded="false"` 是头像下拉
（`Workspace Menu` / `Team menu`），不是导航分组。team 组本来就展开 —— 所以
「展开后会不会多出条目」在参考端不成立。

**两个此前记错的事实，更正：**

- **`Triggers` 不存在。** 整个 `nav` 里没有这个条目，也没有它的 href。
  用户提过这一项，但它不在参考端导航中 —— 不能拿它做删除决定。
- **`Cycles` 渲染了，但不是 `<a>`**（`childAnchors=0`），是 `Try` 分组下的非导航行。
  它占位、可见、点不动 —— 归入「不是导航项」，与 `<a>` 不并列。

未打开的行：`More`（y=310）。**我没有点它** —— 上一次点就造成了导航。
它是什么、后面有什么，**属于未量**，不得当作「没有」。

### 候选端 `nav` 实测：**8 个 `<a>`**

| #   | 文本     | 参考端对应                         | 判定         |
| --- | -------- | ---------------------------------- | ------------ |
| 1   | 收件箱   | Inbox                              | ✓            |
| 2   | 我的事项 | My issues                          | ✓            |
| 3   | 待审核   | Reviews                            | ✓            |
| 4   | 助理     | Agent                              | ✓            |
| 5   | 项目     | Projects                           | ✓            |
| 6   | 视图     | Views                              | ✓            |
| 7   | 成员     | **无**                             | ✗ 候选端多出 |
| 8   | 团队     | **无**（参考端是分组标题，非链接） | ✗ 候选端多出 |

**候选端的 team 分组是折叠的**：y 从 417 直接跳到 765，中间没有 Home/Triage/Issues/Projects/Views。
这 5 项在 `TeamsSection` 的 `TEAM_SUB_ITEMS` 里**已经存在**，只是 `sidebarExpandedKeys`
默认不含 `team:<id>`。**参考端展开，故候选端也应展开** —— 这是默认值问题，不是缺失功能。

折算后的真实差额（`builder-nav` 落地后）：

- **候选端仍将缺**：`Drafts`（用户：**要**）、`Initiatives`（用户：**不要**）
- **候选端仍将多**：`成员`、`团队`（用户：**移除导航入口**）
- **`Cycles`**：非导航行，不参与

### 执行前必须完成的一步 —— **已完成（2026-09-22）**，两个入口结论相反

判据：删导航入口前，该功能必须在**别处仍可达**，否则等于把功能变成不可达。

| 入口            | 是否有第二条路由                                                               | 判定                                                            |
| --------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 成员 `/members` | **有** —— `desktopRouter.shared.tsx:1095`，`/[workspaceSlug]/settings/members` | **✅ 可移除入口**（与 Linear 把成员放在 settings 下一致）       |
| 团队 `/teams`   | **没有** —— `desktopRouter.shared.tsx:845` 是唯一一条，无 settings 版本        | **❌ 不得移除** —— 移除会让 `/teams` 与 `/teams/:teamId` 不可达 |

### ⚠️ 并且 `团队` 这一项**不是「多出来的」** —— 上表把它记错了

参考端的对应位置是 **`orvilo`（team 行，`y=386`，`<button>`）**，其后是 Home/Triage/Issues/Projects/Views 五个子项。
候选端的 `团队`（`y=414`）**占的是同一个槽位**。

差别在**元素类型与去向**，不在有无：

|      | 参考端                           | 候选端                |
| ---- | -------------------------------- | --------------------- |
| 元素 | `<button>`，`aria-expanded` 可控 | `<a href="/teams">`   |
| 行为 | 展开 / 收起该 team 的子导航      | 跳到 Teams **列表页** |

所以正确处理是**对齐它的行为**（能展开），**不是删掉它**。
「候选端多出 `Teams`」这个判断来自只看 `<a>` 的枚举 —— 按钮不在 `<a>` 里，于是参考端那一行被漏掉了。
**这是本 session 第三次「只枚举一种元素类型 = 漏掉另一种」**（前两次：`Triggers` 不在任何 `<a>` 里、`Cycles` 渲染了但不是 `<a>`）。

**采于** `2026-09-22`，参考 `:9333`（Brave，`my-issues` tab）、候选 `:9224`，两端 `--viewport 1440x900`。
工具：`.agents/acceptance/scripts/cdp-inspect.cjs`，脚本 `/tmp/nav-structure.js`（只读）。

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
