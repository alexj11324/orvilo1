# 参考端新采集（2026-09-23，Brave 副本 profile @ :9666，workspace BDI\_Verifier）

截图同目录 `ref-*.png`。全部只读采集（除视图 / 菜单切换这类非破坏操作）。

## 1. 侧栏完整结构（修正 PAGE-INVENTORY 的缺口）

```
BDI_Verifier(按钮) + 搜索 + 新建图标
Inbox(30) / My issues / Reviews(17) / Agent / Drafts(2)
Workspace▾ → Projects, Views, More
  More(role=button,⋯图标) → 浮层菜单: Showing all items / Members / Teams / Customize sidebar
Favorites▾（本 workspace 空）
Your teams▾ → orvilo(team 行是 button,可展开,旁有 team menu 图标)
  → Home / Triage / Issues(/team/ORV/active) / Projects / Views(/views/projects)
Try▾ → Initiatives, Cycles
左下: ? help；右下: ▷Agent 面板开关 + 头像
```

**结论修正**：候选端 `成员`/`团队` 两个 nav 项**不是多出**，对应 `More→Members/Teams`。
对齐方式 = 在 Workspace 组下加 `More` 行开同样菜单（不是删功能）。

## 2. Drafts 页（`/bdiverifier/drafts`，badge=2）

- 标题 `Drafts` + 右上删除图标
- `Comments` 分组标题
- **两列卡片网格**（不是列表）：每卡 = 状态图标 + 草稿标题 + 相对时间 (13d/4w)；
  卡内子框 `Commenting on an issue` + 父 issue 链接 `DAY123-79 ContextFocus:…`
- 卡片整卡可点跳父 issue 草稿

## 3. Projects Display options（`Add filter`/`Display options`/`Open sidebar` 图标组 @y60）

面板内容（list 态）：

- **Layout 分段: List | Board | Timeline** ← Timeline 是布局之一
- Grouping: No grouping / Ordering: Manual / Show closed projects: All（三个下拉）
- List options → **Display properties 17 个开关**: ID, Milestones, Summary, Priority,
  Status, Health, Teams, Lead, Members, Dependencies, Start date, Target date,
  Issues, Created, Updated, Completed, Labels
- 列头是可排序按钮: Name/Health/Priority/Target date/Status（Lead 不可排序）
- 底: Reset / Set default for everyone

Timeline 态的面板差异：Layout 同三选；**Timeline options**: Show project list (开)/Show week numbers (关)；
Display properties 变为: ID, Milestones, Priority, Status, Health, Lead, Members, Dependencies, Predictions；
底: Reset / Set default for everyone；另有 `Toggle layout view ⌘B` 快捷键提示。

## 4. Timeline 布局形态

月份列 (DEC 2025→JUN 2027)+ 周数字行 +`Today`/`Year` 控件 + 今天高亮列 (SEP 22 紫标)。
左侧项目列表列 (图标列: status/priority/health/lead)，右侧横条 + milestone 菱形标记
(`Gate D — Residual Disposition… +3` 折叠多个里程碑)。横向滚动条。

## 5. Projects 行内细节（新观测）

- Name 列内嵌**里程碑 chip**（菱形图标 + 里程碑名 + 日期，如 `◆ dsfgsdfg Sep 30`）
- Status 列：黄环图标 + 百分比 + 细进度条
- Lead 列：AJ 头像（有 lead 时）/ 空（无 lead 时 —— 没有占位图标！）
- Issues 列：纯数字

## 6. Filter 菜单（`Add filter` 漏斗图标）

- 顶: `Add Filter…` 输入框 + `F` 快捷键
- `AI filter`（AI 图标）/ `Advanced filter`（图标）
- 属性组（各带图标 +`▶` 二级菜单）: Status / Priority / Labels / Teams / Lead /
  Members / Creator / Health / Dates / No initiatives / Milestones / Relations /
  Template / Title & summary / Specific project
- AI filter 点击后焦点落在 `Add Filter…` 输入框（自然语言输入即 AI 模式入口）

## 7. Team nav 更正

- team Issues href 是 `/team/ORV/active`（非 `/all`）
- team Views href 是 `/team/ORV/views/projects`（默认 entity=projects）

## 8. Drafts 卡首行语义 —— 定论（DOM 取证 2026-09-23）

参考端卡标题 = **草稿自身首行 / 摘录**（span 文本 "Review local-first guarantees…"，与父 issue
DAY123-79 标题不同）；内框 `Commenting on an issue` + `DAY123-79 ContextFocus: …` issue 链接
chip。→ 候选端 `TaskDraftsPage.tsx:245` 用 `taskName` 当卡标题是**错的**：应从 editorData 提取
首段纯文本作标题，issue 标识留给内框链接 chip（同时消掉 D15）。
