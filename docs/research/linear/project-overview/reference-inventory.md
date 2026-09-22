# 参考端清单 — Linear Project Overview

**这份文件是「参考端到底长什么样」的只读测量记录**，供实现端逐条对齐。它不是实现方案，
也不含任何候选端信息。

> **追加内容**：文末 `## Loading state (skeleton)` 一节是后补的加载态采集
> （结论：参考端本页**没有骨架**）。该节自带证据条件与手法，与 §1–§5 同视口，
> 因此几何可直接互相对照。

## 0. 采集条件与证据等级

| 项          | 值                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| 参考 URL    | `https://linear.app/bdiverifier/project/<projectId>/overview`（真实 workspace，只读）                      |
| CDP         | `:9333`（Brave，已登录）                                                                                   |
| 视口        | `1440x900`，`deviceScaleFactor: 2`（**所有几何值都只在此视口下可比**）                                     |
| 日期 / 主题 | 2026-09-22，浅色主题                                                                                       |
| 采集脚本    | `.agents/acceptance/scripts/cdp-inspect.cjs`（结构 / 样式）+ 本地私有探针（hover /click 前后对比）         |
| 本地证据    | `/tmp/ref9333/shot-top.png`、`/tmp/ref9333/shot-milestones.png`、`/tmp/ref9333/shot-resting.png`（不入库） |

**脱敏声明（observed）**：参考端是真实私有 workspace。本文只保留 Linear 自身的 chrome 文案
（`Properties` / `Milestones` / `See issues` …）与几何、颜色、行为；**真实项目名、里程碑名、
成员姓名、workspace 名、UUID、外部 URL 一律替换为 `<…>` 占位**，避免把私有内容写进入库文件。
需要真实字符串才能判断的项（如里程碑名长度影响列宽）已标为 unknown 并给出测量值。

### 三层证据

本文每项尽量给三层，缺哪层就明确写缺：

1. **结构层** — tag /role/aria/ 文本 / DOM 层级
2. **样式层** — `getComputedStyle` **原值**（颜色 / 字号 / 字重 / 尺寸 / 间距）+ 几何（x/y/w/h）
3. **行为层** — `cursor` / `href` / `role` / `tabindex` / 是否有 click handler + **点击之后的去向**

SVG 一律单独采 `fill` / `stroke` 的**属性值**与 **computed 值**（图标颜色不在文本直方图里）。

### 采集时踩到、后续测量者必须避开的六个坑

| #   | 坑                                                                                                                | 判别动作                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | **零尺寸容器 ≠ 不可见**。`#root` 外套 `theme-provider-*`（`display: contents`，0×0），按 rect 剪枝会砍掉整页      | 剪枝只认 `display:none` / `visibility:hidden`；0 尺寸只跳过打印，继续下钻         |
| 2   | **0×0 包装 div 中断下钻**：`if (!visible) return` 会把子树一起吞掉                                                | 同上；用「结构隐藏」和「未绘制」两级判断                                          |
| 3   | **深度剪枝会漏内容**：本页标题距 `#mainLayoutContainer` 有 22 层                                                  | 用信号剪枝（文本 /role/aria/ 叶子），深度上限 ≥ 16                                |
| 4   | **应用左栏不在 `#mainLayoutContainer` 里**，它是 `theme-provider` 下的兄弟 `NAV`                                  | 遍历起点选 `[class^="theme-provider-"]` 或 `#root`，不要选「主内容容器」          |
| 5   | **hover-only 控件**：至少 5 处靠 hover 才出现（见 §4），祖先 `opacity:0` / 自身 `display:none`                    | 只查元素自身 style 会误报「可见」；必须做**祖先链** opacity 乘积 + hover 前后对比 |
| 6   | **CDP 鼠标位置跨调用保留**：上一轮点击留下的 hover 会污染下一轮的「静止态」读数                                   | 每次静止态测量前先把鼠标派发到中性空点（如 `(720,880)`）                          |
| 7   | **选择器会同时命中两个元素**：`header a[href$="/overview"]` 既匹配项目名链接也匹配 Overview tab（两者 href 相同） | 用 `textContent.trim() === 'Overview'` 之类**再筛一层**，不要只靠 href 后缀       |

第 7 条本轮踩了两次，两次都得到「看起来合理但其实是另一个元素」的读数（一次把 tab 行的
`gap` 测成了 `normal`，一次把祖先链走成了标题分支）。凡是「同一页有多个同 href 链接」的地方
（项目名 / Overview tab / `See issues` / `N issues · 100%`）都要显式再筛。

另有一条**时序**坑：tab 药丸的 `background-color` 在 SPA 导航后**立刻测是 `rgba(0,0,0,0)`**，
过渡结束才稳定到 `lch(93.483 0.5 282)`。在过渡中采样会把激活态测成透明 —— 采激活态必须等 ≥1.2s。

---

## 1. 页面外壳

### 1.1 布局骨架（observed）

`#root` → `DIV.theme-provider-<hash>`（`display: contents`，6 个子节点）→ 其中两个是页面根：

```
NAV                       0,0    244×900    ← 应用左栏（与应用主体同级，不是它的子节点）
DIV#mainLayoutContainer   0,0   1440×900
  └ DIV.sx-98rzlu         0,0   1440×900
      └ DIV#routeContentContainer   244,0  1196×872
          └ MAIN                    244,8  1188×856   bg lch(97.94 0.5 282)
                                                      border 0.5px solid lch(89.84 0 282)
                                                      border-radius 12px
              ├ DIV(列)  245,9 1187×855  flex column
              │   ├ HEADER   245,9 1187×88   bg lch(97.94 0.5 282)
              │   │   ├ 行1 245,9  1187×44   ← 项目名 / 图标组
              │   │   └ 行2 245,53 1187×44   ← tab 栏
              │   └ DIV(内容行) 245,96 1187×768  flex
              │       ├ 主列(滚动容器) 245,96 787×768   overflow-y auto, padding 0 48px
              │       │   └ 内容 304,96 669×2634   display:grid
              │       └ 右栏外壳   1032,96 400×768   position:relative
              │           ├ ASIDE(绝对定位) 1032,96 400×768
              │           │   └ [aria-label="Project sidebar"] 1036,96 396×768
              │           │        overflow-y auto / overflow-x hidden
              │           └ 拖拽手柄 1029,96 7×768   cursor: col-resize, absolute
```

其它两条**不显眼但存在**的绝对定位件：

- **左栏拖拽手柄** `DIV.sx-10l6tqk.sx-13vifvy.sx-1ey2m1c` `241,14 7×846`，`cursor: col-resize`
- **主列左缘 minimap** `DIV` `245,432 36×140`（`position:absolute`，`padding: 4px 24px 4px 4px`），
  内含 12 行刻度（每行 8×12，条为 `8×2` / `6×1`），激活条 `bg lch(19.588 1.25 282)`、
  其余 `bg lch(64.64 1.25 282)`

全局色：`html` bg `lch(94.44 0.5 282)`；`body` bg 透明、`color rgb(0,0,0)`、`font-size 16px`。
根上可见的 token（`getComputedStyle(document.documentElement)`，observed）：

```
--color-bg-primary       lch(97.94% 0.5 282)
--color-bg-secondary     lch(92.44% 0.5 282 / 1)
--color-text-primary     lch(9.794% 0 282 / 1)
--color-text-secondary   lch(19.588% 1.25 282 / 1)
--color-border-primary   lch(95.24% 0 282 / 1)
--font-regular           "Inter Variable", "SF Pro Display", -apple-system, …
```

> **inferred**：这些变量名是 Linear 的，值取自 `getComputedStyle`，**不保证**它们就是
> 组件实际引用的那一个 token（同值不同名的可能未排除）。

### 1.2 左栏 `NAV`（observed）

`244×900`，`display:flex; flex-direction:column`，bg 透明（露出 `html` 的 `lch(94.44 0.5 282)`），
无 `aria-label`、无 `role`。

```
NAV 0,0 244×900
 └ DIV(display:contents)
     ├ 顶部区 0,0 244×52
     │   ├ BUTTON[aria="<workspace> Workspace Menu"]  12,16 121×28  radius 10px  color lch(18.888 1.25 282)
     │   │   ├ 头像方块 20×20  radius 8px  bg lch(55 60 250)  color rgb(255,255,255)  11px
     │   │   ├ SPAN(workspace 名) 13px / 550
     │   │   └ svg 8×8（chevron）
     │   ├ BUTTON[aria="Search workspace"]  172,16 28×28  radius 9999px
     │   └ BUTTON[aria="Create new issue"]  204,16 28×28  radius 9999px  bg lch(97.94 0.5 282)
     └ 主体 0,47 244×852  radius 8px
         ├ 导航组 12,60 220×288
         │   └ 5 条：A.sx-6s0dn4.sx-1i9j6mr.sx-vijh9v  12,(61|90|119|148|177) 220×28  radius 8px
         │       href 依次 /<ws>/inbox, /<ws>/my-issues/assigned, /<ws>/reviews, /<ws>/agent, /<ws>/drafts
         │       每条外层还套一个 DIV[role="button"] 220×28（同一个矩形上两层可点语义）
         ├ 分组「Workspace」BUTTON 17,222 215×28（SPAN 12px/500 lch(37.776 1.25 282) + svg 16×16）
         │   ├ DIV[role=button] "Projects" 12,252 220×28
         │   ├ DIV[role=button] "Views"    12,281 220×28
         │   └ DIV[role=button][aria="Show more links"]  12,311 220×28  radius 8px（文本 "More" 13px/500）
         ├ 分组「Your teams」BUTTON 17,356 189×28
         │   └ LI[role=button] 12,386 220×174  → 组内 6 条链接（Home/Triage/Issues/Projects/Views/…）
         ├ 分组「Try」BUTTON 17,577 215×28
         │   ├ A "Initiatives" 12,607 220×28  href /<ws>/settings/initiatives
         │   └ SPAN "Cycles" 12,637 220×28（带 disabled 提示 aria）
         └ 底部 BUTTON(帮助) + 右下角幽灵件
```

**行为层（observed）**：所有导航项 `cursor: default`（**不是 `pointer`**），即使 `tagName === 'A'`。
`getEventListeners` 在这些元素上返回 `{}` —— 但 React 17+ 把监听挂在 root，
**`{}` 不能证明「没有 handler」**，只有非空结果才有信息量（见 §4.1）。

**unknown**：折叠态左栏（宽 0 / 覆盖式）未观测。`header button[aria-label="Menu"]` 虽然占着
`253,16 28×28` 的矩形，但其父容器 `visibility: hidden`（实测 `parentVisibility === "hidden"`），
**静止时不可见** → 推测为「左栏已展开时隐藏的收起控件」，未点击确认。

### 1.3 头部・项目名行（observed）

行容器 `245,9 1187×44`，`padding-left 8px`（内容从 253 起）。头部 bg 与 MAIN 相同 `lch(97.94 0.5 282)`，
**无 border-bottom**（`border-bottom: 0px none`）。

| 元素                   | tag      | 几何          | 样式原值                                                                                             | 可点性                                                             |
| ---------------------- | -------- | ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 项目名链接             | `A`      | 259,16 331×28 | `radius 6px`, `padding 2px 4px`, `cursor: default`, `text-decoration none`                           | `href = /<ws>/project/<projectId>/overview`                        |
| └ `H2`（真正的文字层） | `H2`     | 263,18 323×24 | `13px / 500`, `line-height normal`, `color lch(19.588 1.25 282)`                                     | 继承父级                                                           |
| └ 项目图标 `svg`       | `svg`    | 263,22 16×16  | **属性** `fill="#95a2b3"`；computed `fill rgb(149,162,179)`, `stroke none`, `viewBox 0 0 16 16`      | —                                                                  |
| 收藏                   | `BUTTON` | 594,16 28×28  | `role="switch"`, `aria-label="Add to favorites"`, `radius 9999px`, `padding 0 2px`, `bg transparent` | `cursor: default`；svg 14×14 属性 `fill lch(39.176% 1.25 282 / 1)` |
| 项目操作               | `BUTTON` | 626,16 28×28  | `aria-label="Project actions"`，同上外观                                                             | `cursor: default`；svg 14×14 同上                                  |
| 复制页面 URL           | `BUTTON` | 1361,16 28×28 | `aria-label="Copy page URL"`                                                                         | `cursor: default`                                                  |
| 通知设置               | `BUTTON` | 1393,16 28×28 | `aria-label="Setup project notifications"`                                                           | `cursor: default`                                                  |
| （隐藏）左栏收起       | `BUTTON` | 253,16 28×28  | `aria-label="Menu"`，父容器 `visibility: hidden`                                                     | **静止不可见**，未点击                                             |

图标按钮统一：`width/height 28px`, `border-radius 9999px`, `padding 0 2px`, `bg rgba(0,0,0,0)`,
`color lch(19.588 1.25 282)`，内部 `SPAN` 14×14 包住 `svg 14×14`。
**注意**：`Share`（分享 / 复制链接）与 `Notifications` 都在**右侧** x=1361/1393，
左侧只有收藏与 `⋯`；左右分组之间是 `flex-grow` 撑开的空白（见截图）。

### 1.4 头部・tab 栏（observed）

行 `245,53 1187×44`。药丸容器 `DIV.sx-1n2onr6.sx-78zum5.sx-6s0dn4.sx-1jnr06f` `253,53 1134×44`，
`display: flex; gap: 4px`，4 个子节点（3 个 tab + `＋`），子节点几何依次 `253/75`、`332/65`、
`401/58`、`462/28`。四个 `A` 外层各包一个 `DIV`（同尺寸）。
**全部 `cursor: default`**，`role` / `aria-selected` / `aria-current` / `tabindex` **全为 null**
—— 当前 tab **没有 ARIA 标记**，只能靠 `background-color` 区分。

| tab          | 几何         | `href`                        | 激活态（等过渡结束）                               | 非激活态                                                                        |
| ------------ | ------------ | ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Overview     | 253,60 75×28 | `…/<projectId>/overview`      | bg `lch(93.483 0.5 282)`, color `lch(9.794 0 282)` | bg `lch(99.997 0.5 282)`, color `lch(39.176 1.25 282)`                          |
| Activity     | 332,60 65×28 | `…/<projectId>/activity`      | 同上                                               | 同上                                                                            |
| Issues       | 401,60 58×28 | `…/<projectId>/issues`        | 同上                                               | 同上                                                                            |
| ＋（新视图） | 462,60 28×28 | `BUTTON[aria="Add new view"]` | —                                                  | svg 14×14 属性 `fill lch(64.64% 1.25 282 / 1)` → computed `lch(64.64 1.25 282)` |

药丸样式（三个 tab 相同）：`display inline-flex`, `align-items center`, `height 28px`,
`padding 0 10px`, `border-radius 9999px`, `font-size 12px`, `font-weight 500`,
`text-decoration none`；内部文字 `DIV` 高 15。
**相邻间距 4px，机制是容器的 `gap: 4px`**（不是 margin）；验算 75+4=79 → 253+79=332 ✓。
右侧另有 `BUTTON[aria="Close project details"]` `1393,60 28×28`（`bg lch(94.854 0.157 282)`），
与 tab 行同一 y。

> **unknown**：第四个位置那个 `⎇` 形状的图标按钮（截图 tab 行最右、`＋` 之后）未单独量到
> 独立 selector；它出现在 `462,60` 的 `＋` 之后，本轮未定位。

---

## 2. 主列

滚动容器 `245,96 787×768`，`overflow-y: auto`，`padding: 0 48px`。
内容列 `304,96 669×2634`，`display: grid`。**列宽 669 居中于 691 的内宽**（左右各让 11px）。
整列由 `#form-new-project`（`304,160 669×2546`，`padding-bottom 40px`）承载。

### 2.1 项目图标 / 标题 / 摘要（observed）

| 元素     | tag                                                                           | 几何           | 样式原值                                                                                                                           |
| -------- | ----------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 项目图标 | `BUTTON[aria="Choose icon"]`                                                  | 304,160 36×36  | `border-radius 6px`, `bg lch(65.998 10.678 258.939 / 0.125)`；内部 `svg 24×24` 属性 `fill="#95a2b3"` → computed `rgb(149,162,179)` |
| 标题     | `P.text-node`（在 `contenteditable="true" role="textbox"` 的 ProseMirror 里） | 304,208 669×32 | `24px / 600`, `line-height 32px`, `letter-spacing -0.16px`, `color lch(9.794 0 282)`, **`cursor: text`**                           |
| 标题外框 | `DIV.ProseMirror.editor`                                                      | 304,208 669×32 | `role="textbox"`, `contenteditable="true"`, `font-size 24px`, `line-height 38.4px`, `letter-spacing -0.1px`                        |
| 摘要     | `P.text-node`（同样在 ProseMirror 内）                                        | 304,244 669×46 | `15px / 450`, `line-height 23px`, `letter-spacing -0.1px`, `color lch(19.588 1.25 282)`, `cursor: text`                            |
| 摘要外框 | `DIV.sx-jkvuk6`                                                               | 304,240 669×54 | `padding 4px 0`                                                                                                                    |

标题与摘要是**可编辑的**（`contenteditable="true"`，`role="textbox"`，`cursor: text`）
—— 与只读的排版元素是两套东西，实现时不能当成静态文本。

### 2.2 `Properties` 内联行（observed）— 回答「标签与各属性的几何关系」

外层是一个 **2 列 CSS Grid**，Properties 与 Resources 共用它：

```
容器 304,310 669×96
  display: grid
  grid-template-columns: 65.4766px 587.523px     ← 第一列由内容最宽的 H3（"Resources"）决定
  gap: 12px 16px
```

| 元素              | tag                 | 几何           | 样式原值                                                                                     |
| ----------------- | ------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| `Properties` 标签 | `H3`                | 304,310 65×28  | `13px / 500`, `color lch(39.176 1.25 282)`, `padding 6px 0`, `line-height normal`            |
| 属性行            | `SECTION`           | 385,310 556×28 | `display: flex`, `align-items: center`                                                       |
| `Resources` 标签  | `H3`                | 304,350 65×56  | 同上（**盒子 56 高 = 两行链接的高度**，文字因 `padding 6px 0` 贴在顶部，与第一条链接同一行） |
| Resources 行      | `SECTION#resources` | 385,350 588×56 | `display: flex; flex-direction: column`                                                      |

**直接回答**：`Properties` 标签与属性行 **y 完全相同（都是 310），高度也相同（28）**；
x 分别是 **304** 与 **385**，差值 81 = 列宽 65.4766 + 列间距 16。因此是「同一基线的两列」，
不是上下堆叠，也不是右对齐。

属性行内 6 个 item，**间距恒定 4px**，全部 `cursor: default`：

| #   | item               | tag / role                                     | 几何                            | 文本样式                                               | 图标                                                                                                                                                                                                                                        |
| --- | ------------------ | ---------------------------------------------- | ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 状态 `In Progress` | `BUTTON`                                       | 385,310 106×28, `radius 9999px` | 文字 `13px / 500`, `color lch(19.588 1.25 282)`, x=415 | `svg 16×16` @391（6px 内缩）；`path` 属性 `stroke lch(80 90 85)`, computed `fill none`, `stroke-width 1px`；内含 `circle` 8×8                                                                                                               |
| 2   | 优先级 `High`      | `BUTTON`（外层再套 `SPAN`）                    | 495,310 65×28                   | 同上，x=525                                            | `svg 16×16` @501，`aria-label="High Priority"`，属性 `fill lch(39.176% 1.25 282 / 1)`；3 根 `rect` 3×(6/9/12)                                                                                                                               |
| 3   | Lead `Lead`        | `BUTTON`                                       | 564,310 67×28                   | 同上，x=594                                            | `svg 16×16` @570；7 个 `path`                                                                                                                                                                                                               |
| 4   | 日期组             | `DIV` 包两个 `[role="button"]`                 | 635,310 211×28                  | 文字 `13px / 500`                                      | 起点按钮 `role=button[aria="Change project start date"]` 88×28（svg 16 + 文本 x=665）；中间裸 `svg 16×16` @723（箭头）；终点 `role=button[aria="Change project target date"]` 107×28（svg 16 + 文本 x=769）。两个可点块自身 `radius 9999px` |
| 5   | Teams `<team>`     | `BUTTON`                                       | 850,310 71×28                   | 同上，x=880                                            | `svg 14×14` @858，**属性 `fill="#ff2fcd"` → computed `rgb(255,47,205)`**（本页唯一的硬编码彩色图标）                                                                                                                                        |
| 6   | `⋯`                | **`DIV`（无 role / 无 tabindex / 非 button）** | 925,310 28×28                   | —                                                      | `svg 16×16` @931，属性 `fill lch(64.64% 1.25 282 / 1)`                                                                                                                                                                                      |

**第 6 项的可点性（observed，重要）**：它不是 `<a>`、不是 `<button>`、没有 `role`、没有 `tabindex`、
`cursor: default`，hover 时**背景与内容都不变化**，也不弹 tooltip。
但 `getEventListeners(el)` 返回 **`{ click: 1 }`** —— 它是本页**唯一**被直接挂上 click 监听的
非交互标签元素（其它按钮 / 链接都返回 `{}`，因为 React 在 root 上委托）。
→ **结论：它有 click handler，是可控件，只是没有暴露任何无障碍语义。**
本轮**未点击**（不知其菜单内容，遵守只读边界），去向见 §6。

> **inferred**：`⋯` 的 28×28 与同排 `BUTTON` 的 `radius 9999px` 悬停底盘一致，推测它同样是
> 圆角悬停按钮，只是没写成 `button`。

### 2.3 `Resources` 行（observed）

`SECTION#resources` `385,350 588×56`，`display:flex; flex-direction:column`。
两条链接行 pitch 28（350 → 378），每行结构相同：

```
DIV 383,350 300×28
 └ DIV[role="button"] 383,350 300×28          ← 外层可点壳（负 2px 出血）
     └ DIV 384,351 298×26
         └ A 385,352 296×24  radius 9999px   ← 真正的链接
             ├ DIV.sx-amitd3 16×16 @391       ← 图标占位
             └ SPAN 13px / 500, color lch(19.588 1.25 282), x=411
```

| 行  | `href`                       | 几何           | `cursor`（**实测不一致**） | 额外                                                                          |
| --- | ---------------------------- | -------------- | -------------------------- | ----------------------------------------------------------------------------- |
| 1   | `/<ws>/project/<projectId2>` | 385,352 296×24 | **`default`**              | —                                                                             |
| 2   | 外部 URL（GitHub issue）     | 385,380 296×24 | **`pointer`**              | 末尾多一个 `svg 16×16` @659（外链图标，属性 `fill lch(64.64% 1.25 282 / 1)`） |

> **两行 `cursor` 不同**（内部链接 `default`、外部链接 `pointer`）是实测差异，
> 不要按「统一 pointer」或「统一 default」实现，先确认这是不是期望。

行 2 右侧另有 `BUTTON[aria="Add document or link…"]` `684,379 28×28`，`radius 9999px`，
svg 16×16 @690，属性 `fill lch(39.176% 1.25 282 / 1)`。`SECTION` 内还有一个
`DIV[status]`（`-1,-1 1×1`，屏幕阅读器 live region）。

### 2.4 update composer（observed）

```
DIV.sx-w7yly9  288,422 701×65      ← 比内容列宽 32px（左右各出血 16px）
  display: flex; align-items: center; justify-content: center
  padding: 16px
  border: 0.5px solid lch(89.84 0 282)
  border-radius: 10px
  background-color: rgba(0,0,0,0)
  └ BUTTON  538,439 200×32   border-radius 9999px   cursor: default
      ├ svg 16×16 @549   属性 fill lch(39.176% 1.25 282 / 1)  → computed lch(39.176 1.25 282)
      └ SPAN  13px / 500, color lch(39.176 1.25 282)
```

按钮文本（Linear chrome）：`Write first project update`（空态文案）。
当项目已有 update 时该区域的内容本轮**未观测**（见 §6）。

### 2.5 `Description` 折叠区（observed）

> **本轮实测：它没有被折叠** —— 高度 1438px、`max-height: none`、祖先链上无 `overflow:hidden`
> 也无 `mask-image`。所以「折叠区」的说法在本页只对应那个切换按钮，内容是全展开的。

```
DIV#project-description  288,515 701×1476   ← 左右各出血 16px，radius 12px，padding 10px 16px 0
 ├ 标题行 DIV 304,525 669×28
 │   └ DIV[role="button"]  296,525 107×28   ← 左出血 8px
 │       display:flex; align-items:center; gap:4px
 │       padding: 6px 8px; border-radius: 8px; cursor: default
 │       ├ SPAN "Description" 304,531 71×16   13px / 500, color lch(39.176 1.25 282)
 │       └ svg 16×16 @379,531  属性 fill lch(39.176% 1.25 282 / 1)
 └ 正文 304,553 669×1438
     └ DIV.ProseMirror.editor  290,553 697×1438
         role="textbox"; contenteditable="true"
         padding: 16px 14px; min-height: 110px
         font-size 15px / weight 450 / line-height 24px
         color lch(19.588 1.25 282);  cursor: text
```

正文里的 `h2`/`p` 等富文本块由 ProseMirror 生成，本轮未逐块采（不属于本轮范围）。
`Description` 切换按钮与右栏各卡头是**同一套交互模式**（`DIV[role=button]` + 文本 + chevron）。

### 2.6 主列里程碑区 `#milestone-list`（observed）— 回答「每行完整构成」

`SECTION#milestone-list` `304,2007 669×659`，`display:flex; flex-direction:column; gap:4px`。
**位于首屏之外**（滚动容器 `scrollTop` 需 ≈1866 才把它推进视口），且页面用的是**内嵌滚动容器**
（document 本身高度 = 900），所以 `captureBeyondViewport` 无效，必须滚内层。

```
SECTION#milestone-list 304,2007 669×659  gap:4px
 ├ H3 "Milestones"  304,2007 669×28   13px / 500, color lch(39.176 1.25 282), padding 6px 0
 ├ DIV(列表)        304,2039 669×587   6 个子节点 = 4 张卡 + 2 个拖拽辅助节点
 │                                      （`DIV#DndDescribedBy-<n>` 0×0、
 │                                        `DIV#DndLiveRegion-<n>[role="status"]` 1×1）
 │   ├ 卡0 304,2039 669×129
 │   ├ 卡1 304,2168 669×129
 │   ├ 卡2 304,2297 669×129
 │   └ 卡3 304,2426 669×200      ← 名称换行成两行，卡高跟着涨
 └ BUTTON "Milestone"  304,2638 95×28   radius 9999px; padding 0 8px 0 2.5px
       color lch(64.64 1.25 282)（**弱化色**，不是正文色）
       ├ svg 16×16 @306,2644  属性 fill="currentColor" → computed lch(64.64 1.25 282)
       └ SPAN 13px / 500
```

**每张卡的完整构成（卡 0 为样本，其余同构）**：

```
DIV 304,2039 669×129
 └ DIV.sx-1n2onr6.sx-2u8bby.sx-5rfsx9  669×129
     └ …3 层无类包装…
         └ DIV.sx-p9hnhx.sx-1n2onr6.sx-jbqb8w  669×129  border-radius 8px
             ├ 头行 DIV 304,2043 669×31   display:flex; align-items:center
             │   ├ A[href="…/overview#milestone-<milestoneId>"]  304,2050 22×16
             │   │   cursor: default；无 title / aria
             │   │   └ svg 16×16 @306,2050  属性 fill="none"
             │   │       └ path 10×12  @309,2052
             │   │           属性 fill  lch(42.969% 59.31 288.43)
             │   │           computed fill lch(42.969 59.31 288.43)
             │   │                    stroke lch(48 59.31 288.43)
             │   ├ DIV.sx-1iorvi4…  326,2043 216×31
             │   │   └ DIV(ProseMirror 可编辑) 330,2047 210×23
             │   │        15px / 450, color lch(19.588 1.25 282), cursor: text   ← 里程碑名，可编辑
             │   ├ DIV.sx-14ju556.sx-mzs88n…  542,2050 24×16
             │   │   └ DIV[role="button"][aria="Collapse"]  546,2050 16×16   ← 折叠正文
             │   ├ DIV.sx-78zum5.sx-1isitws.sx-kh2ocl  566,2043 159×31   ← 预留位（空）
             │   ├ ★ hover 才出现的「Set target date」
             │   │   DIV[role="button"][aria="Choose date"]  725,2044 103×28
             │   │   祖先 DIV.sx-g01cxk.sx-1oortsc.sx-im… **opacity: 0**
             │   ├ A[href="/<ws>/project/<projectId>/issues?projectMilestoneId=<milestoneId>"]
             │   │   828,2044 115×28   radius 9999px; border 0.5px solid rgba(0,0,0,0)
             │   │   文本 "N issues · 100%"  13px / 450, color lch(39.176 1.25 282)
             │   │   **静止可见**（无 opacity 0 祖先）；hover 时 bg → lch(92.44 0.5 282)
             │   └ ★ hover 才出现的 ⋯
             │       BUTTON[aria="Open menu"]  943,2044 28×28
             │       祖先 DIV.sx-14ju556.sx-78zum5.sx-l56j7k **opacity: 0**
             │       svg 14×14 @950,2051  属性 fill lch(64.64% 1.25 282 / 1)
             └ 正文 DIV.sx-b3rkr.sx-qtp20y.sx-199yv28  304,2074 669×92
                 └ … DIV（ProseMirror 可编辑）**cursor: text**，camelCase 正文
```

**卡内三个 hover-only 控件（重要）**：拖拽手柄、`Set target date`、`⋯(Open menu)`。
它们**自身**的 `opacity` 都是 `1`，隐藏写在**祖先**上（`opacity: 0`），
且拖拽手柄是 `position:absolute` 的 `20×129` 竖条（`1034` 起，向左出血），`cursor: move`。
**只查元素自身 style 会把这四个全部判成「可见可点」**。

**卡高差异（observed）**：卡 0–2 为 129（名称一行）；卡 3 为 200（名称两行 54 高的头行）。
头行高度不是常量：`31`（一行）与 `54`（两行）。

**与右栏的里程碑行不是同一套组件** —— 见 §5.2 的逐项对照。

---

## 3. 右栏

`[aria-label="Project sidebar"]` `1036,96 396×768`，`overflow-y:auto; overflow-x:hidden`，
`padding: 0`，`border-left: 0px none`。
内层内容 `385` 宽 = `clientWidth`（`offsetWidth` 是 396），差的 **11px 是滚动条**
（`overflow-y: auto` + `scrollbar-gutter: stable`，`scrollHeight 1349` vs `clientHeight 768`）。
结构是**四个 section 顺序排列**，每个 section：

```
DIV.sx-1onz0r3.sx-1y0btm7.sx-1qj378p
  display: flex; flex-direction: column
  width: 385px; padding: 12px
  background-color: lch(100 0 282)      ← 比主列更亮（主列 lch(97.94 0.5 282)）
  border-bottom: 0.5px solid lch(91.9 0 282)
```

| section | 容器几何          | 头部按钮 `aria-label`         | `aria-expanded` | 头按钮几何           | 右侧动作按钮                                   |
| ------- | ----------------- | ----------------------------- | --------------- | -------------------- | ---------------------------------------------- |
| 1       | 1036,96 385×333   | `Collapse properties section` | `true`          | 1040,103 332×28      | `BUTTON[aria="Add dependency"]` 1380,103 28×28 |
| 2       | 1036,437 385×257  | `Collapse milestones section` | `true`          | 1040,444 332×28      | `BUTTON[aria="Add milestone"]` 1380,444 28×28  |
| 3       | 1036,702 385×441  | `Collapse progress section`   | `true`          | 1040,709 **360**×28  | 无                                             |
| 4       | 1036,1151 385×286 | `Collapse activity section`   | `true`          | 1040,1158 **322**×28 | `A` "See all" 1370,1158 38×28                  |

头部按钮统一样式：`display:flex; align-items:center; height:28px; padding:0 8px;
border-radius:8px; background-color: rgba(0,0,0,0)`，`cursor: default`，几何 x=1040
（即比内容 x=1048 左出血 8px，为悬停底盘留位）。标题文字 `13px / 500`，
`color lch(40 1 282)`，chevron `svg 16×16` 紧跟文字之后（x = 文字右缘 + 4），
属性 `fill lch(40% 1 282 / 1)`。

### 3.1 右栏 `Properties` 卡（observed）— 回答「label 列与 value 列的 x 与对齐」

**行容器**：`1048,137 360×280`，`display:flex; flex-direction:column; gap: 8px; padding: 0`。
（外层还有一层 `padding: 12px 0 0` 的包装，故首行在 y=137 = 125+12。）

**8 行**，行 pitch **36**（= 行高 28 + gap 8），行自身 `display:flex; align-items:center; height:28px`：

| #   | label 文本 | label 几何     | label 样式                          | value 单元格 x / 宽 | value 形态                                                                                                                                                                                                                                  |
| --- | ---------- | -------------- | ----------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Status`   | 1048,143 36×15 | `12px / 450`, `color lch(40 1 282)` | 1138 / 101          | `BUTTON`（状态 chip）：`svg 16×16` @1144 + `SPAN` @1168 `12px / 450`, `color lch(10 0 282)`                                                                                                                                                 |
| 2   | `Priority` | 1048,179 41×15 | 同上                                | 1138 / 62           | `BUTTON`：`svg 16×16` @1144 (`role=img`, `aria="High Priority"`) + `SPAN` @1168, `color lch(20 1 282)`                                                                                                                                      |
| 3   | `Lead`     | 1048,215 28×15 | 同上                                | 1138 / 87           | `BUTTON`：icon + `SPAN` @1168 "Add lead", `color lch(40 1 282)`（**空态更灰**）                                                                                                                                                             |
| 4   | `Members`  | 1048,251 54×15 | 同上                                | 1138 / 116          | `BUTTON`：icon + `SPAN` @1168 "Add members", `color lch(40 1 282)`                                                                                                                                                                          |
| 5   | `Dates`    | 1048,287 33×15 | 同上                                | 1138 / 189          | 两个 `DIV[role="button"]`：`aria="Change project start date"` 1138,281 84×28 + 裸 `svg 16×16` @1230 + `aria="Change project target date"` 1254,281 72×28；文本 @1168 "Sep 21st" `color lch(10 0 282)`，@1284 "Target" `color lch(40 1 282)` |
| 6   | `Teams`    | 1048,323 38×15 | 同上                                | 1138 / 68           | `BUTTON`：`svg 14×14` @1146 + `SPAN` @1168 `<team>`, `color lch(20 1 282)`                                                                                                                                                                  |
| 7   | `Slack`    | 1048,359 31×15 | 同上                                | 1138 / 115          | `BUTTON`：icon + `SPAN` @1168 "Slack channel", `color lch(40 1 282)`                                                                                                                                                                        |
| 8   | `Labels`   | 1048,395 37×15 | 同上                                | 1138 / 270          | `BUTTON[aria="Add labels"]`：`svg 16×16` @1144 + `SPAN` @1166 "Add label"                                                                                                                                                                   |

**直接回答**：

- **label 列 x = 1048**（= 卡内容左缘），文本左对齐；
- **value 列 x = 1138**，即 label 列宽固定 **90px**（1048 + 90 = 1138），**无列间距**。
  已核实这是真固定宽而非巧合：label 单元格 computed `width: 90px`、`flex: 0 0 auto`、`flex-shrink: 0`
  （`DIV.…sx-efyazp.sc2sx-Flex-…`），8 行 label 文本本身宽度是 28–54px 不等，但 value 全部从 1138 起；
- 值是**左对齐**且**内容宽度自适应**（`flex-grow: 0`，`justify-content: normal`，`text-align: start`），
  **不是右对齐到卡右缘** —— 最宽的第 8 行也只有 270px，右缘停在 1408 之前；
- value 内文字统一从 **1168** 起（= 1138 + 30），即图标区固定占 30px（图标 16px 起点在 1144，即 6px 内缩）；
- 三档文字色编码语义：**已填** `lch(10 0 282)`（Status）与 `lch(20 1 282)`（Priority / Teams），
  **空态** `lch(40 1 282)`（Add lead / Add members / Target / Slack channel / Add label）。

### 3.2 右栏 `Milestones` 卡（observed）— 回答「每行还有没有别的控件」

行容器 `1038,478 380×171`，`display:flex; flex-direction:column; gap: 1px`。
**380 宽 = 卡内容 360 + 左右各出血 10px**（x 从 1038 而不是 1048）。

**4 行**（+1 行空态行），每行 **380×42**，pitch **43**（= 42 + gap 1）：

```
DIV 1038,478 380×42
 └ DIV[role="button"].sx-1n2onr6.sx-2u8bby.sx-5rfsx9  1038,478 380×42
     tabindex="-1"   无 aria-label   cursor: default
     └ DIV  → DIV
         └ DIV[role="button"].sx-vx4679.sx-1q0g3np.sx-b3r6kr  1038,478 380×42
              background-color: lch(100 0 282); border-radius: 8px; display:flex
             ├ 左组 DIV  1048,487 334×24  display:flex; align-items:center
             │   ├ svg 16×16 @1048,491     属性 fill="none"；内部 path
             │   ├ SPAN(里程碑名) @1072,491   12px / 450, color lch(20 1 282)
             │   └ 进度组 DIV  1249,487 78×24  ← **右对齐在 1327**
             │       ├ DIV → SPAN @1249,491  own="of"，其内嵌 SPAN own="100%"
             │       │   12px / 450, color lch(40 1 282)   ← 视觉读作 "100% of"
             │       └ DIV 1304,487 24×24 → DIV 1304,487 8×24
             │           └ BUTTON 1304,487 8×24  border-radius 8px
             │               └ SPAN → SPAN own="N"   12px / 450, color lch(40 1 282)
             └ ★ 右侧控件 BUTTON[aria="Milestone actions"]  1382,487 **24×24**
                 border-radius 9999px; cursor: default; **静止时可见**
                 └ SPAN 14×14 @1387,492 → svg 14×14（三点）
                      属性 fill lch(40% 1 282 / 1) → computed lch(40 1 282)
```

**直接回答（用户当场问的）**：**有**。除了名称和进度，每行右侧还有一个
`BUTTON[aria-label="Milestone actions"]`，**24×24**，圆角 9999px，在 **x=1382**（行右缘 1418 内缩 12px），
**静止状态就可见**（与主列卡片的 `⋯` 不同）。它的可点目标就是它自己（24×24 的 `BUTTON`），
点击会开菜单 —— **本轮未点**（菜单内容未知，见 §6）。

同一个 380×42 矩形上其实有**两层 `role="button"`**（外层无 aria、内层带白底），
`tabindex="-1"`。也就是说「行可点」与「行是按钮」都成立，但无障碍暴露是**两层无名字的 button**
—— 实现时不要只做一层。

另外两个 hover-only 元素：

| 元素                      | 静止态                              | hover 后                                                                                                                                             |
| ------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUTTON` "See issues"     | `display: none`，rect 0×0           | `display: flex`，**1278,468 104×24**，`border-radius 2px`，`bg lch(96.5 0 282)`，`color lch(45 70 286.91)`，`font-size 13.3333px`，`cursor: default` |
| 拖拽手柄 `DIV.sx-10l6tqk` | `opacity: 0`，rect `1034,478 20×42` | `opacity: 1`，内部 `svg` 的 `cursor: move`                                                                                                           |

**注意 `See issues` 是 `BUTTON`（不是 `<a>`）**，而主列里语义相同的那个是 `<a href>`。
点击它实测导航到 `/<ws>/project/<projectId>/issues`（`location.search` 为空）——
与点击整行的去向相同。

**第 5 行是空态占位行**（observed）：`DIV[role="button"]` `1038,650 380×42`，
`bg lch(100 0 282)`, `radius 8px`；内容为 `svg 16×16` @1048,663（属性
`fill lch(66% 1 282 / 1)` → computed `lch(66 1 282)`）+ `SPAN` "No milestone" @1072,663
（`12px / 450`, `color lch(40 1 282)`）。**没有 ⋯**。

### 3.3 右栏 `Progress` 卡（observed）

```
DIV.sx-1onz0r3… 1036,702 385×441  bg lch(100 0 282)  border-bottom 0.5px solid lch(91.9 0 282)
 └ … 头部（同 §3，aria="Collapse progress section"，宽 360）
 └ 内容 1048,731 360×400
     ├ 图例 DIV.sx-rvj5dj.sx-6s0dn4.sx-1g25fga  1048,743 360×41
     │   display: grid; gap: 0px 4px; align-items: center
     │   ├ item1  dot 6×6 @1048,753 bg lch(66 1 282)   label SPAN @1058,749 "Scope"      12px/500 lch(40 1 282)
     │   │        计数 SPAN @1060,769 "16"            12px/500 lch(10 0 282)
     │   ├ item2  dot 6×6 @1169,753 bg lch(80 90 85)   label @1179 "Started" / 计数 @1181 "0"
     │   └ item3  dot 6×6 @1291,753 bg lch(48 59.31 288.43)  label @1301 "Completed" / 计数 @1303 "16"
     ├ 图表 svg[role=img] 1048,785 360×200   （内部含 rect / g / path，未逐路径采）
     ├ 间隔 DIV 1048,994 360×12
     ├ 分段控件 DIV.sx-yorhqc 1048,1006 360×32
     │   └ DIV[role="tablist"].sx-c8icb0 1048,1006 360×32
     │       display:flex; background-color: lch(100 0 282); border-radius: 5px
     │       ├ BUTTON[role="tab"] @1050,1008 186×28  "Assignees"  aria-selected="true"
     │       │    12px / 500; color lch(10 0 282); bg lch(95.543 0 282); radius 9999px; cursor default
     │       └ BUTTON[role="tab"] @1242,1008 164×28  "Labels"     aria-selected="false"
     │            12px / 500; color lch(40 1 282); bg lch(100 0 282); radius 9999px
     └ 列表 DIV.list-columns-<hash> 1048,1046 360×85
         ├ 行 @1048,1046 360×42   DIV[role="button"]   radius 8px; bg lch(100 0 282); padding 0 10px
         └ 行 @1048,1089 360×42   同上
```

列表行内部（第 1 行 / 第 2 行样本）：

```
├ svg 20×20 @1057,1057  (第2行为头像)
├ SPAN 13px / 450, color lch(40 1 282) @1084,1059      文本 "No assignee"；第2行是成员名, color lch(10 0 282)
├ ★ SPAN "See issues"  rect 0×0（**display:none，hover 才出现**，与 §3.2 同一模式）
├ svg 16×16 @1304,1060      ← 进度环
└ SPAN 组 12px / 450, color lch(40 1 282)
     @1328,1059 own="of"，内嵌 SPAN own="100%"
     @1382,1059 own="N"（14 / 2）
```

**observed**：`Progress` 卡的列表行与 `Milestones` 卡的行**共用同一套「行 + 右侧进度 + hover 才出的
See issues」模式**，但尺寸不同（42 高、白底、`padding 0 10px`），且这里出现的是
`100% of N` 变体（不是主列的 `N issues · 100%`）。

### 3.4 右栏 `Activity` 卡（仅骨架，observed）

`1036,1151 385×286`；头部 `aria="Collapse activity section"` 宽 322 + 右侧
`A` "See all" `1370,1158 38×28`（`SPAN` 文本 `12px`，x=1370,y=1166）→ `href` 指向项目 Activity 页。
内容 `1048,1180 360×245`，**本轮未展开测量**（不在任务范围，且在第 4 个 section）。

---

## 4. 行为层总表

### 4.1 `cursor` 不是可点性信号（observed，重要）

本页**几乎所有可点元素都是 `cursor: default`**，包括 `<a>` 标签页、`<button>` 图标按钮、
`role="button"` 的行。实测 `cursor: pointer` 的只有 §2.3 的外部链接行。

因此**禁止**用 `cursor` 判断可点性。可靠的判据按强度排序：

1. `tagName === 'A'` + 非空 `href` → 一定可导航
2. `<button>` / `role="button"` / `role="tab"` / `role="switch"` → 可控件
3. `getEventListeners(el)` 非空 → **一定有 handler**（只有正结果有信息量；空结果因 React 在 root 委托而不可用作否定证据）

### 4.2 点击去向（实测，全部已回滚）

| 点击目标                                    | 去向                                                                                                   | 恢复方式                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 右栏里程碑行（任意可点区域）                | `/<ws>/project/<projectId>/issues`（`location.search` **为空**）                                       | `history.back()` → 回 `/overview`  |
| 右栏里程碑行里 hover 出的 `See issues` 按钮 | 同上（同一个 URL）                                                                                     | 同上                               |
| tab `Activity`                              | `/<ws>/project/<projectId>/activity`，`document.title` 变为 `… › Activity`，页面外壳与右栏**保持不变** | 点 tab `Overview` → 回 `/overview` |
| `⋯`（主列 Properties 内联行第 6 项）        | **未点**（有 click handler，但菜单内容未知）→ unknown                                                  | —                                  |
| `Milestone actions`（右栏行内 ⋯）           | **未点**（会开菜单）→ unknown                                                                          | —                                  |
| `Open menu`（主列里程碑卡 ⋯）               | **未点**（会开菜单）→ unknown                                                                          | —                                  |
| `Milestone`（新增里程碑）                   | **未点**（写入类）→ 按边界不点                                                                         | —                                  |

> 往返验证：`/overview → /issues → back → /overview`，`milestoneSection` 仍在、
> 右栏仍在、主列 `scrollTop` 回 0。参考端未做任何写入。

### 4.3 全部 hover-only 元素（observed，至少 5 处）

| #   | 位置                 | 元素                                | 静止态                      | hover 态                                               |
| --- | -------------------- | ----------------------------------- | --------------------------- | ------------------------------------------------------ |
| 1   | 右栏里程碑行         | `BUTTON` "See issues"               | `display: none`（rect 0×0） | `display: flex`, 1278,468 104×24, bg `lch(96.5 0 282)` |
| 2   | 右栏里程碑行         | 拖拽手柄 `DIV.sx-10l6tqk`           | `opacity: 0`                | `opacity: 1`，`svg` `cursor: move`                     |
| 3   | 主列里程碑卡         | 拖拽手柄 `DIV`（absolute, 20×129）  | `opacity: 0`（祖先）        | `opacity: 1`                                           |
| 4   | 主列里程碑卡         | `[role=button][aria="Choose date"]` | 祖先 `opacity: 0`           | 可见                                                   |
| 5   | 主列里程碑卡         | `BUTTON[aria="Open menu"]`          | 祖先 `opacity: 0`           | 可见                                                   |
| 6   | 头部                 | `BUTTON[aria="Menu"]`               | 父容器 `visibility: hidden` | 未验证（推测 hover 或状态驱动）                        |
| 7   | 右栏 Progress 列表行 | `SPAN` "See issues"                 | `display: none`             | 未逐项验证，DOM 同构 → inferred                        |

**检测方法（必须用这个）**：对元素做**祖先链** `opacity` 乘积 + 逐级 `display`/`visibility` 检查，
再叠加一次真实 hover 前后对比。只查元素自身 `getComputedStyle` 会把 3/4/5 全部误判为可见。

### 4.4 可点性一览（按版面区）

- **外壳**：项目名 `A`；收藏 `BUTTON[role=switch]`；`Project actions` / `Copy page URL` /
  `Setup project notifications` / `Close project details` 四个 `BUTTON`；
  3 个 tab `A` + `Add new view` `BUTTON`。
- **主列**：`Choose icon` `BUTTON`；标题与摘要是 `contenteditable` 文本域（可编辑，不是按钮）；
  内联属性行 4 个 `BUTTON` + 2 个 `role=button` DIV + 1 个**无语义但有 handler 的 `DIV`**；
  `Add document or link…` `BUTTON`；2 条资源 `A`（外层各套 `role=button`）；
  `Write first project update` `BUTTON`；`Description` `role=button` DIV；
  每个里程碑卡：图标 `A` + 名称（可编辑）+ `Collapse` + `Choose date` + `N issues · 100%` `A` + `Open menu`；
  `Milestone` 新增 `BUTTON`；整列左缘 minimap（不可点，无 role）。
- **右栏**：4 个 section 头 `role=button`（`aria-expanded="true"`）；`Add dependency`、
  `Add milestone` 两个 `BUTTON`；`See all` `A`；Properties 8 行的 value 控件（`BUTTON` 6 个 /
  `role=button` DIV 2 个）；Milestones 每行 **2 层 `role=button` + `See issues` BUTTON +
  `Milestone actions` BUTTON**；Progress 2 个 `[role=tab]` `BUTTON` + 2 行 `role=button`；
  右栏拖拽手柄 `DIV`（`cursor: col-resize`，7px 宽，`aria` 为空）。

---

## 5. 四个问题的直接回答

### 5.1 右栏 Milestones 每行除了名称和进度，还有没有别的控件？

**有，而且是两个**：

1. `BUTTON[aria-label="Milestone actions"]`，**24×24**，x=1382（行右缘 1416 内缩 12），
   `border-radius: 9999px`，内含三点 `svg 14×14`（属性 `fill lch(40% 1 282 / 1)`）。
   **静止即可见。** 它的可点目标就是它自己这 24×24 的按钮 —— 不是整行。
2. hover 才出现的 `BUTTON` "See issues"，1278,468 104×24，`bg lch(96.5 0 282)`、`radius 2px`。

另外还有第三个 hover-only 元素：左侧拖拽手柄（`opacity 0 → 1`，`cursor: move`）。
**整行**本身也是可点目标（两层 `role="button"`），点它或点 `See issues` 都导航到项目的 Issues 页。

### 5.2 主列里程碑区每行的完整构成？和右栏是不是同一套组件？

**不是同一套组件**，只是共享数据与配色。逐项对照（observed）：

| 维度               | 右栏行                                          | 主列卡                                       |
| ------------------ | ----------------------------------------------- | -------------------------------------------- |
| 高度               | 42（固定）                                      | 129（名称一行）/ 200（名称两行）             |
| 宽度 /x            | 380 / 1038（左右各出血 10）                     | 669 / 304（无出血）                          |
| 圆角 / 底色        | 8px / `lch(100 0 282)`                          | 8px / 无独立底色（继承主列）                 |
| 名称字号           | `12px / 450`, `lch(20 1 282)`                   | `15px / 450`, `lch(19.588 1.25 282)`         |
| 名称可编辑         | 未观察到 `contenteditable`                      | **是**（ProseMirror，`cursor: text`）        |
| 进度文案           | `100% of N`（`of` 在前、数字在独立 8px 药丸里） | `N issues · 100%`（整串在一个 `A` 里）       |
| 进度容器           | 窄组 78×24，右对齐在 1327                       | `A` 115×28，右对齐在 943                     |
| 进度可点           | 数字在 8×24 的 `BUTTON` 里                      | 整串是 `A → …/issues?projectMilestoneId=…`   |
| 描述正文           | 无                                              | 有（92–140 高，可编辑）                      |
| 折叠               | 无                                              | `[role=button][aria="Collapse"]` 16×16       |
| 目标日期           | 无                                              | hover 出 `[aria="Choose date"]` 103×28       |
| `⋯`                | `[aria="Milestone actions"]` 24×24，**常显**    | `[aria="Open menu"]` 28×28，**hover 才显**   |
| hover `See issues` | 是（`BUTTON`）                                  | 否；代替品是常显的 `N issues · 100%` **`A`** |
| 拖拽手柄           | 20×42 @1034，opacity 0                          | 20×129 @1034，opacity 0                      |
| 整行 click 去向    | 导航到项目 Issues 页                            | 未测（内部有多层可点元素）                   |

> 同一份数据在本页**同时存在两种进度文案变体**：右栏 `100% of 2`、主列 `2 issues · 100%`。
> 两者都真实可见但位置不同。任何「按文本比对」的校验必须**先定位版面区**，否则会把变体差异当缺陷。

### 5.3 `Properties` 内联行：标签和各属性的几何关系

同一 y（310）、同行对齐。外层 2 列 grid：列宽 `65.4766px / 587.523px`，`gap: 12px 16px`。
`Properties` 标签在 **x=304, 65×28**；属性行在 **x=385, 556×28**。
标签与属性行**高度相同（28）**，所以基线一致。属性行内 6 个 item 间距 4px，见 §2.2 表。

### 5.4 右栏 `Properties` 卡各行 label /value 的 x 与对齐

label 列 **x=1048**，列宽 **90px**（无列间距）；value 列 **x=1138**。
值是**左对齐、宽度自适应**（`flex-grow: 0`、`text-align: start`），**不右对齐到卡片右缘**。
value 内图标 16px 起点 1144，文字统一从 1168 起。详见 §3.1 表。

---

## 6. unknown 清单

| #   | 项                                               | 为什么不知道                                                                         | 想看需要做什么                     |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------- |
| 1   | 内联 `Properties` 行第 6 个 `⋯` 点开是什么       | 有 `click: 1` handler，但菜单内容未知；按只读边界未点                                | 允许开只读菜单后点一次并立即 Esc   |
| 2   | 右栏 `Milestone actions` 菜单内容                | 同上                                                                                 | 同上                               |
| 3   | 主列里程碑卡 `Open menu` 菜单内容                | 同上                                                                                 | 同上                               |
| 4   | 点右栏里程碑行后 Issues 页**是否带里程碑过滤**   | URL `search` 为空；过滤可能编码在客户端状态而非 URL                                  | 读 Issues 页的过滤 chip / 请求参数 |
| 5   | 左栏折叠态                                       | 未折叠过（会改布局状态）                                                             | 允许点一次 `Menu` 后还原           |
| 6   | 空态：无里程碑 / 无成员 / 无 update 时各卡的样子 | 参考端这些区块都是非空（4 里程碑、8 属性行）                                         | 需要另一份空态参考或产品决策       |
| 7   | `Activity` 卡内容                                | 属第 4 个 section，本轮范围外                                                        | 展开测量                           |
| 8   | `Progress` 图表 svg 的内部路径语义               | 只采到 `rect ×3 / g / path` 的几何，未采颜色与数据映射                               | 按坐标逐 path 采 fill + 数值       |
| 9   | 里程碑真实名称对列宽的影响                       | 名称已脱敏；卡 3 因名称两行导致卡高 200→说明名称长度会改高度，但**改宽度的边界未测** | 用最长名称样本重测                 |
| 10  | 头部 tab 行最右那个 `⎇` 图标按钮                 | 未定位到独立 selector                                                                | 重新定位并采 `aria-label`          |

---

## 7. 关键样式 token 速查（全部为 computed 原值）

```
页面底色            html            lch(94.44 0.5 282)
主卡片 / 头部底色    MAIN, HEADER    lch(97.94 0.5 282)
右栏 section 底色                    lch(100 0 282)
右栏 section 分隔线                  0.5px solid lch(91.9 0 282)
主卡片边框/圆角                      0.5px solid lch(89.84 0 282) / 12px
composer 边框/圆角                   0.5px solid lch(89.84 0 282) / 10px

tab 药丸 激活态 bg                   lch(93.483 0.5 282)
tab 药丸 非激活态 bg                 lch(99.997 0.5 282)
tab 药丸 激活态文字                  lch(9.794 0 282)
tab 药丸 非激活态文字                lch(39.176 1.25 282)
Progress 分段控件 选中 bg            lch(95.543 0 282)
进度列表行 hover bg（主列 N issues） lch(92.44 0.5 282)
右栏 See issues hover bg             lch(96.5 0 282)
Close project details 底盘           lch(94.854 0.157 282)

正文主色            lch(9.794 0 282)      （H1 / tab 激活 / 已填值）
次级文字            lch(19.588 1.25 282)
三级文字            lch(39.176 1.25 282)  （H3 标签 / tab 非激活 / 卡内链接）
四级文字            lch(40 1 282)         （右栏 label / 空态值 / 进度文字）
弱化 / 占位         lch(64.64 1.25 282)
第五级              lch(37.776 1.25 282)  （左栏分组标题）
左栏文字            lch(18.888 1.25 282)

进度图例三色        lch(66 1 282)  /  lch(80 90 85)  /  lch(48 59.31 288.43)
里程碑图标          fill lch(42.969 59.31 288.43)  stroke lch(48 59.31 288.43)
本页唯一硬编码色    #ff2fcd（Teams 图标，computed rgb(255,47,205)）
其它硬编码色        #95a2b3（项目图标，computed rgb(149,162,179)）

字号 / 字重
  项目标题            24px / 600 / lh 32px / ls -0.16px
  主列里程碑名        15px / 450
  摘要 / 描述正文     15px / 450 / lh 23–24px / ls -0.1px（摘要）
  H3 区块标题         13px / 500
  内联属性 chip 文字   13px / 500
  右栏卡头 / 卡内链接  13px / 500 / 450
  右栏 label / 值 / 进度 12px / 450（label 与空态值用 450，图例计数用 500）
  tab 药丸            12px / 500
  左栏导航项          13px / 500
  左栏 workspace 名   13px / 550

圆角          药丸 9999px；卡 8px；右栏 section 头按钮 8px；描述块 12px；composer 10px
```

---

## 8. 复现命令

```bash
cd /Users/alexjiang/Desktop/vibe/orvilo-linear-parity

# 视口 + 结构/样式一次性求值
node .agents/acceptance/scripts/cdp-inspect.cjs --port 9333 --viewport 1440x900 --expr-file <query.js>

# 截图（本地 only，勿发布）
node .agents/acceptance/scripts/cdp-inspect.cjs --port 9333 --viewport 1440x900 --shot /tmp/ref9333/x.png

# hover / click 前后对比需要自带探针（cdp-inspect 只在求值前点一次）：
# 见本轮私有探针 /tmp/ref9333/probe.cjs + /tmp/ref9333/steps-*.json
# 依赖 ws：需 NODE_PATH=<repo>/node_modules
```

> **`/tmp` 是共享的**：本轮有另一个 agent 同时在用 `/tmp/q-*.js` 这批文件名，
> 发生过同路径被覆写。跨 agent 并行采集请用带端口号的私有目录。

---

## Loading state (skeleton)

> 本节是追加采集（用户指出「Skeleton 好像没有对齐」后补）。**结论：参考端在本页没有骨架。**
> 下面先给证据条件与手法，再给启动加载态的完整规格，最后给 unknown。

### 证据条件

| 项       | 值                                                                                            |
| -------- | --------------------------------------------------------------------------------------------- |
| 视口     | `1440x900`，`deviceScaleFactor: 2`（与 §1–§5 同视口，几何可直接对比）                         |
| 日期     | 2026-09-22，浅色主题，`:9333` 参考端                                                          |
| 本地证据 | `/tmp/ref9333/loading-d/s01..s06_*.png`（启动序列逐帧）、`loading-a/`、`loading-e/`（不入库） |
| 探针     | `/tmp/ref9333/loading-probe.cjs`（私有，含 Fetch 拦截与自动放行）                             |

### 制造加载窗口的三种手法（以及为什么用它们）

1. **`Fetch.enable` + `Fetch.requestPaused` 延迟放行**（主手法）。
   匹配到的请求被暂停后，**固定延迟 9–30s 再由探针主动 `Fetch.continueRequest`**。
   为什么不是「永久挂起」：永久挂起会把页面留给下一个采集者时仍是卡死状态；
   为什么不是 `Network.emulateNetworkConditions`：限速的窗口不可精确控制，而且一旦忘记恢复
   `latency/throughput`，会污染**之后所有人**对这个页面的采集。延迟放行两头都占：
   窗口由我定时，页面自愈。
   本轮用过的 pattern：`*sync/batch*`、`*graphql*`、`*client-api.linear.app/*`。
   **恢复已核实**：收尾调用 `Fetch.disable`，回读 `fetchDisabled: true`，
   页面回到 3720 元素基线（右栏、里程碑区、主列滚动容器均在）。
   本轮**没有**使用网络限速，因此不存在「忘记恢复限速」的风险。
2. **直接读静态标记**（关键技巧）。启动占位符是文档里的**静态 HTML**（`DIV#loading`，1395 字符），
   **不在 React 树里** —— 启动时 `#root` 的子节点数是 **0**。App 只是在启动完成后给它加行内
   `display: none`。所以它的 DOM 与样式可以**在页面空闲时随时读全，不需要抢时间窗**；
   只有依赖布局的几何值需要在窗口内实测。这消掉了「加载态窗口太短抓不到」的绝大部分风险。
3. **SPA 切 tab 快速采样**（点击后～20 / 150 / 300ms）验证**路由级**有没有加载态。

### 结论：没有骨架 —— 三条独立证据

1. **文档里不存在任何骨架形态的 `@keyframes`。** 扫 `document.styleSheets` 得到全站动画名，
   与加载相关的只有 `logoBackgroundPulse` / `fadeIn` / `bootstrapFadeIn` / `suspenseFadeIn`，
   **没有** `shimmer` / `skeleton` / `wave` / 循环 `pulse` 这类骨架动画。
2. **启动占位符的完整 HTML 里没有任何灰块**（全文见下），只有卡片外框 + logo + 一行文案。
3. **三个受控窗口内的灰块检测都是 0**：挂起 `sync/batch` 时 `grayCount: 0`；
   SPA 切回 Overview 的 +20ms 中间态 `grayCount: 0`。
   （灰块判据：叶子节点、无自身文本、`background-color` 非透明、`≥8×3`。）

### 启动加载态（app boot loader）完整规格

`DIV#loading` 的静态标记（observed，原文，仅省略 script 内容）：

```html
<div id="loading" style="transition-duration: 100ms; display: none;">
  <div id="appBorders">
    <div id="loading-content">
      <div id="preloader">
        <div id="preloaderContent">
          <svg class="bkg" width="64" height="64" viewBox="0 0 512 512" fill="none">
            <circle cx="256" cy="256" r="244" fill="url(#bkg)"></circle>
          </svg>
          <script>
            /* DOMContentLoaded → body.content-loaded；+8000ms → body.loadingText */
          </script>
          <svg id="logo" fill="none" width="32" height="32" viewBox="0 0 32 32">
            <path d="M.392 19.687c-.071-.303.29-.494.511-.274l11.684 11.684…"></path>
          </svg>
        </div>
      </div>
    </div>
    <div id="loadingText">Loading…</div>
  </div>
</div>
```

启动窗口内实测的 computed 原值与几何（`#root` 子节点数 = 0 时）：

| 元素                | 几何           | computed 原值                                                                                                                                                                                                                                |
| ------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#loading`          | 0,0 1440×900   | `display: flex; position: absolute; inset: 0px; z-index: 99999`；`background-color: lch(94.44 0.5 282)`；`color: rgb(176,181,192)`；`font-size: 12px; font-weight: 500`；行内 `transition-duration: 100ms`；启动完成后加行内 `display: none` |
| `#appBorders`       | 244,8 1188×856 | `display: flex; border-radius: 12px; background-color: lch(97.94 0.5 282); border: 0.5px solid lch(88.49 0 282); margin: 8px 8px 36px 244px`                                                                                                 |
| `#loading-content`  | 622,404 440×64 | `position: absolute; display: flex; width: 440px; height: 64px; opacity: 0; animation: fadeIn 0.4s ease-out delay=1s iteration=1 fill-mode=both`；`inset: 450px 378px 432px 500px` + `margin: -46px 0px 0px 122px`                           |
| `#preloaderContent` | 810,404 64×64  | `display: grid; position: relative`                                                                                                                                                                                                          |
| `svg.bkg`           | 810,404 64×64  | **`opacity: 0`（完全不可见）**；`animation-name: none`（`logoBackgroundPulse` 未挂在此处）                                                                                                                                                   |
| └ `circle`          | 812,406 61×61  | 属性 `fill="url(#bkg)"`，但 **computed `fill: none`**（引用的渐变未解析，不渲染）；computed `stroke: rgb(176,181,192)`                                                                                                                       |
| `svg#logo` → `path` | 826,420 32×32  | path computed `fill: rgb(176,181,192)`                                                                                                                                                                                                       |
| `#loadingText`      | 811,476 62×20  | `display: block; position: relative; opacity: 0`（与父同组淡入）；`font-size: 13px; font-weight: 500`；`color: rgb(176,181,192)`；`margin: 0px 0px -8px`                                                                                     |

**从规格里读出来的三件事**：

1. **`#appBorders` 与真实主卡同形同尺寸**：真实 `MAIN` 是 `244,8 1188×856`、`border-radius 12px`、
   bg `lch(97.94 0.5 282)`；占位符完全一致，只有边框色略深
   （`lch(88.49 0 282)` vs 真实 `lch(89.84 0 282)`）。
   **即启动态画的是「卡片外框」，不是内容骨架。**
2. **指示器的水平中心是 `x = 842 = (244 + 1440) / 2`** —— 内容区中心（已排除 244px 左栏），
   `#loading-content`（622+220）与 `#loadingText`（811+31）都落在这条线上；
   整组竖向中心 `y = 450`（视口中心，`#loading-content` 404..468 加文案 476..496）。
3. **淡入延迟 1s 才开始**（`fadeIn 0.4s ease-out delay=1s fill-mode=both`），
   所以刷新后**前 1 秒屏幕上只有卡片外框**，没有任何指示器、没有 spinner、没有进度条、没有灰块。

### 时序（`sync/batch` 延迟放行，180ms 采样，从 `Page.reload` 起算）

| t             | `#root` 子节点 | `#loading`                                   | 主列文本长度 | 右栏文本长度 |                                           |
| ------------- | -------------- | -------------------------------------------- | ------------ | ------------ | ----------------------------------------- |
| 212ms         | 5              | `display: none`                              | 4018（旧页） | 909（旧页）  |                                           |
| \~800ms       | —              | —                                            | —            | —            | （reload 后执行上下文销毁，该次求值失败） |
| **1131ms**    | **0**          | **可见**，`#loading-content` @622,404 440×64 | 0            | 0            |                                           |
| **1436ms**    | **0**          | 可见，同上                                   | 0            | 0            |                                           |
| 1973ms        | 5              | 可见                                         | 3026         | **0**        |                                           |
| 2259ms        | 5              | `display: none`                              | 3108         | **0**        |                                           |
| 4490ms 起稳定 | 5              | `display: none`                              | 3108         | **0**        |                                           |
| 请求放行后    | 5              | `display: none`                              | 4018         | 909          |                                           |

→ 启动占位符的可见窗口约 **1.0–1.9s**（热启动，本地缓存已在）。
注意 2259ms 之后 `#loading` 已隐藏，而主列 / 右栏**还在继续变** —— 说明壳先撤、内容后到，
**中间没有过渡骨架**。

### 路由级加载态：也没有

- 点 `Activity` tab 后 +0 / +150 / +300ms：主列 `innerText` 长度恒为 4018，且内容**仍是上一个路由的**
  （`mainHead` 还是 Overview 的文本）→ **stale render，无骨架、无占位**。
- 从 Activity 切回 Overview 的 +20ms 中间态：`els 3278`、主列 3145 字符、右栏 480 字符、
  `#milestone-list` 尚不存在；**灰块检测 0**，当时挂在页面上的动画名只有 Linear 自己的
  `sx-18re5ia-B` / `suspenseFadeIn` / `fadeIn`。1.5s 后稳定到 `els 3720` / 主列 4018 / 右栏 909。
  → **真实内容渐进挂载，还没准备好的部分直接不画。**

### 数据缺失时右栏的表现

| 挂起的请求                                            | 主列                 | 右栏 `[aria-label="Project sidebar"]`                |
| ----------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| `*client-api.linear.app/*`（含 graphql + sync/batch） | 从缓存渲染（有内容） | **元素不存在**（该区域是主卡内的空白，无占位无骨架） |
| `*sync/batch*`                                        | 从缓存渲染（有内容） | **元素不存在**                                       |
| `*graphql*`                                           | 完整                 | **完整（909 字符）**                                 |

→ Overview 的内容来自**本地同步缓存**，不走 graphql；右栏依赖 `sync/batch`。
缺数据时右栏是 \*\*「不存在」而不是「骨架」\*\*。

### 对候选端的直接含义（只陈述事实，不下结论）

候选端 overview 的加载分支返回整页居中转圈（`NeuralNetworkLoading`），
而 route 级骨架系统 `createSurfaceSkeleton` 未覆盖 overview 路由。
就本页而言，参考端**两种都不是**：

- 它**没有** skeleton；
- 它**也没有**居中转圈；
- 它的启动态是「**卡片外框 + 延迟 1s 淡入的 logo / 文案**（居中于内容区，不是视口）」，
  路由态是「**直接渲染缓存里的真实内容**，缺的部分不画」。

### unknown（本节）

| #   | 项                                                                                            | 为什么不知道                                                                                                  | 想看需要做什么                                            |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | **冷启动**（无本地缓存 / 首次访问）时占位符停留多久、是否进入 `body.loadingText`（8s 后）形态 | 本轮全部是热启动，窗口只有～1s                                                                                | 清站点数据后冷启动重采（会登出，需谨慎）                  |
| 2   | `logoBackgroundPulse` 到底挂在谁身上                                                          | 关键帧存在于文档，但 `svg.bkg` 的 `animation-name: none`；推测由 `body.loadingText` 触发（8s 后），**未验证** | 让加载超过 8s（延迟放行加到 >10s）后重采 `svg.bkg`        |
| 3   | `svg.bkg circle` 的真实外观                                                                   | `fill="url(#bkg)"` 的渐变定义不在序列化出的 HTML 里，computed `fill: none`（不渲染）                          | 在启动窗口内 dump `#loading` 所在 `<svg>` 的 `<defs>`     |
| 4   | **错误态**长什么样                                                                            | 本轮只做「延迟」，没让请求**失败**                                                                            | 用 `Fetch.failRequest` 造失败后观测（只读，需确认可接受） |
| 5   | 占位符 `z-index: 99999` 覆盖全屏，是否会遮住 DevDock / 其它浮层                               | 未测                                                                                                          | 启动窗口内做一次 `elementFromPoint` 命中测试              |
