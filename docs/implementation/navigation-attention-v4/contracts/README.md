# 合同夹具

fixtures.json只是N01设计讨论/自动化用例的结构化样本，不是已生成的SDK、数据库schema或真实数据。不得把它直接挂到production API作为返回值。D完成类型与Zod校验后，应增加valid/invalid/old-client fixture套件；N/Q/U/V都以同一版本为准。样本中的用户/任务/请求ID均为虚构。

必须覆盖：personal/workspace分离、source动作版本、已读不等于resolved、共享currentUser引用、query类型/复杂度限制、outcome_unknown。所有契约执行测试走GitHub CI。
