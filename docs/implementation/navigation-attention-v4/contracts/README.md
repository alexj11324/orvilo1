# 合同夹具

fixtures.json 只是 N01 设计讨论 / 自动化用例的结构化样本，不是已生成的 SDK、数据库 schema 或真实数据。不得把它直接挂到 production API 作为返回值。D 完成类型与 Zod 校验后，应增加 valid/invalid/old-client fixture 套件；N/Q/U/V 都以同一版本为准。样本中的用户 / 任务 / 请求 ID 均为虚构。

必须覆盖：personal/workspace 分离、source 动作版本、已读不等于 resolved、共享 currentUser 引用、query 类型 / 复杂度限制、outcome\_unknown。所有契约执行测试走 GitHub CI。
