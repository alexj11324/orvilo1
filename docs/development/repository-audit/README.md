# 初始快照 → 当前实现：差异与一致性审计

本报告区分**全量文件枚举**与**经过源码验证的语义问题**。文件级台账完整；不能把它当作对数百万行改动、每条产品路径均已完成语义证明。下列已确认冲突已在本轮工作区清理，并增加针对性检查。

## 基准与覆盖边界

- 初始可达提交：`cfa85e6deea45a9a8a4971003ee2f659eff0b4b3`，2026-09-14，提交标题为 `chore: rebrand to Orvilo and rename workspace packages to @orvilo/*`。
- 本轮开始时 HEAD：`6996af3d3c27f590220902e0fbda261b18e6b6c8`。
- 仓库不是浅克隆，只有上述一个根提交。根提交**已包含 Orvilo 品牌与包名迁移**；本地没有迁移前原始 LobeHub 树，不能伪称完成了与该缺失版本的对照。
- 两提交之间有 3,622 条提交记录。前后树共涉及 21,288 个不同路径：新增 4,593、修改 6,755、删除 2,868、不变 7,072。当前树 18,420 个跟踪路径。
- 使用 `--no-renames` 等价口径：重命名拆成删除和新增，避免大型仓库的 renameLimit 启发式漏报。二进制、模式变更、符号链接与子模块条目保留在文件台账中。
- 字面量环境变量引用共 799 个名字：新增引用 87、消失引用 121、两版本均有引用 591。当前项目级 SKILL.md 有 59 份；builtin skills 及其变更另见文件台账的 `skills` 类别。
- 以上数字对应固定历史提交，**不含本轮未提交的修复**。当前修复用 `git diff` 查看，不覆盖历史台账。

## 全量附件与复跑

| 附件                                  | 内容                                                       |
| ------------------------------------- | ---------------------------------------------------------- |
| [files.tsv](files.tsv)                | 全部前后路径、状态、分类、文件模式与 blob ID，包括不变文件 |
| [commits.tsv](commits.tsv)            | 两基准间完整提交列表，供逐项追溯功能演进                   |
| [environment.json](environment.json)  | 环境变量名字与前后读取位置，不输出变量值                   |
| [skills.tsv](skills.tsv)              | 所有项目级 skill 的前后存在状态                            |
| [summary.json](summary.json)          | 机器可读统计与方法限制                                     |
| [现有能力清点](../slimming/CENSUS.md) | 当前能力归属、退役边界与依赖闭包；由既有 census 工具生成   |

```bash
node scripts/repositoryAudit.mjs \
  cfa85e6deea45a9a8a4971003ee2f659eff0b4b3 \
  6996af3d3c27f590220902e0fbda261b18e6b6c8 \
  docs/development/repository-audit

# 任意文件的全部源码差异，包括局部变量、函数与类型变化
# 将 path/to/file 替换为 files.tsv 中的路径。
git diff --no-ext-diff --no-renames \
  cfa85e6deea45a9a8a4971003ee2f659eff0b4b3 \
  6996af3d3c27f590220902e0fbda261b18e6b6c8 -- path/to/file

node scripts/ci/checkRepositoryContracts.mjs
node scripts/slimming/census.mjs --check
```

变量扫描覆盖 JS/TS 中的显式 `process.env.X`、`process.env['X']` 和 `import.meta.env.X`，排除测试文件和 tests/e2e/vendor 根目录；注释也可能被匹配。动态拼接变量、解构、shell/SDK 自行读取的变量不在此覆盖范围。因此 “消失引用” 不是自动删除依据，不能据此删除代理、模型配置、SDK 或构建变量。普通局部变量的完整前后内容由文件 blob 与上述 diff 提供，不把正则抽取当作符号级证明。

## 按影响排序的已确认冲突与处理

| 优先级 | 冲突与影响                                                                                                                                  | 当前实现依据                                                                                         | 本轮处理                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | Compose 带有所有用户共享的示例 RSA 私钥；照抄模板会共享签名身份（初始快照已存在）                                                           | `JWKS_KEY` 用于 OIDC、内部 JWT 和新增协作网关验证                                                    | 两语言模板移除固定私钥，要求启动前生成部署专属密钥；setup 提示同步，配置回归测试覆盖                                                                                    |
| P1     | 主 Compose / Grafana 示例仍沿用 Better Auth / Casdoor，Grafana 的 `AUTH_URL` 还会触发启动拒绝；无法按现行 Clerk 链登录                      | `packages/env/src/auth.ts`、`apps/server/src/services/auth/`                                         | 同步四份 Compose 环境模板、根环境模板与 Dockerfile；Grafana 移除 Casdoor 服务 / 依赖 / 探测，接入 Clerk；移除硬编码 key-vault 值                                        |
| P1     | Hatchet worker 缺少协作网关内部 URL，按仅代理 `/collaboration` 的部署方式无法可靠投递 `/internal/publish`                                   | `apps/server/src/hatchet/collaborationOutbox.ts`、房间 publisher                                     | worker 配置与 web producer 统一为内部 gateway 地址，增加 Compose 回归断言                                                                                               |
| P2     | Docker prebuild 要求已不使用的 `AUTH_SECRET`；旧变量诊断指向被移除的 Better Auth，运维会沿错误路径 “修复”                                   | 当前 Clerk runtime；`scripts/serverLauncher/startServer.js` 复用诊断                                 | 取消旧构建必填；旧 Better Auth 参数仅输出迁移提示，不阻断已有部署；仍保留有效的密钥库构建检查、NextAuth/ACCESS_CODE 等原有拒绝边界；不要求构建阶段注入 Clerk 运行时密钥 |
| P2     | 生成脚本输出 `OIDC_JWKS_KEY`，实际要求 `JWKS_KEY`，复制结果会被启动诊断拒绝                                                                 | `packages/env/src/auth.ts`                                                                           | 更正生成器提示及变量名；测试生成结果可导入为 RSA 私钥                                                                                                                   |
| P2     | 文档称会话默认 30 天、旧 cookie 继续有效，skill 又要求明文 token 插入；与 7 天 idle / 30 天 absolute、哈希 token、Clerk 绑定检查冲突        | `packages/database/src/models/authSession.ts`、`apps/server/src/services/auth/session.ts`            | 中英认证说明、环境模板、验收 skill 统一；删除不存在的 `AUTH_COOKIE_PREFIX` 配置章节；使用现有 seed helper；纠正 signout 仅清理当前 app cookie 的描述                    |
| P2     | 自托管入口宣称无需认证或反代可替代登录，当前应用要求 Clerk app session                                                                      | 当前 session resolution /protected routes                                                            | 删除 “开放访问” 支持承诺；说明反代只能增加外层控制                                                                                                                      |
| P2     | Upstash skill 继续给出 QStash 三层路由、失效示例与云端覆写实现，容易重建第二套队列                                                          | `src/libs/hatchet/`、`apps/server/src/hatchet/`、Hatchet task names                                  | 保留旧 skill slug 作为兼容入口，正文与四份参考统一到 Hatchet；移除旧导入与实现模板                                                                                      |
| P2     | CLI skill 广告已删除的 model/provider/skill 命令和 text/image/video/TTS generation；实际 generate 仅注册 ASR                                | `apps/cli/src/program.ts`、`commands/generate/index.ts`                                              | 更新命令表、构建器和引用；退役文档保留明确入口说明，不恢复已删接口                                                                                                      |
| P2     | Messenger 验收 skill 仍引导驱动已删除的 BlueBubbles IPC、IM bot adapters                                                                    | 现存 Slack integration 与 Messenger 退役记录                                                         | 关闭该历史 skill 隐式调用，各平台页标为历史；当前 Slack 定位到新实现，保留历史脚本以供追溯                                                                              |
| P2     | hooks/tracing/ 路由 / IPC / 用户快照 skills 指向已删代码；机械改路径还会错误声称旧记录器仍在当前执行链上                                    | 当前 hetero dispatch、HeteroTraceRecorder、共享 runtime、SessionAuth、IPC types 目录                 | 修正归属和适用范围；不再将旧 server step tracing 描述为当前路径；移除 `/page` 和 SkillStore 失效示例                                                                    |
| P2     | 项目概览仍要求 react-router-dom 和 antd 控件优先，与已安装路由包和本地 ReUI 约定冲突                                                        | `package.json`、`react` skill、`DESIGN.md`                                                           | 修正 AGENTS / 概览，组件选择回到既有 owner；校正 Vitest 配置扩展名与 CLI/compliance 路径                                                                                |
| P2     | Market secret 注释要求 64 字符 hex，但 schema 要求 83 字符；数据库 driver 示例缺失，CSP 默认值文字自相矛盾；BFL/FAL 示例已无对应 env schema | `packages/env/src/app.ts`、`packages/app-config/src/db.ts`、Next CSP 开关、`packages/env/src/llm.ts` | 按实际 schema 修正文档，补 driver 说明，删除无效的 BFL/FAL 环境配置示例；未改变运行时校验规则                                                                           |
| P2     | 历史执行记录中的 “当前” 覆盖现代认证 / 队列约定，README 缺 Bun 前置条件                                                                     | 当前代码、AGENTS、package scripts                                                                    | 给已确认过时的实施记录标注基准语义，更新 ledger 认证名称与 README 前置条件，集中链接本报告                                                                              |

P1 表示会破坏部署、身份边界或服务投递的配置冲突；P2 表示确定的操作指引 / 开发约定漂移。不把所有历史差异都标为缺陷，也没有将未经验证的候选标为已修复。

## 主要演进与保留边界

- 产品从初始聊天 / 工作台集合收敛为任务、工作区、Agent 执行与验证链。已退役产品面的路由、stores、CLI、工具和 locale 删除是有意演进；是否保留以 `scripts/slimming/boundary.json` 和当前调用链为准。
- 认证从初始 Better Auth 迁移为 Clerk accounts portal + 本地 app session + OIDC。历史数据库字段、迁移文件、旧数据归属仍须保留；本轮未删数据库历史或改用户数据。
- 队列迁为 Hatchet，Agent / 设备 / 异构执行、协作与 GitHub/Linear/Slack 集成分属当前服务和共享包。不能根据旧 Messenger 或 Upstash 说明重建并行系统。
- UI 向本地 ReUI/shadcn primitives/adapters 和统一设计角色迁移；仍保留的 `@lobehub/ui` 能力与其它第三方 `@lobehub/*` 包不是品牌遗漏，不能全局替换包名。
- Electron/CLI 协议、持久化身份、历史数据与第三方资源中的兼容字符串应逐调用链判断；本轮没有做盲目全仓改名。
- 文件差异分类如下（测试和文档优先单列，故 backend/web 等数字不包含其全部测试文件）。

| 类别                  | 新增 | 修改 | 删除 | 不变 |
| --------------------- | ---: | ---: | ---: | ---: |
| documentation         | 1062 |  353 |  216 |  106 |
| other                 |  600 |   93 |   37 |  213 |
| tests                 |  938 | 1380 |  549 | 1592 |
| configuration-tooling |  117 |  102 |   22 |  111 |
| skills                |  147 |  122 |   51 |  134 |
| cli                   |    7 |   71 |   19 |   52 |
| desktop               |    2 |  162 |   22 |  161 |
| backend               |  256 |  415 |  326 |  298 |
| localization          |    4 |  532 |  114 |  390 |
| shared-packages       |  218 | 1027 |  246 | 1818 |
| database              |  189 |  177 |   14 |  437 |
| web                   | 1053 | 2321 | 1252 | 1760 |

## 验证与防回归

- 新认证诊断测试在修复前复现 3 个失败，修复后通过。
- 定向 Vitest：`scripts/_shared/checkDeprecatedAuth.test.ts`、`scripts/dockerComposeDeploy.test.ts`，29 项通过；包括 Hatchet worker 实际打包加载检查。
- Node 测试：审计器、契约检查器、prebuild 和 JWKS 生成器，共 7 项通过。审计器测试在临时 Git 仓库验证新增 / 修改 / 删除 / 不变、变量增删、忽略未提交状态、不给出变量值和拒绝反向基准。
- 现有 slimming census：13,814 个源码文件，114 个 workspace 包，0 个 DELETE 能力存在未解释入边；工作区依赖名字核查未发现缺失的 `workspace:*` 包。
- `checkRepositoryContracts.mjs` 覆盖本次修复的认证模板、路由包指引、CLI 退役命令和工作流 owner；其规则及审计器测试接入 Test CI 的 boundary job，认证工具测试接入已有依赖安装后的 job。AGENTS 文档、skills、环境模板和 Compose 修改也能触发相关 gate；普通 docs/README 修改不单独触发该 job。
- 修改的 JS/TS 脚本已通过 ESLint；Bash setup 语法检查与 `git diff --check` 通过。环境未提供 Bun，未运行 `bun run check` 包装器，使用已安装的本地 ESLint/Vitest/Node 执行上述定向检查。
- 全仓类型检查仍由已有 CI job 执行，遵守仓库 “不在本地跑全仓 typecheck” 的规则。本轮没有宣称它已经通过。
- 没有启动生产服务、修改实际密钥、运行数据库迁移或进行真实 Clerk / 外部 Hatchet/Electron 全链路验收。Compose/YAML 测试与打包加载不能替代这些部署验证。
- 独立审查：初轮及一次修复复核完成，原四组发现均确认解决，未发现新增发布阻断问题。复核指出的邮箱验证标志文案残留已修正。后续清理又去掉启动诊断里把 SMTP/Resend 当成注册邮箱校验、并要求设置 `AUTH_EMAIL_VERIFICATION` 的提示；该标志只转发给账户门户，实际校验在 Clerk。Grafana 中文示例中的 Casdoor 配置注释，以及已不再挂载的 `docker-compose/production/grafana/init_data.json`，也已删除。

## 未覆盖事项与使用限制

1. 缺少品牌迁移前原始 LobeHub 的 commit/tree，不能恢复该版本与根提交之间的真实源码差异；需要确切 upstream SHA 或原始树才能继续这一段对照。
2. 全量文件枚举不等于全量语义证明。普通局部变量 / 类型的完整内容可以逐文件 diff，但没有声称所有行为组合都测试过。
3. Env 引用扫描不是配置完备性验证；例如 HTTP_PROXY/HTTPS_PROXY 可能由 SDK 使用，模型变量也可能动态生成，不应据静态扫描删除。
4. 历史文档、研究资料、vendored 源码、旧迁移保留来源语义；本轮已修正确认有误的当前入口，未对所有外部链接、历史截图或每份参考资料做语义重写。
5. 现有私有部署是否用了示例签名密钥、如何切换 Clerk 实例、worker 是否能连通内部 gateway，均不能从仓库确定。本轮只修正新部署模板；已部署实例的密钥轮换、会话重新登录和服务发布需要独立部署验证，未自动执行。
6. 新 gate 是有明确范围的防回归约束，不是 “未来所有实现永不冲突” 的保证。新功能修改 owner 时应同步其文档、模板与契约检查。
