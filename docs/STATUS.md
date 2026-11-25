# 文档状态与冲突清单

> 最近核对日期为 2026-11-25。本文记录当前代码、设计与验证状态。

## 如何阅读这套文档

1. [README](../README.md) 和[项目介绍](PROJECT_BRIEF.md)面向外部读者，只陈述已验证现状与明确的目标。
2. 本文记录实现边界、文档角色和冲突；[路线图](ROADMAP.md)是公开可追踪的后续计划。
3. [架构](ARCHITECTURE.md)、[UI 设计](UI_DESIGN.md)、[数据模型](DATA_MODEL.md)和[安全设计](SECURITY.md)描述目标方案。出现“将”“应”“MVP”时，不自动表示代码已实现。
4. [API 总表](API_REFERENCE.md)与源码用于核对当前可调用接口。日期更早的评估、规格、计划和评审保留为历史证据。

根目录 `Plan.md`、`UNFREEZE.md`、`ICON.md` 是本地台账。公开状态以本文和路线图为准。

## 当前实现快照

| 领域       | 已实现或已验证                                                                          | 仍需完成                                                                |
| ---------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 桌面阅读 | 默认学习区的目录导入、开发环境示例导入、目录型包 Markdown 阅读、最小会话恢复与章节滚动进度 | 学习区创建/切换界面、作者包图标加载与视觉验收 |
| 搜索       | 当前文件查找（定位、高亮、上/下跳转，纯函数位于 `packages/markdown/src/find.ts`）；核心遍历式学习区搜索保留为内部能力 | 包/学习区范围暂不可选；替换写入未开放 |
| 插件与环境 | 清单解析、依赖求解、纯逻辑权限求交、内部子进程宿主与实验标签关闭确认。主进程在启动前校验章节声明、活动插件、兼容版本和入口文件 | 运行时授权、官方 MySQL 插件、Windows 进程树回收和跨平台验收 |
| 数据与工具 | 进度与会话设置、实验历史自动记录与查看、数据库迁移、LabKit 内部校验与预览 | 完整运行日志、手动判定、LabKit CLI/pack、归档导入及下载器 |
| 质量 | Vitest、类型检查、lint 与开发构建纳入 CI | 真实 Electron 交互、安装包与跨平台验收 |

`workspace.db`/`package.db` 是逻辑名称。新建持久文件目前默认使用便携 JSON driver；已有 SQLite 文件仅在运行时支持 `node:sqlite` 时打开。详见[数据模型](DATA_MODEL.md)。

## 文档目录与状态

| 文档                                                                                    | 角色与当前解释                                                      |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [README](../README.md)、[项目介绍](PROJECT_BRIEF.md)                                    | 对外入口与宣传稿；必须区分现状和愿景                                |
| [总设计](../DESIGN.md)、[总览](OVERVIEW.md)                                             | 产品原则与目标读者；早期使用场景是愿景                              |
| [架构](ARCHITECTURE.md)、[UI](UI_DESIGN.md)、[安全](SECURITY.md)、[数据](DATA_MODEL.md) | 活跃设计；详见下表的未交付部分                                      |
| [路线图](ROADMAP.md)、[测试策略](TEST_STRATEGY.md)                                      | 当前后续顺序与验证范围；任务按退出标准推进                          |
| [API 总表](API_REFERENCE.md)、[插件开发](PLUGIN_DEVELOPMENT.md)                         | 当前内部接口/实验性插件边界；不是公开插件 SDK                       |
| [项目结构](PROJECT_STRUCTURE.md)                                                        | 语言与目录职责；其推荐树含计划节点，不是 `rg --files` 清单          |
| [第三方版权](../THIRD_PARTY_NOTICES.md)                                                 | 当前第三方素材归属，保留至对应资产被实际替换                        |
| [评估](EVALUATION.md)、[附录](APPENDIX.md)                                              | 2026-09-02/更早历史快照；附录含私人职业讨论和旧环境版本，不用于宣传 |
| [UI 原型说明](../apps/ui-prototype/README.md)、[两份评审](reviews/)                     | 原型运行说明与带日期的视觉反馈；原型数据不代表桌面应用数据          |
| [专项规格](superpowers/specs/)、[专项实施计划](superpowers/plans/)                      | 2026-09 的设计/任务历史；以本文和路线图判断今天是否仍适用           |
| 本地 `Plan.md`、`UNFREEZE.md`、`ICON.md`                                                | 未跟踪的迭代、决策与图标台账；公开内容在本文/路线图同步摘要         |

## 已确认的冲突与处理

| 主题             | 冲突证据                                                                                                                                | 当前结论与后续动作                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 学习区目录边界 | 旧实现可登记软连接与区外包，`workspace-db.ts` 保留 `links`/目标路径字段 | 2026-11-23：`registerPackage` 只接受学习区内真实目录（返回 `outside_workspace`/`symlink_not_allowed`），区外来源经 `importPackageIntoWorkspace` 复制后登记；旧数据库字段仅作兼容保留 |
| 搜索范围 | 早期方案采用遍历式学习区搜索 | renderer 提供当前文件查找与高亮。跨文件遍历保留为内部能力 |
| 实验入口与运行态 | 早期测试路径将打开实验视为开始运行 | 侧栏可打开实验标签。运行、关闭确认和历史记录发生于实验标签及宿主生命周期内 |
| 存储/技术栈      | 本次整理前的总设计和架构技术表笼统称 SQLite、markdown-it、electron-builder；实际依赖与[数据模型](DATA_MODEL.md)不同                     | 活跃文档已改为实际使用的 Electron/Preact、unified/remark/rehype、便携 driver；未装库只列候选 |
| 包和作者工具     | 早期架构稿叙述 `.labpkg` 双击导入、LabKit CLI/GUI；当前 loader 只读取目录、`pack` 未实现且无 CLI                                        | 目录型包为现状；归档与工具命令进入 M5，GUI 作者工具另行评估                                  |
| Markdown 能力    | 本次整理前的安全文档称可渲染原始 HTML 和嵌入资源；当前解析经 `rehype-sanitize`，没有 raw HTML 解析                                      | 当前仅声明基本 Markdown/GFM 与安全 HTML 输出；媒体、公式和扩展容器需单独实现与验证           |
| 图标来源         | [总设计](../DESIGN.md)要求自有图标，[第三方版权](../THIRD_PARTY_NOTICES.md)记录搜索图标直接使用 Codicons                                | 标为已署名的暂用资产；M5 替换为自有图形并在替换后更新版权说明，替换前不得称全部图标原创      |
| 内容编辑         | 总设计说核心不生产内容，[架构](ARCHITECTURE.md)曾讨论播放器内轻编辑和 GUI LabKit                                                        | 当前产品范围按“播放器 + 独立作者工具”；轻编辑是未决的后续探索，不在当前 MVP                  |
| 计划进度         | 本地 `Plan.md` 顶部旧状态说 Workbench 未完成、D 为下一步，其后又记录 D 纯逻辑和正式 UI 已接入                                           | 旧条目视为历史账；公开路线图重排从 M1 开始，并在本地计划添加现行索引                         |

## 决策状态

- **已确定的方向**：本地优先；实验包内容与运行环境分离；核心只协调插件能力；全局插件与当前包依赖闭包解析；阅读进度不受实验结果影响；不宣称 OS 级沙箱。
- **当前 MVP 交互**：查找只开放当前教程章节文件；实验卡片打开或聚焦标签；真正执行发生在标签内；关闭仍有专用进程时必须确认并回收，不能结束其他实验或共享依赖。
- **实验包图标设计**：列表默认包装盒，作者图标仅覆盖自己的包；无效或加载失败时回退默认。当前 `icon` 声明会被 manifest 校验器忽略，正式加载链路未实现，列入 M5。
- **尚未冻结**：插件宿主 IPC、权限资源 ID 与撤销语义、跨平台进程清理细节、`.labpkg` 版本/兼容策略、跨文件搜索启用时机、完整 UI 状态持久化和作者轻编辑。
- **推迟**：第三方插件 SDK/市场、云同步、GUI LabKit、多领域运行时、自动更新。

更细的本地决策 ID 在 `UNFREEZE.md` 中维护；公开计划只使用已经能独立验收的最小边界。需要代码调整的具体文件、前置条件和退出标准见[路线图](ROADMAP.md)。

## 本次实现核验依据

- 桌面版读取默认学习区，支持系统目录选择和开发样例导入。[App.tsx](../apps/desktop/src/renderer/App.tsx) · [WorkspacePackageList.tsx](../apps/desktop/src/renderer/components/navigation/WorkspacePackageList.tsx)
- 桌面查找匹配和高亮当前章节。核心保留遍历能力。[find.ts](../packages/markdown/src/find.ts) · [search.ts](../packages/core/src/search.ts)
- 实验标签支持说明、提示和历史。内部宿主可启动测试夹具并记录完成事件。LabKit 打包待实现。[ExperimentView.tsx](../apps/desktop/src/renderer/components/content/ExperimentView.tsx) · [execution.ipc.ts](../apps/desktop/src/main/ipc/execution.ipc.ts) · [pack.ts](../tools/labkit/src/pack.ts)
- 实际持久化路径分别由 [workspace-db.ts](../packages/core/src/database/workspace-db.ts)、[package-db.ts](../packages/core/src/database/package-db.ts)、[experiment-history.ts](../packages/core/src/experiment-history.ts) 决定；默认 driver 行为见[driver.ts](../packages/core/src/database/driver.ts)。
- Markdown 管线见[engine.ts](../packages/markdown/src/engine.ts)；当前第三方搜索图标归属见[版权说明](../THIRD_PARTY_NOTICES.md)。
