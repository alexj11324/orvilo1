# 64项验收矩阵

这是测试合同，所有状态初始为 NOT_RUN。测试实现和执行都在 GitHub CI/获准隔离 Preview；本机不编译测试。真实外部验证不可用时标 BLOCKED，不用mock替代。每项记录源码SHA、组合tree、测试run、环境、实际断言、产物和reviewer。

| ID | 场景 | 期望结果 | 实现包 | 执行层 | 状态 |
|---|---|---|---|---|---|
| NAV01 | Web新增Inbox/My Work/Views且Tasks/Projects/Automation保持可达 | route与浏览器；图标/标题/deep-link对应同一个有效页面 | N09 | CI_E2E | NOT_RUN |
| NAV02 | Electron共同路由与原生通知点击 | 相同scope/object打开准确页面；没有Web存在Electron404 | N09 | CI_E2E | NOT_RUN |
| NAV03 | Mobile/PWA窄屏与键盘/触屏 | 预览返回保留滚动/选择；无hover-only按钮；读态正确 | N09 | CI_E2E | NOT_RUN |
| NAV04 | 个人模式 | 只有workspaceId=NULL自有通知/工作，无伪Team；旧个人消息可读 | N07 | CI_DB_E2E | NOT_RUN |
| NAV05 | 一Team与大量Teams | 不强制配置；搜索/更多可达200团队，私密不可见 | N08 | CI_E2E | NOT_RUN |
| NAV06 | 收藏两设备并发与目标失权 | 保留typed目标/顺序版本，不泄漏失效标题，不覆盖全部偏好 | N08 | CI_DB_E2E | NOT_RUN |
| NAV07 | CommandMenu搜索和输入焦点 | @me/scope权限正确；编辑器不被J/K等快捷键截获 | N09 | CI_E2E | NOT_RUN |
| NAV08 | 旧页面和退休面 | mine精准迁移；Task详情与scheduled不变；不复活provider/acceptance等入口 | N09 | CI_E2E | NOT_RUN |
| NOT01 | 同一canonical事件重复20次并收到provider回声 | 一个逻辑通知episode，只递增一次；保留真正不同事件 | N04 | CI_DB | NOT_RUN |
| NOT02 | 两个outbox消费者独立失败/成功 | 实时consumer成功不吞notification事件；重试只影响自己的回执 | N04 | CI_DB | NOT_RUN |
| NOT03 | 投影进程崩溃并恢复 | 业务已提交事件继续投递；不产生发送成功但落库失败的伪状态 | N04 | CI_INTEGRATION | NOT_RUN |
| NOT04 | shadow到live切换与旧producer同时存在 | shadow不发送；live只一个有效写入路径，无双卡/双邮件 | N10 | CI_INTEGRATION | NOT_RUN |
| NOT05 | 阅读v5时并发到达v6 | 只确认v5，v6仍未读；用户未打开的详情不被预取清已读 | N04 | CI_DB_E2E | NOT_RUN |
| NOT06 | 批量已读snapshot与晚提交事件 | cutoff之后的新消息不被清掉；小seq晚提交也不漏投影 | N04 | CI_DB | NOT_RUN |
| NOT07 | archiveAll处理未决审批 | 可以归档普通动态，不能让权威pending消失或改变任务状态 | N05 | CI_DB_E2E | NOT_RUN |
| NOT08 | snooze/到期/更紧急升级 | 只改变显示，不延长期限；恢复正确且计数有一致定义 | N04 | CI_DB_E2E | NOT_RUN |
| ACT01 | viewer整理自有通知但尝试任务/审批写 | markRead允许；编辑Task/approve禁止；无需message:create来清已读 | N05 | CI_SECURITY | NOT_RUN |
| ACT02 | 两页面同时批准同一request | source单次CAS消费，第二次已决定；不重复执行工具 | N05 | CI_INTEGRATION | NOT_RUN |
| ACT03 | 参数/需求/PR head版本改变后点击旧批准 | 返回STALE或EXPIRED，不能执行新参数/新head | N05 | CI_SECURITY | NOT_RUN |
| ACT04 | 审批后执行前权限撤销/epoch变更 | 执行端再校验并拒绝；UI不说已执行 | N05 | CI_INTEGRATION | NOT_RUN |
| ACT05 | 向Agent提供补充输入并断线重发 | 原input队列一个幂等输入，回执区分接收与消费 | N05 | CI_INTEGRATION | NOT_RUN |
| ACT06 | 新PR head与多reviewer | 旧审核不认可新head；相关请求正确重开且不制造第二个Task | N05 | CI_INTEGRATION | NOT_RUN |
| ACT07 | 外部决定成功响应丢失 | 同operationId核对/OUTCOME_UNKNOWN，不重复放行 | N05 | CI_INTEGRATION | NOT_RUN |
| ACT08 | 资源转移/邀请旧通知缺失或已归档 | 原有效request仍可发现处理，已过期不幽灵催办，outgoing不伪装待我批准 | N05 | CI_DB_E2E | NOT_RUN |
| WORK01 | 我负责 | 按assigneeUserId与权限，和通知存在/read无关 | N03 | CI_DB | NOT_RUN |
| WORK02 | 我委派 | 明确委派人；共享Agent代别人跑的任务不因agentOwner属于我进入 | N03 | CI_DB | NOT_RUN |
| WORK03 | 我创建 | 受管导入不冒充安装者；可验证on-behalf-of与未知分开 | N03 | CI_DB | NOT_RUN |
| WORK04 | 订阅和退订 | 任务订阅与聊天分开；退订不解除审核/负责人责任 | N03 | CI_DB | NOT_RUN |
| WORK05 | 待审核含无Task的PR | 只显示真实可读PR请求，不为了列表自动建Task | N07 | CI_INTEGRATION | NOT_RUN |
| WORK06 | 旧/tasks?collection=mine scope=created | 转到对应MyWork且保留workspace/过滤；scheduled路径不误转 | N07 | CI_E2E | NOT_RUN |
| WORK07 | 无Project任务 | 在Workspace/MyWork/Team按正确归属显示，不强制放默认Project | N03 | CI_DB_E2E | NOT_RUN |
| WORK08 | 列表/看板/计数/分页 | 相同过滤和source，状态分组不丢子任务、不仅重排本页 | N07 | CI_DB_E2E | NOT_RUN |
| VIEW01 | 保存/另存/同时编辑 | 内置不被覆盖；shared view version冲突不静默最后写胜 | N03 | CI_DB_E2E | NOT_RUN |
| VIEW02 | 分享view但无源任务权限 | 可见定义不增加任务ACL；含私密引用的定义不泄漏元数据 | N03 | CI_SECURITY | NOT_RUN |
| VIEW03 | 共享currentUser过滤 | A/B各看到各自可读的工作，不绑定创建者身份 | N03 | CI_DB_E2E | NOT_RUN |
| VIEW04 | 字段删除/未知operator/AI无效AST | INVALID_QUERY/需修复，不删条件后返回全量 | N03 | CI_SECURITY | NOT_RUN |
| VIEW05 | projectId null/empty/多Team | isNull与空集合不同；跨Team同Project不重复Task | N03 | CI_DB | NOT_RUN |
| VIEW06 | 相同排序值与非法cursor | 稳定ID tie-break；queryHash绑定；不死循环、不重置串scope | N03 | CI_DB | NOT_RUN |
| VIEW07 | facet/count/export权限 | 与列表共用约束；不可见实体名字/计数/导出无泄漏 | N03 | CI_SECURITY | NOT_RUN |
| VIEW08 | 跨Team看板拖动与Done | 精确状态歧义要求选择；原TaskCommand拒绝绕过交付/审核门禁 | N08 | CI_INTEGRATION | NOT_RUN |
| TRI01 | 历史导入与新进分诊 | 旧workflow保留；accept新任务不启动Agent | N03 | CI_INTEGRATION | NOT_RUN |
| TRI02 | 转Team与人工并发修改 | 版本失败不覆盖；原/新规划范围触发正确且权限重新计算 | N03 | CI_INTEGRATION | NOT_RUN |
| TRI03 | 重复项/拒绝 | 保留canonical关系和审计，不硬删除或自动合并执行历史 | N03 | CI_DB | NOT_RUN |
| TRI04 | 跨Team Project | 同一Project ID，多团队导航不复制项目 | N08 | CI_DB_E2E | NOT_RUN |
| TRI05 | 非成员访问私密Team路径 | 页面/API/搜索均不暴露存在信息或其任务 | N08 | CI_SECURITY | NOT_RUN |
| TRI06 | AI建议禁用/超时/恶意issue正文 | 基础分诊继续；不扩权限、不自动执行正文指令 | N03 | CI_SECURITY | NOT_RUN |
| TRI07 | Cycle仅骨架 | 没有无效完整管理tab；已有合法cycle可筛选且无伪统计 | N08 | CI_E2E | NOT_RUN |
| TRI08 | 分诊命令事件重放 | 一次事实修改，一次可幂等规划唤醒，无重复运行 | N03 | CI_INTEGRATION | NOT_RUN |
| SEC01 | 通知HTML/actionUrl恶意内容 | sanitize/allowlist/typed target；不执行脚本或跳跨scope敏感路由 | N05 | CI_SECURITY | NOT_RUN |
| SEC02 | SSE订阅后撤权 | 会话通知失效，下一读拒绝；广播无私密标题/参数 | N04 | CI_SECURITY | NOT_RUN |
| SEC03 | 快速切换账号/Workspace | 旧请求晚返回不能写入新scope cache；退出清可读内容 | N09 | CI_E2E | NOT_RUN |
| SEC04 | 未映射外部用户名/mention | 不凭同名发给本地人；身份未知不获审批权 | N04 | CI_SECURITY | NOT_RUN |
| SEC05 | userId/workspace/cursor伪造 | 上下文由服务端派生，跨租户拒绝；个人null模式唯一性正确 | N04 | CI_SECURITY | NOT_RUN |
| SEC06 | 失权后的历史通知与搜索统计 | 历史已发送也不可继续读标题；counts/facet不泄漏 | N04 | CI_SECURITY | NOT_RUN |
| SEC07 | 清理通知与未决source | 不会删actionApproval/Task或伪造完成；重放窗口内receipt有效 | N10 | CI_DB | NOT_RUN |
| SEC08 | 过大查询/批量/rate | 有界拒绝并解释，不能构造任意SQL/巨量外部API/批量批准 | N03 | CI_SECURITY | NOT_RUN |
| END01 | 旧schema升级与重复回填 | 旧ID/read/archive/links保留；重复执行不产生通知风暴 | N10 | CI_MIGRATION | NOT_RUN |
| END02 | 动作处理中关闭功能开关并回滚 | 原source待处理仍可达，不丢批准或重放已消费授权 | N10 | CI_INTEGRATION | NOT_RUN |
| END03 | CI重复跳过与新head | 不把skip当实际执行通过；准确head/组合tree证据完整 | N13 | CI_REVIEW | NOT_RUN |
| END04 | 功能PR文档与退休边界 | 用户文档/接口/迁移/证据齐全；没有为了通过gate造空文档 | N13 | CI_REVIEW | NOT_RUN |
| END05 | 三writer/隔离环境/生产保护 | 不触保护目录、不本机编译测试、不用生产.env/debug proxy；CI环境隔离 | N00 | STATIC_AND_CI_REVIEW | NOT_RUN |
| END06 | 真实ACP许可与补充输入闭环 | 拒绝不执行；有效允许到原request且只一次；原权限门禁保留 | N12 | REAL_APPROVED_PREVIEW | NOT_RUN |
| END07 | 真实Linear/GitHub/PR工作闭环 | 同步新issue→正确人通知→CI失败/审核→同PR修复→版本确认；不回写外部个人已读 | N12 | REAL_APPROVED_PREVIEW | NOT_RUN |
| END08 | 规模与关键交互验收 | 10万任务/1万通知合成CI查询计划无N+1；Preview主流程实际可完成 | N11 | CI_SCALE_AND_PREVIEW | NOT_RUN |
