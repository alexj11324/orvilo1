# 通知偏好：事件 × 渠道矩阵

2026/10/09

## 行为

通知页用一张矩阵表达通知偏好：每行一个事件，每列一个渠道（收件箱、桌面与移动端）。首行 “全部通知” 是各渠道的总开关，关掉后该列的事件勾选框禁用但保留原值。

每次改动只保存变化的那一个叶子值，保存状态显示在卡片标题右侧，不挤占正文。

邮件渠道没有发送管线，不提供。

## 只有一页

通知偏好跟人走，只有个人设置里这一页。旧的 `/:slug/settings/notification` 地址重定向到 `/settings/notification`，见 [settings-single-sidebar.md](./settings-single-sidebar.md)。

## 实现

- `src/features/Settings/notification/NotificationPreferences.tsx`：纯展示的矩阵，只接收 `value` 和 `onChange`。
- `src/features/Settings/notification/personal.tsx`：个人页外壳，读写用户设置。桌面端通知页在提示音设置下方渲染它，Web 端单独渲染它。
- `src/business/client/BusinessSettingPages/WorkspaceNotification.tsx`：按工作区保存偏好的外壳。当前没有路由指向它，保留是因为该目录由云端版整体替换。

个人页不再引用 `business/client` 下的工作区组件。该目录会被云端版整体替换，个人设置不能依赖它。

## 取代的做法

此前两个渠道各自列出六个事件开关，共十二个开关分成两段；个人页复用工作区组件并通过 `personal` 属性切换数据来源，同时把个人通知页改成了工作区的窄栏版式。
