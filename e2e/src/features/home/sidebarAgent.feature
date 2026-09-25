@journey @home @sidebar @agent
Feature: Agents 页面 Agent 管理
  作为用户，我希望能够在 Agents 页面管理 Agent

  Background:
    Given 用户已登录系统
    And 用户在 Agents 页面有一个 Agent

  # ============================================
  # 重命名
  # ============================================

  @HOME-AGENT-RENAME-001 @P0
  Scenario: 通过右键菜单重命名 Agent
    When 用户右键点击该 Agent
    And 用户在菜单中选择重命名
    And 用户输入新的名称 "My Renamed Agent"
    Then 该项名称应该更新为 "My Renamed Agent"

  @HOME-AGENT-RENAME-002 @P0
  Scenario: 通过更多操作菜单重命名 Agent
    When 用户悬停在该 Agent 上
    And 用户点击更多操作按钮
    And 用户在菜单中选择重命名
    And 用户输入新的名称 "Agent From Menu"
    Then 该项名称应该更新为 "Agent From Menu"

  @HOME-AGENT-RENAME-003 @P1
  Scenario: 重命名后按 Enter 确认
    When 用户右键点击该 Agent
    And 用户在菜单中选择重命名
    And 用户输入新的名称 "Enter Confirmed" 并按 Enter
    Then 该项名称应该更新为 "Enter Confirmed"

  # ============================================
  # 侧边栏显示/隐藏 — 场景随固定侧边栏 IA 退役而移除
  # ============================================
  # v6 侧边栏重写为固定 Linear 式 IA（src/features/Navigation/sidebarContract.ts）：
  # 主侧边栏不再渲染按 Agent 分组的列表，"在我的侧边栏显示/隐藏" 不再是产品行为。
  # HOME-AGENT-PIN-001/002（将 Agent 加入/移出侧边栏）断言的是该已退役行为，
  # 属于有意删除而非导航修复。/agents 页仍残留 "In Sidebar" 区块与
  # show/hide 菜单项（写 sidebarAgentVisibilityOverrides），但固定侧边栏已不消费
  # 该状态——这一残留已在 PR 描述中作为产品缺陷上报。

  # ============================================
  # 删除
  # ============================================

  @HOME-AGENT-DELETE-001 @P0
  Scenario: 删除 Agent
    When 用户右键点击该 Agent
    And 用户在菜单中选择删除
    And 用户在弹窗中确认删除
    Then Agent 应该从列表中移除
