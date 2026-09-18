# 64 项验收矩阵

这是测试合同，所有状态初始为 NOT\_RUN。测试实现和执行都在 GitHub CI / 获准隔离 Preview；本机不编译测试。真实外部验证不可用时标 BLOCKED，不用 mock 替代。每项记录源码 SHA、组合 tree、测试 run、环境、实际断言、产物和 reviewer。

| ID     | 场景                                                               | 期望结果                                                                       | 实现包 | 执行层                  | 状态     |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------ | ----------------------- | -------- |
| NAV01  | Web 新增 Inbox/My Work/Views 且 Tasks/Projects/Automation 保持可达 | route 与浏览器；图标 / 标题 /deep-link 对应同一个有效页面                      | N09    | CI\_E2E                 | NOT\_RUN |
| NAV02  | Electron 共同路由与原生通知点击                                    | 相同 scope/object 打开准确页面；没有 Web 存在 Electron404                      | N09    | CI\_E2E                 | NOT\_RUN |
| NAV03  | Mobile/PWA 窄屏与键盘 / 触屏                                       | 预览返回保留滚动 / 选择；无 hover-only 按钮；读态正确                          | N09    | CI\_E2E                 | NOT\_RUN |
| NAV04  | 个人模式                                                           | 只有 workspaceId=NULL 自有通知 / 工作，无伪 Team；旧个人消息可读               | N07    | CI\_DB\_E2E             | NOT\_RUN |
| NAV05  | 一 Team 与大量 Teams                                               | 不强制配置；搜索 / 更多可达 200 团队，私密不可见                               | N08    | CI\_E2E                 | NOT\_RUN |
| NAV06  | 收藏两设备并发与目标失权                                           | 保留 typed 目标 / 顺序版本，不泄漏失效标题，不覆盖全部偏好                     | N08    | CI\_DB\_E2E             | NOT\_RUN |
| NAV07  | CommandMenu 搜索和输入焦点                                         | @me/scope 权限正确；编辑器不被 J/K 等快捷键截获                                | N09    | CI\_E2E                 | NOT\_RUN |
| NAV08  | 旧页面和退休面                                                     | mine 精准迁移；Task 详情与 scheduled 不变；不复活 provider/acceptance 等入口   | N09    | CI\_E2E                 | NOT\_RUN |
| NOT01  | 同一 canonical 事件重复 20 次并收到 provider 回声                  | 一个逻辑通知 episode，只递增一次；保留真正不同事件                             | N04    | CI\_DB                  | NOT\_RUN |
| NOT02  | 两个 outbox 消费者独立失败 / 成功                                  | 实时 consumer 成功不吞 notification 事件；重试只影响自己的回执                 | N04    | CI\_DB                  | NOT\_RUN |
| NOT03  | 投影进程崩溃并恢复                                                 | 业务已提交事件继续投递；不产生发送成功但落库失败的伪状态                       | N04    | CI\_INTEGRATION         | NOT\_RUN |
| NOT04  | shadow 到 live 切换与旧 producer 同时存在                          | shadow 不发送；live 只一个有效写入路径，无双卡 / 双邮件                        | N10    | CI\_INTEGRATION         | NOT\_RUN |
| NOT05  | 阅读 v5 时并发到达 v6                                              | 只确认 v5，v6 仍未读；用户未打开的详情不被预取清已读                           | N04    | CI\_DB\_E2E             | NOT\_RUN |
| NOT06  | 批量已读 snapshot 与晚提交事件                                     | cutoff 之后的新消息不被清掉；小 seq 晚提交也不漏投影                           | N04    | CI\_DB                  | NOT\_RUN |
| NOT07  | archiveAll 处理未决审批                                            | 可以归档普通动态，不能让权威 pending 消失或改变任务状态                        | N05    | CI\_DB\_E2E             | NOT\_RUN |
| NOT08  | snooze / 到期 / 更紧急升级                                         | 只改变显示，不延长期限；恢复正确且计数有一致定义                               | N04    | CI\_DB\_E2E             | NOT\_RUN |
| ACT01  | viewer 整理自有通知但尝试任务 / 审批写                             | markRead 允许；编辑 Task/approve 禁止；无需 message:create 来清已读            | N05    | CI\_SECURITY            | NOT\_RUN |
| ACT02  | 两页面同时批准同一 request                                         | source 单次 CAS 消费，第二次已决定；不重复执行工具                             | N05    | CI\_INTEGRATION         | NOT\_RUN |
| ACT03  | 参数 / 需求 / PR head 版本改变后点击旧批准                         | 返回 STALE 或 EXPIRED，不能执行新参数 / 新 head                                | N05    | CI\_SECURITY            | NOT\_RUN |
| ACT04  | 审批后执行前权限撤销 /epoch 变更                                   | 执行端再校验并拒绝；UI 不说已执行                                              | N05    | CI\_INTEGRATION         | NOT\_RUN |
| ACT05  | 向 Agent 提供补充输入并断线重发                                    | 原 input 队列一个幂等输入，回执区分接收与消费                                  | N05    | CI\_INTEGRATION         | NOT\_RUN |
| ACT06  | 新 PR head 与多 reviewer                                           | 旧审核不认可新 head；相关请求正确重开且不制造第二个 Task                       | N05    | CI\_INTEGRATION         | NOT\_RUN |
| ACT07  | 外部决定成功响应丢失                                               | 同 operationId 核对 / OUTCOME\_UNKNOWN，不重复放行                             | N05    | CI\_INTEGRATION         | NOT\_RUN |
| ACT08  | 资源转移 / 邀请旧通知缺失或已归档                                  | 原有效 request 仍可发现处理，已过期不幽灵催办，outgoing 不伪装待我批准         | N05    | CI\_DB\_E2E             | NOT\_RUN |
| WORK01 | 我负责                                                             | 按 assigneeUserId 与权限，和通知存在 /read 无关                                | N03    | CI\_DB                  | NOT\_RUN |
| WORK02 | 我委派                                                             | 明确委派人；共享 Agent 代别人跑的任务不因 agentOwner 属于我进入                | N03    | CI\_DB                  | NOT\_RUN |
| WORK03 | 我创建                                                             | 受管导入不冒充安装者；可验证 on-behalf-of 与未知分开                           | N03    | CI\_DB                  | NOT\_RUN |
| WORK04 | 订阅和退订                                                         | 任务订阅与聊天分开；退订不解除审核 / 负责人责任                                | N03    | CI\_DB                  | NOT\_RUN |
| WORK05 | 待审核含无 Task 的 PR                                              | 只显示真实可读 PR 请求，不为了列表自动建 Task                                  | N07    | CI\_INTEGRATION         | NOT\_RUN |
| WORK06 | 旧 /tasks?collection=mine scope=created                            | 转到对应 MyWork 且保留 workspace / 过滤；scheduled 路径不误转                  | N07    | CI\_E2E                 | NOT\_RUN |
| WORK07 | 无 Project 任务                                                    | 在 Workspace/MyWork/Team 按正确归属显示，不强制放默认 Project                  | N03    | CI\_DB\_E2E             | NOT\_RUN |
| WORK08 | 列表 / 看板 / 计数 / 分页                                          | 相同过滤和 source，状态分组不丢子任务、不仅重排本页                            | N07    | CI\_DB\_E2E             | NOT\_RUN |
| VIEW01 | 保存 / 另存 / 同时编辑                                             | 内置不被覆盖；shared view version 冲突不静默最后写胜                           | N03    | CI\_DB\_E2E             | NOT\_RUN |
| VIEW02 | 分享 view 但无源任务权限                                           | 可见定义不增加任务 ACL；含私密引用的定义不泄漏元数据                           | N03    | CI\_SECURITY            | NOT\_RUN |
| VIEW03 | 共享 currentUser 过滤                                              | A/B 各看到各自可读的工作，不绑定创建者身份                                     | N03    | CI\_DB\_E2E             | NOT\_RUN |
| VIEW04 | 字段删除 / 未知 operator/AI 无效 AST                               | INVALID\_QUERY / 需修复，不删条件后返回全量                                    | N03    | CI\_SECURITY            | NOT\_RUN |
| VIEW05 | projectId null/empty/ 多 Team                                      | isNull 与空集合不同；跨 Team 同 Project 不重复 Task                            | N03    | CI\_DB                  | NOT\_RUN |
| VIEW06 | 相同排序值与非法 cursor                                            | 稳定 ID tie-break；queryHash 绑定；不死循环、不重置串 scope                    | N03    | CI\_DB                  | NOT\_RUN |
| VIEW07 | facet/count/export 权限                                            | 与列表共用约束；不可见实体名字 / 计数 / 导出无泄漏                             | N03    | CI\_SECURITY            | NOT\_RUN |
| VIEW08 | 跨 Team 看板拖动与 Done                                            | 精确状态歧义要求选择；原 TaskCommand 拒绝绕过交付 / 审核门禁                   | N08    | CI\_INTEGRATION         | NOT\_RUN |
| TRI01  | 历史导入与新进分诊                                                 | 旧 workflow 保留；accept 新任务不启动 Agent                                    | N03    | CI\_INTEGRATION         | NOT\_RUN |
| TRI02  | 转 Team 与人工并发修改                                             | 版本失败不覆盖；原 / 新规划范围触发正确且权限重新计算                          | N03    | CI\_INTEGRATION         | NOT\_RUN |
| TRI03  | 重复项 / 拒绝                                                      | 保留 canonical 关系和审计，不硬删除或自动合并执行历史                          | N03    | CI\_DB                  | NOT\_RUN |
| TRI04  | 跨 Team Project                                                    | 同一 Project ID，多团队导航不复制项目                                          | N08    | CI\_DB\_E2E             | NOT\_RUN |
| TRI05  | 非成员访问私密 Team 路径                                           | 页面 / API / 搜索均不暴露存在信息或其任务                                      | N08    | CI\_SECURITY            | NOT\_RUN |
| TRI06  | AI 建议禁用 / 超时 / 恶意 issue 正文                               | 基础分诊继续；不扩权限、不自动执行正文指令                                     | N03    | CI\_SECURITY            | NOT\_RUN |
| TRI07  | Cycle 仅骨架                                                       | 没有无效完整管理 tab；已有合法 cycle 可筛选且无伪统计                          | N08    | CI\_E2E                 | NOT\_RUN |
| TRI08  | 分诊命令事件重放                                                   | 一次事实修改，一次可幂等规划唤醒，无重复运行                                   | N03    | CI\_INTEGRATION         | NOT\_RUN |
| SEC01  | 通知 HTML/actionUrl 恶意内容                                       | sanitize/allowlist/typed target；不执行脚本或跳跨 scope 敏感路由               | N05    | CI\_SECURITY            | NOT\_RUN |
| SEC02  | SSE 订阅后撤权                                                     | 会话通知失效，下一读拒绝；广播无私密标题 / 参数                                | N04    | CI\_SECURITY            | NOT\_RUN |
| SEC03  | 快速切换账号 / Workspace                                           | 旧请求晚返回不能写入新 scope cache；退出清可读内容                             | N09    | CI\_E2E                 | NOT\_RUN |
| SEC04  | 未映射外部用户名 /mention                                          | 不凭同名发给本地人；身份未知不获审批权                                         | N04    | CI\_SECURITY            | NOT\_RUN |
| SEC05  | userId/workspace/cursor 伪造                                       | 上下文由服务端派生，跨租户拒绝；个人 null 模式唯一性正确                       | N04    | CI\_SECURITY            | NOT\_RUN |
| SEC06  | 失权后的历史通知与搜索统计                                         | 历史已发送也不可继续读标题；counts/facet 不泄漏                                | N04    | CI\_SECURITY            | NOT\_RUN |
| SEC07  | 清理通知与未决 source                                              | 不会删 actionApproval/Task 或伪造完成；重放窗口内 receipt 有效                 | N10    | CI\_DB                  | NOT\_RUN |
| SEC08  | 过大查询 / 批量 /rate                                              | 有界拒绝并解释，不能构造任意 SQL / 巨量外部 API / 批量批准                     | N03    | CI\_SECURITY            | NOT\_RUN |
| END01  | 旧 schema 升级与重复回填                                           | 旧 ID/read/archive/links 保留；重复执行不产生通知风暴                          | N10    | CI\_MIGRATION           | NOT\_RUN |
| END02  | 动作处理中关闭功能开关并回滚                                       | 原 source 待处理仍可达，不丢批准或重放已消费授权                               | N10    | CI\_INTEGRATION         | NOT\_RUN |
| END03  | CI 重复跳过与新 head                                               | 不把 skip 当实际执行通过；准确 head / 组合 tree 证据完整                       | N13    | CI\_REVIEW              | NOT\_RUN |
| END04  | 功能 PR 文档与退休边界                                             | 用户文档 / 接口 / 迁移 / 证据齐全；没有为了通过 gate 造空文档                  | N13    | CI\_REVIEW              | NOT\_RUN |
| END05  | 三 writer / 隔离环境 / 生产保护                                    | 不触保护目录、不本机编译测试、不用生产.env/debug proxy；CI 环境隔离            | N00    | STATIC\_AND\_CI\_REVIEW | NOT\_RUN |
| END06  | 真实 ACP 许可与补充输入闭环                                        | 拒绝不执行；有效允许到原 request 且只一次；原权限门禁保留                      | N12    | REAL\_APPROVED\_PREVIEW | NOT\_RUN |
| END07  | 真实 Linear/GitHub/PR 工作闭环                                     | 同步新 issue→正确人通知→CI 失败 / 审核→同 PR 修复→版本确认；不回写外部个人已读 | N12    | REAL\_APPROVED\_PREVIEW | NOT\_RUN |
| END08  | 规模与关键交互验收                                                 | 10 万任务 / 1 万通知合成 CI 查询计划无 N+1；Preview 主流程实际可完成           | N11    | CI\_SCALE\_AND\_PREVIEW | NOT\_RUN |
