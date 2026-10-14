# REA 逆向工程 Linear — 2026-10-15

工具：`rea-agents` 6.5.0（`npm i -g rea-agents`），Node v22.23.2。
参考端：Brave 副本 profile @ CDP `127.0.0.1:9333`，工作区 `linear.app/bdiverifier`（已登录，只读）。
桌面壳：`/Applications/Linear.app`（Electron，`Contents/Resources/app.asar`）。

## 结论

Linear 桌面版是**薄 Electron 壳**：`app.asar` 内无业务代码，主进程只做窗口 / 菜单 / 通知桥，渲染层直接加载 `https://linear.app`。所有 UI 行为都在 web bundle 里 —— 逆向 web bundle 等价于逆向桌面版。

## 证据清单（本机 `/tmp/rea-linear/`）

| 工件                                             | 说明                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `asar-analysis.json`                             | 桌面壳静态分析：299 graph nodes / 620 edges / 20 相关文件，确认只加载 `linear.app`                     |
| `js-full/`                                       | 当前 origin 的 **1378 个命名 JS chunk**（约 24.6MB），含完整路由 / 组件 /action 目录                   |
| `js-full-analysis.json`                          | REA 全量分析（248MB Evidence）：6,194,392 AST 节点、25,502 findings、0 parse 失败。SHA-256 `974b7f79…` |
| `routes.txt` / `keymap.txt` / `action-names.txt` | 从 bundle 提取的路由表（\~380 条 orgKey 路由）、键位表（\~169 绑定）、action 目录（\~1786 标签）       |

## 提取结果

### 1. 路由表（`routes-fragment.txt` 全部节选见附录）

Linear 路由呈 `orgKey` 前缀三段结构，关键面：

- 收件箱：`/:orgKey/inbox`、`/:orgKey/inbox/:inboxTab?`、`inbox/notification/:notificationId`
- My issues：`/:orgKey/my-issues/:viewType?` + `activity|assigned|created|subscribed`
- 评审：`/:orgKey/reviews/:viewType?`、`/:orgKey/review/:reviewId/:viewMode?`
- 项目：`/:orgKey/projects/:viewType?`、`project/:projectId/:tab?`
- 视图：`/:orgKey/view/:customViewId`、`team/:teamKey/views/:viewType?`
- Agent：`/:orgKey/agent`、`agent-session/:agentSessionId`、`agent/:conversationId?`
- 草稿：`/:orgKey/drafts/:draftId?`

### 2. 键位表（`keymap.txt`，\~169 条）

提取自 `ContextualMenuActions` chunk 的 `{key, mod, shift, alt, runWithInputFocus}` 绑定对象与 `key:[seq]` 链式前缀。

**常用全局键**

| 键                  | 语义                                                |
| ------------------- | --------------------------------------------------- |
| `mod+k`             | 命令面板（command bar）                             |
| `?`（shift+/）      | 快捷键速查表                                        |
| `c`                 | 新建 issue（`mod+alt+c` 为 runWithInputFocus 变体） |
| `mod+,` / `o>s`     | 设置                                                |
| `O>W`               | 切换工作区                                          |
| `mod+shift+]` / `[` | 下一 / 上一标签页                                   |
| `mod+alt+→` / `←`   | 前进 / 后退（历史导航）                             |
| `x`                 | 行多选；`shift+↑/↓` 扩展选择                        |
| `Escape` / `Enter`  | 关闭 / 打开选中行                                   |

**链式前缀**（`key:[a,b]` 序列）

- `g` = Go to：`g>i` 收件箱、`g>m` My issues、`g>r` 评审、`g>d` 草稿、`g>p` 项目、`g>v` 当前 cycle、`g>a` active、`g>b` backlog、`g>e` all、`g>t` triage、`g+c` cycles、`g+f` pulse、`g+j` Agent、`g+n` teams、`g+q` customers、`g+l` loops、`g+x` archive、`g+-` dashboards、`g+s`(或`g>k`) 偏好设置
- `o` = Open picker：`o>i` issue、`o>p` project、`o+t` team、`o+v` view、`o+u` user、`o+d` document、`o+r` PR、`o+s` settings、`o+g` GitHub、`o+c` cycle、`o+n` initiative、`o+q` customer、`o+f` project labels
- `n` = New：`n+p` 项目、`n+i` initiative、`n+r` release、`n+c` 评论、`n+o` 无 owner
- `p` = issue 属性：`p+s` status、`p+a` assignee、`p+p` priority、`p+l` label、`p+m` milestone、`p+t` ?、`p+n` ?
- `m` = 移动 / 更多：`m+m`、`m+b`、`m+x`、`m+r`
- `r` = 评审：`r+a` 快速通过、`r+s` 提交评审
- `w` = 视图：`w+l` 折行、`w+o` work-on-issue/PR
- `s` = 结构：`s+h` structural highlighting
- `g>d>*` = debug（feature flags / stats / misc）；`O>P/V`、`D>E` 为 dev 序列

### 3. Action 目录（`action-names.txt`，\~1786 标签）

`ActionGroups` chunk 把命令分组为：`navigationActions`、`viewActions`、`miscActions`、`searchActions`、`developerActions`、`targetedModelActions`（作用于选中实体）、`nonTargetedModelActions`、`searchResultActions`。实体域覆盖 Issues/Projects/Milestones/Initiatives/Releases/Customers/Reviews/Loops/Users/Teams/Labels/Documents/Drafts/Views/Dashboards/Settings/Integrations/MCPs。

### 4. 设计 token（light 模式全量 541 项已解析）

- 字号：`font-size-mini .6875rem(11px)`、`tiny .75rem(12)`、`small .8125rem(13)`、`regular .9375rem(15)`、`large 1.125rem(18)`
- 字重：`normal 450`、`medium 500`、`bold 600`
- 控件：`control-height 32px`、`control-border-radius 8px`、导航项高 28px
- 速度：`speed-highlightFadeIn 0s`、`highlightFadeOut .15s`、`speed-quick .1s`、`regular .25s`、`slow .35s`
- 缓动：标准 `cubic-bezier(.25,.46,.45,.94)`、regularIn `(.0,.0,.38,.9)`、regularOut `(.2,.0,0,1)`、maxSpeed `(.07,.82,.17,1)`、linearTransition `(.25,.25,.75,.75)`
- 影：popover `0 0 0.5px rgba(62,68,90,.31), 0 5px 10px rgba(62,68,90,.1), 0 0 1px rgba(62,68,90,.2), 0 15px 40px rgba(62,68,90,.2)`
- 表面：浅色 `background-primary #fff`/`secondary #f7f8f9`/`tertiary #f4f5f8`/`quaternary #f2f3f7`；深色 `dark-primary #101011`/`secondary #161719`/`tertiary #1c1d21`/`quaternary #232326`；primary `rgb(81,92,230)`(light)/`rgb(101,111,247)`(dark)
- 列表圆角：`--sidebar-item-radius: 5px`（`sx-*` stylex 类内）

> DESIGN.md 已批准：Orvilo 类型角色 = Geist 14/12/16 + 作用域内 13px 密集标签（与 Linear `font-size-small` 一致）；字重 450 用于 rail 描述。**token 值不照搬 Linear，结构 / 行为对齐即可。**

### 5. 桌面端菜单（asar）

File > New 子菜单：Issue…、Project…、Initiative…、Agent chat…、Document…、Customer request…；另有 Reopen Closed Tab、`⌘W` 关标签、导航标签快捷键。

## 静态分析边界

- 25,502 findings 均来自文本 / AST 静态证据；运行时动态路由、feature flag 分支（如 `I.splitSettings ? 'k':'s'`）和懒加载 chunk 的行为需要 CDP 实测确认。
- GraphQL operation 名与 REST 路径以字符串证据为准；请求时的实际负载形态未逐条逆向。
- 源 map 未发布；组件名来自 chunk 文件名（`IssueList`、`Board`、`Inbox`、`ReviewsHelper`、`ProjectGroupedViewHelper` 等），压缩代码里的标识符仍可读但成员名已混淆。

## 已应用到 Orvilo 的差异

| 差异               | 证据                                                                                                                            | 落地                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `g>r` 前往评审队列 | Linear `key:['g','r']` → "Go to reviews"；Orvilo `goToReviews` id 与 i18n 早已存在但绑定未注册（遗留「surface withdrawn」测试） | `packages/const/src/hotkeys.ts` 注册 `g>r`；`GO_TO_DESTINATIONS` 加 `/reviews`；更新两个测试 |

待评估（有证据、需产品裁决）：`g>j` Go to Agent、`o>*` 打开选择器、`n>*` 新建前缀、`p/m/r/w/s` 行级前缀 —— 依赖选中行上下文，超出本次切片。
