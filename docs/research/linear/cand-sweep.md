# 候选端 Orvilo 六页速览（cand-sweep）

这是**排序用的 triage**，不是验收规格。目的是回答「候选端这六页里哪页一眼看过去问题最多、
最该先做」，所以每页只采：截图、版面骨架、主列与右栏区块清单、可见文本、代表元素 computed 原值、空态。

**不是**逐元素深挖，**没有**追 hover /focus/ 菜单。精读留给后续单页 deep-dive。
与参照端的逐项比对看 `ref-sweep.md`；本文件只描述候选端**自身**。

| #   | 页面      | URL（请求值）                  | 采集时实际 URL                                                         |
| --- | --------- | ------------------------------ | ---------------------------------------------------------------------- |
| 1   | Inbox     | `/ws-useragenttes/inbox`       | 同左，无重定向                                                         |
| 2   | My issues | `/ws-useragenttes/my-issues`   | 同左，无重定向                                                         |
| 3   | Reviews   | `/ws-useragenttes/reviews`     | 同左，无重定向                                                         |
| 4   | Agent     | `/ws-useragenttes/agent/inbox` | **重定向**到 `/ws-useragenttes/agent/agt_cxOmOVkEcj4t/ws-useragenttes` |
| 5   | Projects  | `/ws-useragenttes/projects`    | 同左，无重定向                                                         |
| 6   | Views     | `/ws-useragenttes/views`       | 同左，无重定向                                                         |

原始数据：`/tmp/candsweep/{1-inbox,2-myissues,3-reviews,4-agent,5-projects,6-views}.v2.json`
（含 `readiness` 就绪证据），截图 `/tmp/candsweep/shots/*.v2.png`。
同名无后缀的 `.json` 是判据较松的第一轮，两轮读数一致（见 §0），保留供比对。

---

## 0. 证据条件

| 项       | 值                                                                   |
| -------- | -------------------------------------------------------------------- |
| 候选端   | 本工作树 Electron dev（CDP `:9222`），workspace `ws-useragenttes`    |
| 视口     | `1440x900`，dpr 2                                                    |
| 主题     | 浅色                                                                 |
| 语言     | `i18nextLng=en-US`（界面 chrome 全英文）                             |
| 采集脚本 | `.agents/acceptance/scripts/cdp-inspect.cjs`（只读 evaluate + 截图） |

### 每页就绪证据（可复核「页面确实渲染了」）

采集脚本在**同一份 JSON 里**落账三条就绪证据，避免事后只能靠「我等够了」自证。
原始值见各 `*.v2.json` 的 `readiness` 字段：

| #   | 页面      | `bodyNodes` | `bodyTextLen` | `docLang` | `readyState` | `viteOverlay` | 就绪用的主体特征串         |
| --- | --------- | ----------- | ------------- | --------- | ------------ | ------------- | -------------------------- |
| 1   | Inbox     | 875         | 640           | `en-US`   | `complete`   | `null`        | `No notifications yet`     |
| 2   | My issues | 905         | 729           | `en-US`   | `complete`   | `null`        | `Nothing in this list yet` |
| 3   | Reviews   | 883         | 975           | `en-US`   | `complete`   | `null`        | `In-product approvals`     |
| 4   | Agent     | 1222        | 664           | `en-US`   | `complete`   | `null`        | `One sentence is enough`   |
| 5   | Projects  | 770         | 599           | `en-US`   | `complete`   | `null`        | `Parity Test Project`      |
| 6   | Views     | 993         | 842           | `en-US`   | `complete`   | `null`        | `All tasks`                |

`viteOverlay: null` 表示页面上**没有** Vite 的 `vite dev · N modules` 加载遮罩；
`readyState: complete` + 主体特征串命中，三者同时成立才算就绪。

**判据必须同时含「内容级」与「稳定性」两层，缺一不可**（实测各踩一次）：

- 只用**节点数** → 会被 dev chrome 满足。实测 `#root` 有子节点时正文可能只有 29 个字符
  （就一层 `vite dev · N modules`），于是采到空壳。这是本文件早期六份 JSON 全是
  `texts: 0` 的原因。
- 只用**内容级**（lang + 特征串 + 正文长度）→ 会采到「外壳已渲染、数据仍在异步加载」的中间态。
  实测 Projects 页在这一判据下 3 秒即放行，正文 510 字符、`texts: 2`，
  而稳定后是 599 字符、`texts: 15` —— 表格与搜索框当时都还没渲染。
- 所以最终判据是：`节点数 >= 400` **且** `lang === 'en-US'` **且** `正文 >= 200 字符`
  **且** 命中**页面主体**特征串（不是页标题 —— 标题在外壳渲染时就已经在了）
  **且** 连续 3 次快照完全一致。

**这里的特征串取主体而非标题，是上面第二条实测的直接后果。**

### 共用外壳（六页一致，仅记一次）

| 区域            | 几何（CSS px）                   | insp-path 锚点                                           |
| --------------- | -------------------------------- | -------------------------------------------------------- |
| TitleBar        | `0,0 1440x38`                    | `src/features/Electron/titlebar/TitleBar.tsx`            |
| TabBar          | `280,6 1092x26`，单 tab `200x26` | `src/features/Electron/titlebar/TabBar/TabItem.tsx`      |
| NAV（左导航）   | `0,38 280x842`                   | `src/features/NavPanel/components/NavPanelDraggable.tsx` |
| 主面板          | `288,46 1144x826`，`1px #e3e3e3` | `src/features/DesktopLayoutContainer/index.tsx:47`       |
| 主区内容根      | `289,47 1142x824`                | `src/routes/(main)/_layout/index.desktop.tsx:91`         |
| DevDock（底部） | y `872`，高 28                   | `src/features/DevDock/Bar.tsx`                           |

**DevDock 是 dev 工具条，不是产品 UI** —— 本文件所有统计与文本清单都已排除它，
否则它的 FPS / CPU / GPU / 内存读数会污染每一页的文本列表。

**页标题一律 14px / 500 / `rgb(8,8,8)`，位置 `y=58`**（六页一致，只有 Agent 页是 14px/600）。

### 三个采集陷阱（实测踩到，直接影响读数解释）

**陷阱 A：折叠但仍常驻渲染的右栏。** `src/features/RightPanel/index.tsx:59` 的 `aside`
在折叠态下 rect 是 `1431,47 0x824`（**宽 0**）且 `overflow: visible`，但里面的
ChatInput / Conversation 仍在 DOM 里按 407 宽布局，内容溢出到 `x=1024` 一带，
**却被主列盖住**（`document.elementFromPoint` 在其中心点命中的是主列的 `WorkSurface.tsx:237`）。
Inbox 页截图里那一整块是空白。

所以本文件的可见性判据是**两层**：先逐级查 `display` / `visibility` / `opacity`，
再用 `elementFromPoint` 做命中测试（中心点命中自己或后代才算真可见）。
只做第一层会把「看屏幕时不存在的东西」算成存在 —— Inbox 页右栏那 4 个区块、
4 条文本（`Topic`、`Ask me about your tasks`、输入框 placeholder、`DeepSeek V4 Flash`）
就是这样被误算进来的。凡标注 **`OCCLUDED`** 的都是命中测试失败的行。

**陷阱 B：渲染中间态。** 每次 `location.assign`（SPA 导航）后页面重新挂载，
节点数走 `7 → 32 → 89 → 638 → 771` 的阶梯，**中途会停留数秒**。
在阶梯中途采样会得到「看起来正常、其实少了一半」的数据 —— 实测同一页两次
`visibleInContent` 分别是 `46` 和 `138`（差 3 倍）。
所以每页都轮询到**连续 3 次快照完全一致**（且节点数 ≥ 400）才采。

**陷阱 C：文本去重会掩盖重复值。** 本文件的可见文本清单按字符串去重，
所以表格里「每一行的 Layout 都是 `List`」只会出现一次。
核对表格类页面必须逐行采（`/tmp/candsweep/table.js`），否则会把去重副作用误判成「后续行缺值」。
Views 页就是这样被我先误判、再纠正的。

### 环境事故（本次采集的实际经过，含一次误判的更正）

采集中途页面卡在 `app://renderer/ws-useragenttes?lng=zh-CN` 冷启动态（body 只有 7 个节点），
一度全部采空。**本文件最初一版诊断写的是「Vite dev server 已死」，那是错的，在此更正：**

- `lsof -nP -iTCP:8097` **从来没有任何 socket** —— 那个端口不存在，
  而候选端 renderer 真正加载的 Vite 在 **`5173`**（`pid 43000`，`curl` 一直返回 200）。
- 所以事实是「**页面**连着一个不存在的端口」，不是「dev server 死了」。
  我把「页面连的那个端口没人监听」读成了「dev server 死了」——
  **找不到的端口 ≠ 那个端口曾经存在过**。

**真因（由 team-lead 排查并修复）**：CPU 饥饿。一个 `timeout 540 bunx tsgo --noEmit` 实际跑了
**24 分钟**（540 秒是 9 分钟），因为它发的 **SIGTERM 被 `tsgo` 忽略**，而不带 `-k` 的
`timeout` **不会升级到 SIGKILL** —— 写 `timeout 540` 的人以为兜住了运行时长，实际什么都没兜住。
清掉孤儿进程后负载回落。

**本实例自身也间歇病态**：实测采集中 `pid 98080`（本实例 renderer）瞬时飙到
**142.1% / 111.7%**，同一时刻另两个实例的 renderer 在 17–27%。
这解释了「模块数 12 秒才 +1」—— 不完全是 Vite 慢。

**处置**：未重启任何服务，只对页面做了 `location.reload()`，应用即恢复。
重载把语言带成 `zh-CN`（`localStorage.i18nextLng`）。**v2 采集全程用
`?lng=en-US` 钉住**（会持久化），六页 `docLang` / `i18nextLng` 均为 `en-US`（见上表）。

> 附带观察：采集结束后 `i18nextLng` 曾再次变回 `zh-CN`，**不是本 agent 所为**
> （本 agent 只写过一次 `en-US`，且此后全程显示英文）。该窗口存在其他写入者，
> 后续在同一窗口测量需先确认 `lang`，否则文本清单会中英混杂。

### 两轮独立采集的一致性（数据可靠性的直接证据）

六页各采了两轮，判据不同、时间不同：

| 轮次 | 文件        | 就绪判据                                                        |
| ---- | ----------- | --------------------------------------------------------------- |
| v1   | `*.json`    | 节点数 ≥ 400 + 连续 3 次快照一致                                |
| v2   | `*.v2.json` | 节点数 + `lang` + 正文长度 + **主体特征串** + 连续 3 次快照一致 |

**结果：六页的 `texts` 集合与 `panels` 的 insp-path 集合在两轮之间逐条完全一致**
（`1-inbox` 4 条 / `2-myissues` 11 条 / `3-reviews` 8 条 / `4-agent` 7 条 /
`5-projects` 15 条 / `6-views` 15 条；`hitVis` 分别 52/61/61/172/56/142）。

这条比对同时回答了两个问题：v1 不是「没有判据」采出来的空数据；
v2 的严格判据也没有改变读数。**本文件的正文引用的是 v2（含就绪证据的版本）。**

---

## 1. Inbox

- **空态**：**是** —— 主列是 `No notifications yet`

### 版面骨架

| 区域       | 几何（CSS px）                     | 内容                                        |
| ---------- | ---------------------------------- | ------------------------------------------- |
| 主列       | `289,91 1142x780`                  | 页头 + 分段控件 + 空态                      |
| 主列滚容器 | `289,91 1142x780`，`overflow auto` | `WorkSurface.tsx:237`（内嵌滚动，见陷阱 C） |

主列纵向分布：

| 段         | y 范围      | 高度    | 内容                                   |
| ---------- | ----------- | ------- | -------------------------------------- |
| 页标题     | `58`        | —       | `Inbox`，14px / 500 / `rgb(8,8,8)`     |
| 分段控件行 | `99`–`137`  | 38      | `Priority` / `Other`（`role=tablist`） |
| 空态       | `142`–`352` | 210     | `No notifications yet`（居中）         |
| **空白**   | `352`–`871` | **519** | **无任何内容**                         |

### 主列区块清单

| 区块           | 几何                       | 类型     | 文本                   | insp-path                                         |
| -------------- | -------------------------- | -------- | ---------------------- | ------------------------------------------------- |
| 页标题         | `297,58`                   | 文本     | `Inbox`                | `src/features/WorkInbox/WorkInboxPage.tsx:873:11` |
| `tablist`      | `301,99 136x38`            | 标签页   | `Priority` `Other`     | `.../WorkInboxPage.tsx:602:13`                    |
| ↳ `tab` 激活   | `304,102 68x32`            | 标签页   | `Priority`（selected） | `.../WorkInboxPage.tsx:604:15`                    |
| ↳ `tab` 未激活 | `376,102 58x32`            | 标签页   | `Other`                | `.../WorkInboxPage.tsx:610:15`                    |
| 列表工具条     | `1347,106` 起 3 个 `24x24` | 图标按钮 | （无文本）             | `.../WorkInboxPage.tsx:627 / 631 / 639`           |
| 空态容器       | `289,142 1142x210`         | 空态     | `No notifications yet` | `.../WorkInboxPage.tsx:677:9`                     |
| ↳ 空态组件     | `782,190 156x114`          | 空态     | `No notifications yet` | `.../WorkInboxPage.tsx:678:11:Empty`              |

### 可见文本（真可见，按 y）

| y,x       | 文本                   | size | weight | color              | insp-path                                              |
| --------- | ---------------------- | ---- | ------ | ------------------ | ------------------------------------------------------ |
| `58,297`  | `Inbox`                | 14px | 500    | `rgb(8,8,8)`       | `src/features/WorkInbox/WorkInboxPage.tsx:873:11:Text` |
| `102,304` | `Priority`             | 13px | 500    | `rgb(34,34,34)`    | `.../WorkInboxPage.tsx:604:15:TabsTab`                 |
| `102,376` | `Other`                | 13px | 500    | `rgb(102,102,102)` | `.../WorkInboxPage.tsx:610:15:TabsTab`                 |
| `266,798` | `No notifications yet` | 14px | 400    | `rgb(153,153,153)` | `.../WorkInboxPage.tsx:678:11:Empty`                   |

### 代表元素 computed 原值

| 元素           | 几何             | size | weight | color              | radius | insp-path                                 |
| -------------- | ---------------- | ---- | ------ | ------------------ | ------ | ----------------------------------------- |
| 页标题         | `297,58`         | 14px | 500    | `rgb(8,8,8)`       | —      | `.../WorkInboxPage.tsx:873:11:Text`       |
| `tab` 激活     | `304,102 68x32`  | 13px | 500    | `rgb(34,34,34)`    | 8px    | `.../WorkInboxPage.tsx:604:15:TabsTab`    |
| `tab` 未激活   | `376,102 58x32`  | 13px | 500    | `rgb(102,102,102)` | 8px    | `.../WorkInboxPage.tsx:610:15:TabsTab`    |
| 工具条图标按钮 | `1347,106 24x24` | 12px | 500    | `rgb(153,153,153)` | 9999px | `.../WorkInboxPage.tsx:627:17:ActionIcon` |
| 空态文本       | `266,798`        | 14px | 400    | `rgb(153,153,153)` | —      | `.../WorkInboxPage.tsx:678:11:Empty`      |

**空态判定：是空态。** 因此**不能**推断「有通知时列表怎么写」—— 行高、头像、未读点、
hover 态在空态下全部不存在。

**速览结论**：一眼可见的可疑之处 —— 空态容器只占 `289,91 1142x261`，**下方 519px 是纯空白**，
空态也没撑满滚动容器；空态只有一句 `No notifications yet`，没有说明文字、没有 CTA。

---

## 2. My issues

- **空态**：**是** —— `Nothing in this list yet`

### 版面骨架

| 区域       | 几何（CSS px）                      | 内容                                 |
| ---------- | ----------------------------------- | ------------------------------------ |
| 主列外层   | `289,91 1142x780`                   | `WorkSurface.tsx:187`                |
| 主列滚容器 | `289,145 1142x726`，`overflow auto` | `WorkSurface.tsx:189`                |
| 内容块     | `289,145 1142x242`                  | `WorkSurface.tsx:190` —— 只占 242 高 |

### 主列区块清单

| 区块         | 几何                                | 类型   | 文本                       | insp-path                                        |
| ------------ | ----------------------------------- | ------ | -------------------------- | ------------------------------------------------ |
| 页标题       | `297,58`                            | 文本   | `My issues`                | `src/features/MyWork/MyWorkPage.tsx:222:11`      |
| `tab` 激活   | `308,102 80x32`                     | 标签页 | `Assigned`（selected）     | `.../MyWorkPage.tsx:273:19:TabsTab`              |
| `tab` 未激活 | `392,102 72x32`                     | 标签页 | `Created`                  | `.../MyWorkPage.tsx:273:19:TabsTab`              |
| `tab` 未激活 | `468,102 92x32`                     | 标签页 | `Subscribed`               | `.../MyWorkPage.tsx:273:19:TabsTab`              |
| `tab` 未激活 | `565,102 70x32`                     | 标签页 | `Activity`                 | `.../MyWorkPage.tsx:273:19:TabsTab`              |
| 筛选按钮     | `927,106 96x24`                     | 按钮   | `No project`               | `.../MyWorkPage.tsx:234:17:Button`               |
| 筛选按钮     | `1031,106 151x24`                   | 按钮   | `Delegated to agents`      | `.../MyWorkPage.tsx:242:17:Button`               |
| 视图切换     | `1195,105 40x26` / `1239,105 53x26` | 按钮   | `List`（选中） / `Board`   | `WorkSurface.tsx:307:11`（**无 insp-path**）     |
| 按钮         | `1305,106 110x24`                   | 按钮   | `Save as view`             | `.../MyWorkPage.tsx:262:19:Button`               |
| 空态         | `305,161 1110x210`                  | 空态   | `Nothing in this list yet` | `src/features/MyWork/WorkQueryResults.tsx:412:7` |
| ↳ 空态组件   | `774,209 172x114`                   | 空态   | `Nothing in this list yet` | `.../WorkQueryResults.tsx:437:13:Empty`          |

### 可见文本（真可见，按 y）

| y,x        | 文本                       | size | weight | color              | insp-path                                   |
| ---------- | -------------------------- | ---- | ------ | ------------------ | ------------------------------------------- |
| `58,297`   | `My issues`                | 14px | 500    | `rgb(8,8,8)`       | `src/features/MyWork/MyWorkPage.tsx:222:11` |
| `102,308`  | `Assigned`                 | 13px | 500    | `rgb(34,34,34)`    | `.../MyWorkPage.tsx:273:19:TabsTab`         |
| `102,392`  | `Created`                  | 13px | 500    | `rgb(102,102,102)` | `.../MyWorkPage.tsx:273:19:TabsTab`         |
| `102,468`  | `Subscribed`               | 13px | 500    | `rgb(102,102,102)` | `.../MyWorkPage.tsx:273:19:TabsTab`         |
| `102,565`  | `Activity`                 | 13px | 500    | `rgb(102,102,102)` | `.../MyWorkPage.tsx:273:19:TabsTab`         |
| `106,927`  | `No project`               | 12px | 500    | `rgb(8,8,8)`       | `.../MyWorkPage.tsx:234:17:Button`          |
| `106,1031` | `Delegated to agents`      | 12px | 500    | `rgb(8,8,8)`       | `.../MyWorkPage.tsx:242:17:Button`          |
| `106,1305` | `Save as view`             | 12px | 500    | `rgb(8,8,8)`       | `.../MyWorkPage.tsx:262:19:Button`          |
| `109,1205` | `List`                     | 12px | 500    | `rgb(8,8,8)`       | `WorkSurface.tsx:307:11`                    |
| `109,1249` | `Board`                    | 12px | 500    | `rgb(102,102,102)` | `WorkSurface.tsx:307:11`                    |
| `285,790`  | `Nothing in this list yet` | 14px | 400    | `rgb(153,153,153)` | `.../WorkQueryResults.tsx:437:13:Empty`     |

### 代表元素 computed 原值

| 元素         | 几何              | size | weight | color              | bg                 | radius |
| ------------ | ----------------- | ---- | ------ | ------------------ | ------------------ | ------ |
| `tab` 激活   | `308,102 80x32`   | 13px | 500    | `rgb(34,34,34)`    | —                  | 8px    |
| `tab` 未激活 | `392,102 72x32`   | 13px | 500    | `rgb(102,102,102)` | —                  | 8px    |
| 筛选按钮     | `927,106 96x24`   | 12px | 500    | `rgb(8,8,8)`       | `rgb(255,255,255)` | 6px    |
| `Delegated…` | `1031,106 151x24` | 12px | 500    | `rgb(8,8,8)`       | `rgb(255,255,255)` | 6px    |
| 视图切换     | `1195,105 40x26`  | 12px | 500    | `rgb(8,8,8)`       | —                  | 8px    |
| 空态文本     | `285,790`         | 14px | 400    | `rgb(153,153,153)` | —                  | —      |

**速览结论**：一眼可见的可疑之处 —— 页头一行挤了 **6 个控件**（4 个 tab + 2 个筛选 chip + 视图切换 + `Save as view`），
密度明显高于 Inbox / Reviews；`List` / `Board` 切换**没有 `data-insp-path`**（其余控件都有），
排查时无法用 insp 直接定位。空态同样是「一句裸标题」、无说明无 CTA。

---

## 3. Reviews

- **空态**：**是** —— 页面上有 **3 个空态**，其中 **2 个文案完全相同**

### 版面骨架

| 区域       | 几何（CSS px）                      | 内容                                             |
| ---------- | ----------------------------------- | ------------------------------------------------ |
| 主列外层   | `289,91 1142x780`                   | `WorkSurface.tsx:187`                            |
| 主列滚容器 | `289,145 1142x726`，`overflow auto` | `WorkSurface.tsx:189`                            |
| 内容块     | `289,145 1131x768`                  | `WorkSurface.tsx:190` —— **高 768 > 滚容器 726** |
| 页内容     | `305,161 1099x736`                  | `ReviewsPage.tsx:272`                            |
| 区块 1     | `305,161 1099x228`                  | `ReviewsPage.tsx:273`（`Pull requests`）         |
| 区块 2     | `305,405 1099x492`                  | `ReviewsPage.tsx:323`（`In-product approvals`）  |

### 主列区块清单

| 区块         | 几何               | 类型   | 文本                                                                                    | insp-path                                     |
| ------------ | ------------------ | ------ | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| 页标题       | `297,58`           | 文本   | `Reviews`                                                                               | `src/features/Reviews/ReviewsPage.tsx:251:11` |
| `tab` 激活   | `308,102 66x32`    | 标签页 | `For me`（selected）                                                                    | `.../ReviewsPage.tsx:263:19:TabsTab`          |
| `tab` 未激活 | `378,102 72x32`    | 标签页 | `Created`                                                                               | `.../ReviewsPage.tsx:263:19:TabsTab`          |
| 区块标题 1   | `305,161`          | 文本   | `Pull requests`                                                                         | `.../ReviewsPage.tsx:274:13:Text`             |
| 空态 1       | `305,187 1099x202` | 空态   | `Connect GitHub to review pull requests. A disconnected account is not an empty queue.` | `.../ReviewsPage.tsx:280:15:Center`           |
| ↳ 空态组件   | `560,211 590x114`  | 空态   | 同上                                                                                    | `.../ReviewsPage.tsx:281:17:Empty`            |
| ↳ CTA 按钮   | `333,792 126x32`   | 按钮   | `Connect GitHub`                                                                        | `.../ReviewsPage.tsx:282:17:Button`           |
| 区块标题 2   | `305,405`          | 文本   | `In-product approvals`                                                                  | `.../ReviewsPage.tsx:324:13:Text`             |
| 区块 2 容器  | `305,431 1099x466` | 面板   | —                                                                                       | `.../MyWork/WorkQueryResults.tsx:412:7`       |
| 子标题       | `305,431`          | 文本   | `Pull requests`（**黑色加粗，与区块标题 1 同名**）                                      | `.../WorkQueryResults.tsx:360:7`              |
| 空态 2       | `305,461 1099x210` | 空态   | `Readable GitHub or Linear review requests appear here. …`                              | `.../WorkQueryResults.tsx:363:11:Center`      |
| ↳ 空态组件   | `533,509 644x114`  | 空态   | 同上                                                                                    | `.../WorkQueryResults.tsx:364:13:Empty`       |
| **空态 3**   | `305,687 1099x210` | 空态   | **与空态 2 文案逐字相同**                                                               | `.../WorkQueryResults.tsx:436:11:Center`      |
| ↳ 空态组件   | `533,735 644x114`  | 空态   | 同上                                                                                    | `.../WorkQueryResults.tsx:437:13:Empty`       |

**空态 2 与空态 3 是两个不同的组件实例**（`WorkQueryResults.tsx:364` 与 `:437`），
但渲染出的文案、图标尺寸、几何（`1099x210`，间隔 16px）完全一致，
且**两者之间只有子标题 `Pull requests` 一处、没有第二个子标题**。
截图上表现为同一句空态说明连续出现两次。

### 可见文本（真可见，按 y）

| y,x       | 文本                                                                                                   | size | weight | color              | insp-path                                      |
| --------- | ------------------------------------------------------------------------------------------------------ | ---- | ------ | ------------------ | ---------------------------------------------- |
| `58,297`  | `Reviews`                                                                                              | 14px | 500    | `rgb(8,8,8)`       | `src/features/Reviews/ReviewsPage.tsx:251:11`  |
| `102,308` | `For me`                                                                                               | 13px | 500    | `rgb(34,34,34)`    | `.../ReviewsPage.tsx:263:19:TabsTab`           |
| `102,378` | `Created`                                                                                              | 13px | 500    | `rgb(102,102,102)` | `.../ReviewsPage.tsx:263:19:TabsTab`           |
| `161,305` | `Pull requests`                                                                                        | 14px | 500    | `rgb(153,153,153)` | `.../ReviewsPage.tsx:274:13:Text`              |
| `287,576` | `Connect GitHub to review pull requests. A disconnected account is not an empty queue.`                | 14px | 400    | `rgb(153,153,153)` | `.../ReviewsPage.tsx:281:17:Empty`             |
| `333,792` | `Connect GitHub`                                                                                       | 13px | 500    | `rgb(8,8,8)`       | `.../ReviewsPage.tsx:282:17:Button`            |
| `405,305` | `In-product approvals`                                                                                 | 14px | 500    | `rgb(153,153,153)` | `.../ReviewsPage.tsx:324:13:Text`              |
| `585,549` | `Readable GitHub or Linear review requests appear here. Tasks are not created just to fill this list.` | 14px | 400    | `rgb(153,153,153)` | `.../MyWork/WorkQueryResults.tsx:364:13:Empty` |

注：`Readable GitHub …` 在页面上出现两次，清单里只剩一条 —— 这是**去重副作用**（陷阱 C），
不是页面只渲染一次。第二次在 `y≈811`。

### 代表元素 computed 原值

| 元素         | 几何             | size | weight | color              | bg                 | radius |
| ------------ | ---------------- | ---- | ------ | ------------------ | ------------------ | ------ |
| `tab` 激活   | `308,102 66x32`  | 13px | 500    | `rgb(34,34,34)`    | —                  | 8px    |
| `tab` 未激活 | `378,102 72x32`  | 13px | 500    | `rgb(102,102,102)` | —                  | 8px    |
| 区块标题     | `305,161`        | 14px | 500    | `rgb(153,153,153)` | —                  | —      |
| CTA 按钮     | `333,792 126x32` | 13px | 500    | `rgb(8,8,8)`       | `rgb(255,255,255)` | 6px    |
| 空态说明     | `287,576`        | 14px | 400    | `rgb(153,153,153)` | —                  | —      |

**速览结论**：一眼可见的可疑之处 —— **`In-product approvals` 下同一句空态文案连续渲染了两次**
（两个独立组件实例 `WorkQueryResults.tsx:364` / `:437`，中间只夹一个子标题），这是六页里最像 bug 的一处；
其次，本页三处空态用了**三种不同规格**（`Connect GitHub` 是「标题 + 说明 + CTA」，
另两处是「图标 + 说明」，Inbox / My issues 是「图标 + 一句标题」），空态规范不统一。

---

## 4. Agent

- **URL 有重定向**：请求 `agent/inbox` → 实际 `agent/agt_cxOmOVkEcj4t/ws-useragenttes`
- **空态**：否 —— 这是 Agent 欢迎页（`AgentHome`）
- **左导航被换掉**：不再是 workspace 导航，而是 Agent 专属导航
  （`Orvilo AI` / `Start New Topic` / `Search` / `Agent Profile` / `Tasks` / `Topics`）

### 版面骨架

| 区域       | 几何（CSS px）    | 内容                                              |
| ---------- | ----------------- | ------------------------------------------------- |
| 页内容根   | `289,92 1142x779` | `routes/(main)/agent/(chat)/_layout/index.tsx:56` |
| 主列       | `289,92 770x779`  | `.../agent/(chat)/_layout/index.tsx:57`           |
| 主列拖放区 | `289,92 770x633`  | `Conversation/SplitDropZone/index.tsx:45`         |
| **右栏**   | `1059,92 372x779` | `WorkingSidebar`（`Skills` / `Documents`）        |
| 输入区     | `289,721 770x150` | `WideScreenContainer/index.tsx:44`                |

### 主列区块清单

| 区块         | 几何                              | 类型     | 文本                                          | insp-path                                                                                                |
| ------------ | --------------------------------- | -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 页标题       | `58,305`                          | 文本     | `New Topic`，14px / **600**                   | `routes/(main)/agent/features/Conversation/Header/Tags/index.tsx:74:9`                                   |
| 页头图标按钮 | `55,1267`–`1395` 共 5 个 `28x28`  | 图标按钮 | （无文本）                                    | `Header/TerminalPanelToggle`、`TopicCommentButton`、`Header/ShareButton`、`Header/WorkingPanelToggle` ×2 |
| **空块**     | `305,92 738x441`                  | 占位     | —（`children` 数 **0**）                      | `src/features/AgentHome/index.tsx:21:7`                                                                  |
| 品牌区       | `305,533 738x156`                 | 卡       | `Orvilo AI` + 一句话                          | `src/features/AgentHome/AgentInfo.tsx:58:5`                                                              |
| ↳ 品牌名     | `609,305`                         | 文本     | `Orvilo AI`，**24px / 700**                   | `src/features/AgentHome/AgentInfo.tsx:66:7:Text`                                                         |
| 输入区       | `305,721 738x106`                 | 表单     | placeholder `Ask, create, or start a task, …` | `src/features/ChatInput/Desktop/index.tsx:233:9:ChatInput`                                               |
| 底部控制条   | `838,309` / `838,392` / `837,960` | 按钮     | `Agent` / `No device` / `Manual`              | `ControlBar/ModeSelector.tsx:281`、`HeteroDeviceSwitcher.tsx:944`、`ApprovalMode.tsx:142`                |

### 右栏区块清单

| 区块           | 几何              | 类型 | 文本                                        | insp-path                                                    |
| -------------- | ----------------- | ---- | ------------------------------------------- | ------------------------------------------------------------ |
| 右栏容器       | `1059,92 372x779` | 面板 | `Skills` `Documents`                        | （无 `data-insp-path`）                                      |
| 行 `Skills`    | `1084,117 322x32` | 行   | `Skills`，12.5px / 400 / `rgb(102,102,102)` | `Conversation/WorkingSidebar/Overview/OverviewRow.tsx:115:5` |
| 行 `Documents` | `1084,149 322x32` | 行   | `Documents`，同上                           | `.../Overview/OverviewRow.tsx:115:5`                         |

**右栏 779 高，只渲染了顶部两行**（合计 64px），下方约 715px 是空白。

### 可见文本（真可见，按 y）

| y,x        | 文本        | size   | weight | color              | insp-path                                                 |
| ---------- | ----------- | ------ | ------ | ------------------ | --------------------------------------------------------- |
| `58,305`   | `New Topic` | 14px   | 600    | `rgb(8,8,8)`       | `.../Conversation/Header/Tags/index.tsx:74:9:span`        |
| `123,1117` | `Skills`    | 12.5px | 400    | `rgb(102,102,102)` | `.../WorkingSidebar/Overview/OverviewRow.tsx:131:7`       |
| `155,1117` | `Documents` | 12.5px | 400    | `rgb(102,102,102)` | `.../WorkingSidebar/Overview/OverviewRow.tsx:131:7`       |
| `609,305`  | `Orvilo AI` | 24px   | 700    | `rgb(8,8,8)`       | `src/features/AgentHome/AgentInfo.tsx:66:7:Text`          |
| `837,960`  | `Manual`    | 12px   | 500    | `rgb(8,8,8)`       | `.../ChatInput/ControlBar/ApprovalMode.tsx:142:5`         |
| `840,333`  | `Agent`     | 12px   | 400    | `rgb(102,102,102)` | `.../ChatInput/ControlBar/ModeSelector.tsx:249:7`         |
| `840,416`  | `No device` | 12px   | 400    | `rgb(102,102,102)` | `.../ChatInput/ControlBar/HeteroDeviceSwitcher.tsx:946:7` |

被遮挡文本 1 条：输入框 placeholder（`ChatInput/InputEditor/Placeholder.tsx:52`）。

### 代表元素 computed 原值

| 元素            | 几何              | size | weight | color              | bg                     | radius |
| --------------- | ----------------- | ---- | ------ | ------------------ | ---------------------- | ------ |
| 页标题          | `58,305`          | 14px | 600    | `rgb(8,8,8)`       | —                      | —      |
| 页头图标按钮    | `55,1267 28x28`   | 13px | 500    | `rgb(153,153,153)` | —                      | 6px    |
| 右栏行 `Skills` | `1084,117 322x32` | 14px | 400    | `rgb(8,8,8)`       | —                      | 8px    |
| 品牌名          | `609,305`         | 24px | 700    | `rgb(8,8,8)`       | —                      | —      |
| 输入框          | `305,721 738x106` | —    | —      | —                  | `rgb(255,255,255)`     | —      |
| 输入框边框      | —                 | —    | —      | —                  | `1px rgba(0,0,0,0.12)` | —      |
| 发送按钮        | `790,1002 32x32`  | 14px | 400    | `rgb(187,187,187)` | —                      | 36px   |
| `Manual`        | `837,960 79x24`   | 12px | 500    | `rgb(8,8,8)`       | —                      | 6px    |

**速览结论**：一眼可见的可疑之处 —— 右栏 `WorkingSidebar` 占 `372x779` 却**只渲染顶部两行**，
下方约 715px 空白；主列 `AgentHome/index.tsx:21` 是一个 **441 高、零子节点的空块**，
把品牌区一路推到 `y=533`；页头有 **5 个 28x28 图标按钮**密集排布（`x=1267..1395`），
且其中两个来自同一个组件 `WorkingPanelToggle`。本页是六页里 DOM 最重的（1205 节点，172 真可见）。

---

## 5. Projects（列表）

- **空态**：**否** —— 有 **1 行**数据

### 版面骨架

| 区域       | 几何（CSS px）                      | 内容                                 |
| ---------- | ----------------------------------- | ------------------------------------ |
| 主列外层   | `289,91 1142x780`                   | `WorkSurface.tsx:187`                |
| 主列滚容器 | `289,143 1142x728`，`overflow auto` | `WorkSurface.tsx:189`                |
| 表格内容   | `289,143 1142x104`                  | `WorkSurface.tsx:190` —— 只占 104 高 |

### 主列区块清单

| 区块   | 几何             | 类型 | 文本                                                         | insp-path                                                             |
| ------ | ---------------- | ---- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| 页标题 | `297,58`         | 文本 | `Projects`                                                   | `src/features/Projects/List/index.tsx:292:15`                         |
| 主按钮 | `1305,57 118x24` | 按钮 | `Create project`                                             | `.../Projects/List/index.tsx:294:11:Button`                           |
| 搜索框 | `339,106 170x22` | 输入 | placeholder `Search projects`                                | `.../Projects/List/index.tsx:308:13:SearchBar`                        |
| 表头行 | `y=163`          | 表头 | `Name` `Health` `Priority` `Lead` `Target` `Issues` `Status` | `.../Projects/List/index.tsx:338 / 342 / 345 / 349 / 353 / 356 / 359` |
| 数据行 | `y=197`–`217`    | 行   | 见下                                                         | `.../Projects/List/index.tsx:224` 等                                  |

**数据行逐格**（`x` 为列起点）：

| 列       | x      | 值                      | insp-path                                 |
| -------- | ------ | ----------------------- | ----------------------------------------- |
| （图标） | `317`  | 16x16 元素，无文本      | —                                         |
| Name     | `343`  | `Parity Test Project`   | `.../Projects/List/index.tsx:224:11:Text` |
| Health   | `835`  | `—`                     | `.../Projects/List/index.tsx:155:7:Text`  |
| Priority | `943`  | `High`                  | `.../Projects/List/index.tsx:229:9:Text`  |
| **Lead** | `1019` | **该 x 处没有任何元素** | —                                         |
| Target   | `1115` | `Dec 31`                | `.../Projects/List/index.tsx:235:9:Text`  |
| Issues   | `1223` | `16`                    | `.../Projects/List/index.tsx:242:9:Text`  |
| Status   | `1283` | `In Progress`           | `.../Projects/List/index.tsx:245:9:Text`  |

### 可见文本（真可见，按 y,x）

| y,x        | 文本                  | size | weight | color              | insp-path                                   |
| ---------- | --------------------- | ---- | ------ | ------------------ | ------------------------------------------- |
| `57,1305`  | `Create project`      | 12px | 500    | `rgb(248,248,248)` | `.../Projects/List/index.tsx:294:11:Button` |
| `58,297`   | `Projects`            | 14px | 500    | `rgb(8,8,8)`       | `.../Projects/List/index.tsx:292:15:Text`   |
| `163,317`  | `Name`                | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:338:17:Text`   |
| `163,835`  | `Health`              | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:342:15:Text`   |
| `163,943`  | `Priority`            | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:345:15:Text`   |
| `163,1019` | `Lead`                | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:349:17:Text`   |
| `163,1115` | `Target`              | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:353:15:Text`   |
| `163,1223` | `Issues`              | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:356:15:Text`   |
| `163,1283` | `Status`              | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:359:15:Text`   |
| `197,343`  | `Parity Test Project` | 14px | 500    | `rgb(8,8,8)`       | `.../Projects/List/index.tsx:224:11:Text`   |
| `199,835`  | `—`                   | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:155:7:Text`    |
| `199,943`  | `High`                | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:229:9:Text`    |
| `199,1115` | `Dec 31`              | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:235:9:Text`    |
| `199,1223` | `16`                  | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:242:9:Text`    |
| `199,1283` | `In Progress`         | 12px | 400    | `rgb(153,153,153)` | `.../Projects/List/index.tsx:245:9:Text`    |

### 代表元素 computed 原值

| 元素       | 几何             | size | weight | color              | bg              | radius    |
| ---------- | ---------------- | ---- | ------ | ------------------ | --------------- | --------- |
| 主按钮     | `1305,57 118x24` | 12px | 500    | `rgb(248,248,248)` | `rgb(34,34,34)` | **999px** |
| 搜索框     | `339,106 170x22` | 14px | 400    | `rgb(8,8,8)`       | —               | 0px       |
| 表头文字   | `163,317`        | 12px | 400    | `rgb(153,153,153)` | —               | —         |
| 行内项目名 | `197,343`        | 14px | 500    | `rgb(8,8,8)`       | —               | —         |
| 行内其余格 | `199,835` 等     | 12px | 400    | `rgb(153,153,153)` | —               | —         |

**速览结论**：一眼可见的可疑之处 —— **`Lead` 列有表头、数据行在该 x 处连元素都没有**
（既无值也无占位符，而同行的 `Health` 无值时渲染了 `—`），空值表示法自相矛盾；
本页表头是 12px / 400 的纯灰文字、**无背景条**，与 Views 页表头（13px / 500 + 浅灰底）不是同一套样式。

---

## 6. Views

- **空态**：**否** —— 有 **5 行**数据

### 版面骨架

| 区域       | 几何（CSS px）                      | 内容                                              |
| ---------- | ----------------------------------- | ------------------------------------------------- |
| 主列外层   | `289,91 1142x780`                   | `WorkSurface.tsx:187`                             |
| 主列滚容器 | `289,143 1142x728`，`overflow auto` | `WorkSurface.tsx:189`                             |
| 内容块     | `289,143 1142x293`                  | `WorkSurface.tsx:190`                             |
| 分组       | `305,159 1110x261`                  | `SavedViewsPage.tsx:309`（`<section>`）           |
| 表格       | `305,194 1110x226`                  | `src/components/LiteTable/index.tsx:190:11:table` |

### 主列区块清单

| 区块     | 几何               | 类型 | 文本                           | insp-path                                           |
| -------- | ------------------ | ---- | ------------------------------ | --------------------------------------------------- |
| 页标题   | `297,58`           | 文本 | `Views`                        | `src/features/SavedViews/SavedViewsPage.tsx:268:11` |
| 主按钮   | `1329,57 94x24`    | 按钮 | `New view`                     | `.../SavedViewsPage.tsx:273:11:Button`              |
| 搜索框   | `339,106 170x22`   | 输入 | placeholder `Search views`     | `.../SavedViewsPage.tsx:286:13:SearchBar`           |
| 分组标签 | `305,159`          | 文本 | `BUILT-IN · 5`，12px / **600** | `.../SavedViewsPage.tsx:310:15:div`                 |
| 表格     | `305,194 1110x226` | 表格 | 表头 + 5 行                    | `src/components/LiteTable/index.tsx:190:11:table`   |

**表格逐行**（`<table>` 真表格，逐格采集，未受去重影响）：

| 行   | 几何              | Name           | Layout        | Sharing        | Updated        |
| ---- | ----------------- | -------------- | ------------- | -------------- | -------------- |
| 表头 | `305,194 1110x36` | `Name` (th)    | `Layout` (th) | `Sharing` (th) | `Updated` (th) |
| 1    | `305,230 1110x38` | `All tasks`    | `List`        | `—`            | `9 months ago` |
| 2    | `305,268 1110x38` | `Blocked`      | `List`        | `—`            | `9 months ago` |
| 3    | `305,306 1110x38` | `In progress`  | `List`        | `—`            | `9 months ago` |
| 4    | `305,344 1110x38` | `All projects` | `List`        | `—`            | `9 months ago` |
| 5    | `305,382 1110x38` | `Review`       | `List`        | `—`            | `9 months ago` |

5 行**全部有值**，且每行末尾还有一个空 `td`（操作列）。5 行的 `Updated` 全是 `9 months ago`（同一时间戳）。

### 可见文本（真可见，按 y,x）

| y,x        | 文本           | size | weight | color              | insp-path                                      |
| ---------- | -------------- | ---- | ------ | ------------------ | ---------------------------------------------- |
| `57,1329`  | `New view`     | 12px | 500    | `rgb(248,248,248)` | `.../SavedViewsPage.tsx:273:11:Button`         |
| `58,297`   | `Views`        | 14px | 500    | `rgb(8,8,8)`       | `.../SavedViewsPage.tsx:268:11:Text`           |
| `159,305`  | `BUILT-IN · 5` | 12px | 600    | `rgb(153,153,153)` | `.../SavedViewsPage.tsx:310:15:div`            |
| `194,305`  | `Name`         | 13px | 500    | `rgb(102,102,102)` | `src/components/LiteTable/index.tsx:194:19:th` |
| `194,1007` | `Layout`       | 13px | 500    | `rgb(102,102,102)` | `src/components/LiteTable/index.tsx:194:19:th` |
| `194,1117` | `Sharing`      | 13px | 500    | `rgb(102,102,102)` | `src/components/LiteTable/index.tsx:194:19:th` |
| `194,1247` | `Updated`      | 13px | 500    | `rgb(102,102,102)` | `src/components/LiteTable/index.tsx:194:19:th` |
| `239,1035` | `List`         | 13px | 400    | `rgb(153,153,153)` | `.../SavedViewsPage.tsx:195:13:Text`           |
| `239,1125` | `—`            | 13px | 400    | `rgb(153,153,153)` | `.../SavedViewsPage.tsx:207:13:Text`           |
| `239,1255` | `9 months ago` | 13px | 400    | `rgb(153,153,153)` | `.../SavedViewsPage.tsx:218:13:Text`           |
| `240,355`  | `All tasks`    | 14px | 500    | `rgb(8,8,8)`       | `.../SavedViewsPage.tsx:180:15:span`           |
| `278,355`  | `Blocked`      | 14px | 500    | `rgb(8,8,8)`       | `.../SavedViewsPage.tsx:180:15:span`           |
| `316,355`  | `In progress`  | 14px | 500    | `rgb(8,8,8)`       | `.../SavedViewsPage.tsx:180:15:span`           |
| `354,355`  | `All projects` | 14px | 500    | `rgb(8,8,8)`       | `.../SavedViewsPage.tsx:180:15:span`           |
| `392,355`  | `Review`       | 14px | 500    | `rgb(8,8,8)`       | `.../SavedViewsPage.tsx:180:15:span`           |

注：`List` / `—` / `9 months ago` 各出现 5 次，清单里只剩一条 —— **去重副作用**（陷阱 C），
不是「后续行缺值」。已用逐行采集核对。

### 代表元素 computed 原值

| 元素     | 几何             | size | weight | color              | bg              | radius  |
| -------- | ---------------- | ---- | ------ | ------------------ | --------------- | ------- |
| 主按钮   | `1329,57 94x24`  | 12px | 500    | `rgb(248,248,248)` | `rgb(34,34,34)` | **6px** |
| 搜索框   | `339,106 170x22` | 14px | 400    | `rgb(8,8,8)`       | —               | 0px     |
| 分组标签 | `159,305`        | 12px | 600    | `rgb(153,153,153)` | —               | —       |
| 表头格   | `194,305`        | 13px | 500    | `rgb(102,102,102)` | —               | —       |
| 行名链接 | `240,355 56x22`  | 13px | 400    | `rgb(8,8,8)`       | —               | 0px     |

**速览结论**：六页里最完整的一页 —— 表格 5 行逐格齐全，无空格、无重复、无多余控件。
唯一可疑的是**与 Projects 页的横向不一致**：主按钮圆角 `6px`（Projects 是 `999px` 药丸形）、
表头 `13px/500` 带浅灰底（Projects 是 `12px/400` 无底）。

---

## 7. 跨页横向观察

这几条不是单页问题，但排序时都是「改一处要动多页」的成本项：

| #   | 观察                                                                                                                                             | 涉及页                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| 1   | **两个列表页的主按钮圆角不同**：`999px` vs `6px`                                                                                                 | Projects / Views            |
| 2   | **两个列表页的表头样式不同**：`12px/400` 无底 vs `13px/500` 浅灰底                                                                               | Projects / Views            |
| 3   | **空态规格三种**：`图标+一句标题`（Inbox、My issues）、`图标+说明+CTA`（Reviews 第一处）、`图标+说明`（Reviews 另两处）                          | Inbox / My issues / Reviews |
| 4   | **页面主标题字号**：五页 `14px/500`，Agent 页 `14px/600`                                                                                         | Agent 与其余五页            |
| 5   | **`data-insp-path` 覆盖不全**：`List`/`Board` 切换、右栏 `WorkingSidebar` 容器都没有锚点                                                         | My issues / Agent           |
| 6   | **空态页面占比 3/6**（Inbox、My issues、Reviews 全空），这六页里「有数据时长什么样」目前只有 Projects 的 1 行、Views 的 5 行、Agent 的欢迎页可见 | 全部                        |

---

## 8. 排序建议

按「一眼可见的可疑之处」的严重度与确定性排（第 1 条最该先做）：

| 序  | 页面      | 一句话理由                                                                                                             |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Reviews   | `In-product approvals` 下**同一句空态连续渲染两次**（两个独立组件实例），是六页里最像 bug 的一处；外加三处空态三种规格 |
| 2   | Projects  | **Lead 列有表头、数据行连元素都没有**，而同行 `Health` 无值用 `—` —— 空值表示法自相矛盾                                |
| 3   | Agent     | 右栏 `372x779` **只渲染顶部两行、下方 715px 空白**；`AgentHome:21` 是 `441` 高零子节点空块；页头 5 个图标按钮密集      |
| 4   | Inbox     | 空态容器只占 261 高，**下方 519px 纯空白**；空态是最简规格（无说明无 CTA）                                             |
| 5   | My issues | 页头一行挤 6 个控件；`List`/`Board` 切换**无 `data-insp-path`**；空态同样最简规格                                      |
| 6   | Views     | **六页里最完整**（表格 5 行逐格齐全、无空格无重复），仅与 Projects 存在横向不一致                                      |

**排序的两点前提，决策时必须带上**：

1. **3/6 页是空态**（Inbox、My issues、Reviews）。这三页看不见有数据时的列表行高、
   头像、未读点、hover 态，因此「页面看起来简单」不等于「实现得对」。
   真要排优先级，空态的这三页应当被视为**信息不足**，而不是**问题更少**。
2. 第 2、6 条（Projects / Views 的横向不一致）指向的其实是**同一处组件没有复用** ——
   与其按页修两次，不如先定表格与按钮的统一规格。

---

## 9. 方法与可复现

| 文件                            | 用途                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/tmp/candsweep/sweep.js`       | 主采集：两层可见性判据 + 栏位 / 面板 / 文本 /computed/ 空态 + `readiness` 证据                              |
| `/tmp/candsweep/sweep6v2.sh`    | **六页批量 v2（本文件数据源）**：钉 `?lng=en-US` → 内容级 + 稳定性双判据 → 采集 → 打印 load 与 renderer CPU |
| `/tmp/candsweep/table.js`       | 表格逐行逐格采集（绕开文本去重，陷阱 C）                                                                    |
| `/tmp/candsweep/poll.js`        | 轻量就绪快照（节点数、aside、错误边界），v1 判稳定用                                                        |
| `/tmp/candsweep/shots/*.v2.png` | 六页截图 1440x900                                                                                           |

### 交付格式：这些 `.json` 现在是**合法 JSON**（此前不是）

`cdp-inspect.cjs` 会先打印两行头，再打印 JSON：

```
target: app://renderer/ws-useragenttes/inbox
viewport: 1440x900@dpr2
{ "url": ... }
```

直接 `> out.json` 得到的文件**不是合法 JSON** —— `jq .` / `JSON.parse()` / `require()`
全部抛错（`Unexpected token 'a', "target: app"...`）。而「**解析失败**」与「**里面是空的**」
在观感上同形：读者若 catch 住解析错误并回落成空值，会得出「这六页是空的」。

> **这一处确实造成过误判**：team-lead 据此判定「六页全是空的」并要求重采。
> 他的事实断言不成立（文件是满的），但他的**读法**被格式坑了 —— 两者都要认。
> 值得记的是：我自己的每个解析调用都写着 `raw.slice(raw.indexOf('{'))`，
> **那个 `indexOf` 就是「这里有坑」的证据**，我每次读都得绕过头部，却没在交付时说明。

本目录 12 个文件（6 个 `*.v2.json` + 6 个 `*.json`）**已统一归一为合法 JSON**：
两行头变成 `header.target` / `header.viewport` 字段，正文逐字保留。
`header.viewport` 保留下来是有用的 —— 它是 **override 生效的确认**，与页面内的
`viewport`（`innerWidth/innerHeight` 实际值）是两个不同的量。

归一前后 12 个文件的 `url` / `counts` / `texts` 集合 / `panels` 集合 / `reps` 集合
**逐条完全一致**（`fingerprint.cjs` 输出 `diff` 为空），所以这是**纯格式化，不是重新采集**。
复核方式：`node /tmp/candsweep/normalize.cjs <file>`（幂等）、
`node /tmp/candsweep/fingerprint.cjs <files>`。

**采集时一律显式 `--viewport 1440x900`**，并读工具打印的那一行确认生效视口 ——
不带 `--viewport` 时工具会标 `(INHERITED…)`，说明用的是**别人残留的 override**（实测遇到过
`1291x949`），此时读数与 1440x900 下不可比。另外 `--viewport` 的 override **会残留且清不掉**
（`clearDeviceMetricsOverride` 返回成功但不恢复），所以「没传就是别人的」。

**已知未覆盖**：hover /focus/ 快捷键 / 菜单 / 弹窗；屏幕外内容（内嵌滚动，见陷阱 C）；
有数据状态下的列表与看板（3/6 页是空态）。

采完已把窗口导航回
`app://renderer/ws-useragenttes/project/parity-test-project/overview` 基线。
