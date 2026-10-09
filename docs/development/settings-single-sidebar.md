# 设置只有一个侧边栏

2026/10/09

## 行为

设置只有一个侧边栏。账号、通知、Agent、工具、此设备、用量、安全、数据、开发者各组照旧，中间多一组 “工作区”，放概览、成员、导入。

每项能力只出现一行。页面读写工作区数据时，这一行指向 `/:slug/settings/<tab>`；其余指向 `/settings/<tab>`。

| 行                           | 指向                     | 原因                                 |
| ---------------------------- | ------------------------ | ------------------------------------ |
| 概览、成员、导入             | 工作区页                 | 只属于工作区                         |
| 设备                         | 工作区页                 | 同一页含共享设备池和私人设备         |
| 数据统计                     | 工作区页                 | 同一份统计，多一个按成员拆分的维度   |
| 凭证管理                     | 工作区页                 | 同一页含个人凭证和工作区凭证         |
| 用量、订阅、额度、预算、账单 | 工作区页（仅商业版部署） | 计费按工作区结算；预算只在工作区存在 |
| 其余全部                     | 个人页                   | 跟人或跟这台设备走                   |

`/settings` 打开个人资料页。主页侧边栏 “更多 → 工作区设置” 打开工作区概览。

## 重定向

下面八个工作区地址原先渲染的就是个人页组件，只是套了第二套侧边栏。现在它们重定向到个人页：

`profile`、`appearance`、`hotkey`、`notification`（含 `notification/:sub`）、`connector`、`apikey`、`advanced`、`about`。

`apikey` 的工作区镜像带一层成员角色守卫 `WorkspaceApiKeyGuard`。守卫移到了个人页内部，侧边栏的 API Key 行同时要求 `create_content` 权限。

## 实现

- `src/features/Settings/hooks/useCategory.tsx`：唯一的分类来源。工作区行通过 `href` 带上工作区地址；`SettingsNavKey` 在 `SettingsTabs` 之外加入四个只属于工作区的键。
- `src/features/Settings/Layout/Body/index.tsx`：按地址里的页签段判断高亮，不再按键判断，因为 `stats` 行指向 `statistics`。
- `src/features/WorkspaceSetting/Layout.tsx`：工作区路由树渲染同一个侧边栏；页头标题按地址从同一份分类里取。
- `src/features/NavPanel/routeKey.ts`：两棵路由树共用 `settings` 面板键，`workspace-settings` 键删除。
- `packages/app-config/src/routes/settings.ts`：`WORKSPACE_SETTINGS_ALIASES` 增加八条重定向。
- `src/features/Workspace/workspaceAwarePath.ts`：`WORKSPACE_SETTINGS_TABS` 只保留真正的工作区页；`/settings` 首页不再加工作区前缀。

删除：`src/features/WorkspaceSetting/SideBar/`、`src/features/WorkspaceSetting/hooks/useCategory.tsx`，以及八个镜像路由目录。

## 取代的做法

此前有两套设置导航。`/settings/*` 一套，`/:slug/settings/*` 另一套，后者把账号页、通知、连接器、API Key、高级设置、关于重新列了一遍，设备、数据统计、凭证则在两边各有一页。同一个入口名 “设置” 和 “工作区设置” 打开的是两个长得不一样的侧边栏。

## 未做

- 个人路由下的 `/settings/devices`、`/settings/stats`、`/settings/credential` 仍可通过地址访问，侧边栏不再列出。把这三对页面合成一页是后续工作。
- 移动端的工作区设置仍复用移动端设置外壳，没有工作区分组。
- 商业版部署下计费行指向工作区页这一点未在云端环境验证。
