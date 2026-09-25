@regression @tasks @layout-probe
Feature: Issue 详情属性栏的布局规则
  属性栏每一行都应与兄弟行左缘、宽度一致，内容左对齐，文字不被无省略号地裁掉，
  且不直接显示 ISO 日期。任务运行中时负责人选择器被禁用，这一状态最容易走样，
  所以运行中与非运行中各验一次。

  Scenario Outline: <状态说明>任务的属性栏通过布局规则
    Given I am logged in with a session
    And 存在一个状态为 "<status>"、带 workflow 状态和标签并指派给我的任务
    When 我在 1440×900 视口打开该任务详情
    Then 属性栏通过 sibling-edge、centered-in-full-row、clipped-text、date-format 规则且至少采到 4 行

    Examples:
      | 状态说明 | status  |
      | 运行中   | running |
      | 未运行   | backlog |
