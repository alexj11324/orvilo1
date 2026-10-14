# Issue 详情页 — Linear vs Orvilo 对比（REA 证据 + 实测）

日期：2026-10-15。方法：REA 全量 bundle 静态证据 + 双端 CDP 实测。

- 参考端：Brave 副本 @ CDP `127.0.0.1:9333`，`linear.app/bdiverifier/issue/ORV-117`（已登录）
- 候选端：Electron 候选 @ CDP `127.0.0.1:9263`，`app://renderer/issue748-qa-20261012/task/T-3`（canary `c597d9d7` + hotkey parity 提交）
- 静态证据：`/tmp/rea-linear/js-full/` — `IssuePage`、`Issue`（1.79MB 主 chunk）、`IssueDetailsPaneSidebar`、`IssueDetailsComponents`

## Linear 参考结构（自上而下实测）

```
顶栏：面包屑 [项目 > ORV-ID 标题] + ★ + ··· | 右簇：link / copy-ID / PR / 头像(订阅) / 收起
主栏（x≈319, w≈791）
  标题          contenteditable div · 24px / 600
  描述          markdown · 15px / 450
  Sub-issues    折叠头 12px/500 灰 + 进度 "0/21" + 排序 + ＋
                行 = 状态点 + [优先级标号] + 标题 + agent chip + 头像
  Activity      区头 15px/600 + Unsubscribe + 头像
                ├ 历史条目：图标 + "X created/moved/added · 23d ago"（相对时间）
                ├ 评论卡片：头像 + 名字 via-source · 时间 + 正文 + 卡内"Leave a reply…"线程框
                └ 底部 "Leave a comment…" 输入框 + 📎 + 发送
右栏 Properties（x≈1170, w≈400 独立滚动）
  Properties    Status(icon+色) / Team / Priority(bars) / Assign
  Labels        chips + Add label
  Project       链接
  Related       关联 issue 行（状态点+标题）+ "Show N more"
```

静态 chunk 词汇表另证：`Blocked by / Blocking / Duplicate of / Cycle / Milestone / Due date / Estimate / Documents / Links / Pull requests and commits / Copy branch name / Copy issue ID / Subscribe / Display properties`。

## Orvilo 候选结构（`TaskDetailSections`）

```
顶栏：面包屑 [全部 Issue › T-3 标题] + 🔔 + ★ + ···
主栏
  标题          input · 20px / 600        ← Linear 24px
  ParentBar / DuplicateRelation
  描述 + 展开全部
  添加动作行     ＋子Issue ＋链接 ＋PR ＋文档   ← Linear 无此行，入口在各分区头/资源区
  TaskBlockedNotice
  TaskSubtasks   区头 + count + 折叠 + RunAll   ← 无进度比、行内无 agent chip
  TaskArtifacts（Orvilo 特有，保留）
  TaskIssueResources
  TaskActivities 区头"活动"14px/500 + 过滤chips(全部/评论/更新)
                ├ feed 条目 "· 2026/10/13"（>24h 绝对日期；Linear 恒相对）
                └ CommentInput "留下评论…"（无卡内线程回复）
右栏
  TaskProperties 属性平铺行 + ＋添加属性（reveal 模型）
                 关联以 flag 行内联（blockedBy/blocking/relates 已在 relationGroups）
  TaskProjectSection 项目
  ✗ 无 Related 专区分组、无 Labels 分组头（labels 是可选 reveal 字段）
```

## 差异清单（按可落地切片）

| #   | 差异                                                                                                     | Linear 证据                                   | 工作量                            |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------- |
| A   | **Related 专区**：Linear 右栏独立 Related 组（行 + Show more）；Orvilo 关联挤在属性 flag 行里            | 截图右栏 + `RelatedIssuesListProvider`        | 中 — 数据已有，UI 重组            |
| B   | **活动流**：Linear 统一流 + 评论卡内线程回复 + 恒相对时间；Orvilo 过滤 tabs + 绝对日期 (>24h) + 单评论框 | 底部截图                                      | 中（线程回复依赖评论模型）        |
| C   | **Sub-issues 区**：Linear 有进度 "0/21"、排序、行内状态点 /agent chip / 头像；Orvilo 仅 count            | 截图                                          | 小                                |
| D   | **顶部操作**：Linear copy-link /copy-ID/branch + 订阅头像 + 收起；Orvilo 🔔★・・・                       | 截图 + chunk `Copy branch name/Copy issue ID` | 小（`useTaskCopyActions` 已存在） |
| E   | **排版**：标题 24/600 vs 20/600；Activity 区头 15/600 vs 14/500；描述 15/450                             | 实测 computed style                           | 小                                |
| F   | **添加动作行**：Orvilo 4 chips 横排；Linear 入口分散在各分区 ＋/ 资源区                                  | 双截图                                        | 中 — 移动入口进分区头             |
| G   | **属性面板分组**：Linear Properties/Labels/Project/Related 分组头；Orvilo 平铺 + 添加属性 reveal         | 截图                                          | 中 — 加分组头，labels 提为组      |
| H   | 订阅 / 通知呈现：Linear 头像 + Unsubscribe 文字链；Orvilo 🔔 toggle                                      | 截图                                          | 小                                |

产品差异（保留，非对齐项）：`TaskArtifacts` agent 产物区、属性行里的 agent 生命周期状态（待办 / 未开始 / 待验证）、`RunAll` 子任务执行、底部状态栏 agent 询问条。

## 落地记录

| #   | 差异                  | 落地 commit | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E   | 排版                  | `5c49500e6` | 标题 input / 只读 24px/600 (`text-2xl leading-8`);"活动" 区头经 `TaskDetailSectionHeader variant="heading"` → 15px/600; 描述 15px/450 此前已在 `INSTRUCTION_CONTENT_STYLE`                                                                                                                                                                                                                                                                                                                                                                                  |
| C   | Sub-issues 区         | `c9ea862d8` | 区头 12px/500（默认 variant `text-xs`，Artifacts/Attachments 同层落地）; `done/total` chip 此前已在 trailing（分子改为与服务端 SQL 一致的 `workflowCategory='done'`, 勘误「无进度比」）; 新增 status 排序开关；行序 = 状态点→优先级→ID→标题→头像                                                                                                                                                                                                                                                                                                            |
| D+H | 顶栏操作簇 + 订阅控件 | `bc3e3b140` | 头部补 copy-link /copy-ID/copy-branch 幽灵图标（`icon-sm`，序 link→ID→branch，置于订阅控件前）；・・・Copy 子菜单保留全部命令；`IssueSubscribeToggle` 由纯图标改为 `size="sm"` text+icon ghost（Subscribe/Unsubscribe 文字 + 🔔），仍在头部行内 —— 区头右置归 Task 7                                                                                                                                                                                                                                                                                        |
| G   | 属性面板分组          | `1bc18c17d` | 右栏按 Linear 组头重组为 Properties → Labels → Project：新 `PropertyGroup` 展示件（`railSection`+`railSectionLabel`，Task 5 的 Related 组可直接插入）；Labels 组从 reveal 字段提为常显（chips / Add label 空态，picker 不再强开）；组标签落 12px/500 次级墨色紧凑层；reveal / 添加属性机制保留给 dueDate/reviewer/schedule/relations；零新增 i18n key                                                                                                                                                                                                       |
| A   | Related 专区          | `8f1afca02` | `TaskPrerequisites` → `TaskRelatedSection`：右栏末尾插 Related `PropertyGroup`（组头复用 `taskDetail.relations.relates`）；三类 kind 分组 blockedBy→blocking→relates，行 = 状态点 + ID + 标题，点击走 `taskDetailPath` 导航；`collapseRelationRows` 纯函数按全局预算 5 行折叠为 "Show N more"；单一 "+ Add relation" 菜单（mark.\* 三项，无 Duplicate—— 留在主栏）开 inline 搜索；关系字段移出 TaskProperties reveal/addableFields；Display properties 弹窗经 `TaskRelationFields showAllKinds` 仍列全部三类；新增 key 仅 `taskDetail.relations.showMore_*` |
