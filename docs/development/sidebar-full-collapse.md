# 侧边栏收起时整条隐藏

2026/10/09

## 行为

收起侧边栏时整条列都隐藏，内容区从窗口最左侧开始，不再留 50px 的图标轨。主页侧边栏和设置侧边栏行为一致。

展开入口：

- macOS 桌面端：标题栏里常驻的面板按钮。
- 其他平台与 Web：页头里的面板按钮（`NavHeader` 在收起时显示）。
- 快捷键 `toggleLeftPanel`。

## 为什么改

图标轨占宽度，“收起” 名不副实；设置页的图标没有文字，认不出是哪一项。Linear 的做法也是整条收起。

## 实现

- `AppSidebar` 的 `Sidebar` 从 `collapsible="icon"` 改为 `collapsible="offcanvas"`。
- `SHELL9_SIDEBAR_COLLAPSED_WIDTH` 为 `0`，标题栏与启动骨架的几何随之对齐；`SHELL9_SIDEBAR_ICON_WIDTH` 与 `--sidebar-width-icon` 删除。
- `NavMain` 不再在收起时把路由面板换成全局图标导航。面板在收起期间保持挂载（列只是移出屏幕），滚动位置和设置搜索的查询词不丢。
- 设置搜索去掉图标轨上的 “点击展开并聚焦” 按钮。
- 设置页不再因为 “收起” 而显示工作区切换头部。
- 删除只在图标轨下生效的类名（`group-data-[collapsible=icon]:*`、`in-data-[state=collapsed]:*`）。

## 未做

鼠标贴左边缘时浮出侧边栏预览（Linear 有）。本次不含，可另行添加。
