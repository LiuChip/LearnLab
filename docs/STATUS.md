# 文档状态与冲突清单

> 核对日期：2026-10-01。本文是**文档阅读导航与实现核对**；设计目标与已交付能力分别标注。所述测试基线来自当日工作树，不代表发布包验收。

## 如何阅读这套文档

1. [README](../README.md) 和[项目介绍](PROJECT_BRIEF.md)面向外部读者，只陈述已验证现状与明确的目标。
2. 本文记录实现边界、文档角色和冲突；[路线图](ROADMAP.md)是公开可追踪的后续计划。
3. [架构](ARCHITECTURE.md)、[UI 设计](UI_DESIGN.md)、[数据模型](DATA_MODEL.md)和[安全设计](SECURITY.md)描述目标方案。出现“将”“应”“MVP”时，不自动表示代码已实现。
4. [API 总表](API_REFERENCE.md)与源码用于核对当前可调用接口。日期更早的评估、规格、计划和评审保留为历史证据。

根目录 `Plan.md`、`UNFREEZE.md`、`ICON.md` 是被 `.gitignore` 排除的**本地工作台账**，公开仓库的读者可能无法取得；本文和公开路线图提供必要的状态摘要。工作树中未提交的 `ARCHITECTURE.md`、`UI_DESIGN.md` 编辑包含 2026-09-30 至 10-01 的较新决定，本次整理保留了它们。设计发生变化时，先核实源码，再更新相关专题、本文、路线图和 README。

## 当前实现快照

| 领域       | 已实现或已验证                                                                          | 仍需完成                                                                |
| ---------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 桌面阅读   | Electron/Preact 工作台；默认学习区已登记包列表；目录型包、章节 Markdown、标签和阅读进度 | 界面包导入/学习区切换、首次使用路径、完整会话恢复及用户视觉验收         |
| 搜索       | 核心遍历式学习区搜索；正式 renderer 接入该能力、实时输入与防抖                          | 现行设计的当前文件查找/定位/高亮；包/学习区范围暂不可选；替换写入未开放 |
| 插件与环境 | manifest/注册表/依赖解析、实验性上下文和纯逻辑权限求交；依赖安全导入与记录              | 真正的插件代码宿主、运行时授权、执行监督、MySQL 插件与判定器            |
| 数据与工具 | 配置 JSON 导入导出、阅读进度、实验历史存储模块、数据库迁移；LabKit 校验/预览模块        | 实验历史 UI、LabKit CLI/pack、`.labpkg` 归档导入、仓库下载器            |
| 质量       | 当前工作树 `pnpm test:run`：26 个文件、123 项测试；`typecheck`、`lint`、`build` 通过    | Electron 安装包、真实实验端到端、跨平台进程回收与视觉验收               |

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
| 搜索范围         | 本次整理前的路线图、测试策略及数据模型要求 MVP 工作区全文索引；较新的[UI 设计](UI_DESIGN.md)限定当前文件查找，renderer 仍调用工作区搜索 | 本次已统一活跃文档；核心遍历搜索保留，renderer 的范围/定位修改列入 M1；索引只是未来可选缓存  |
| 实验入口与运行态 | 旧测试路径写“开始实验”，最新[架构](ARCHITECTURE.md)与[UI 设计](UI_DESIGN.md)定义卡片“打开实验”仅开标签，且不展示全局运行态              | M2/M3 分开实现打开、执行、判定和标签关闭守卫；每次尝试的持久结果不等于全局运行状态           |
| 存储/技术栈      | 本次整理前的总设计和架构技术表笼统称 SQLite、markdown-it、electron-builder；实际依赖与[数据模型](DATA_MODEL.md)不同                     | 活跃文档已改为实际使用的 Electron/Preact、unified/remark/rehype、便携 driver；未装库只列候选 |
| 包和作者工具     | 早期架构稿叙述 `.labpkg` 双击导入、LabKit CLI/GUI；当前 loader 只读取目录、`pack` 未实现且无 CLI                                        | 目录型包为现状；归档与工具命令进入 M5，GUI 作者工具另行评估                                  |
| Markdown 能力    | 本次整理前的安全文档称可渲染原始 HTML 和嵌入资源；当前解析经 `rehype-sanitize`，没有 raw HTML 解析                                      | 当前仅声明基本 Markdown/GFM 与安全 HTML 输出；媒体、公式和扩展容器需单独实现与验证           |
| 图标来源         | [总设计](../DESIGN.md)要求自有图标，[第三方版权](../THIRD_PARTY_NOTICES.md)记录搜索图标直接使用 Codicons                                | 标为已署名的暂用资产；M5 替换为自有图形并在替换后更新版权说明，替换前不得称全部图标原创      |
| 内容编辑         | 总设计说核心不生产内容，[架构](ARCHITECTURE.md)曾讨论播放器内轻编辑和 GUI LabKit                                                        | 当前产品范围按“播放器 + 独立作者工具”；轻编辑是未决的后续探索，不在当前 MVP                  |
| 计划进度         | 本地 `Plan.md` 顶部旧状态说 Workbench 未完成、D 为下一步，其后又记录 D 纯逻辑和正式 UI 已接入                                           | 旧条目视为历史账；公开路线图重排从 M1 开始，并在本地计划添加现行索引                         |

## 决策状态

- **已确定的方向**：本地优先；实验包内容与运行环境分离；核心只协调插件能力；全局插件与当前包依赖闭包解析；阅读进度不受实验结果影响；不宣称 OS 级沙箱。
- **当前 MVP 交互**：查找只开放当前教程章节文件；实验卡片打开或聚焦标签；真正执行发生在标签内；关闭仍有专用进程时必须确认并回收，不能结束其他实验或共享依赖。
- **尚未冻结**：插件宿主 IPC、权限资源 ID 与撤销语义、跨平台进程清理细节、`.labpkg` 版本/兼容策略、跨文件搜索启用时机、完整 UI 状态持久化和作者轻编辑。
- **推迟**：第三方插件 SDK/市场、云同步、GUI LabKit、多领域运行时、自动更新。

更细的本地决策 ID 在 `UNFREEZE.md` 中维护；公开计划只使用已经能独立验收的最小边界。需要代码调整的具体文件、前置条件和退出标准见[路线图](ROADMAP.md)。

## 本次实现核验依据

- 正式桌面版读取默认学习区和已登记包：[App.tsx](../apps/desktop/src/renderer/App.tsx)；当前包列表只有选择入口：[WorkspacePackageList.tsx](../apps/desktop/src/renderer/components/navigation/WorkspacePackageList.tsx)。
- 当前搜索由核心遍历实现：[search.ts](../packages/core/src/search.ts)；renderer 的搜索入口仍调用学习区范围：[readingStore.ts](../apps/desktop/src/renderer/stores/readingStore.ts)、[SearchReplaceView.tsx](../apps/desktop/src/renderer/components/navigation/SearchReplaceView.tsx)。
- 实验视图仍是占位：[ExperimentList.tsx](../apps/desktop/src/renderer/components/navigation/ExperimentList.tsx)；LabKit 的打包未实现：[pack.ts](../tools/labkit/src/pack.ts)；当前插件开发边界见[插件开发文档](PLUGIN_DEVELOPMENT.md)。
- 实际持久化路径分别由 [workspace-db.ts](../packages/core/src/database/workspace-db.ts)、[package-db.ts](../packages/core/src/database/package-db.ts)、[experiment-history.ts](../packages/core/src/experiment-history.ts) 决定；默认 driver 行为见[driver.ts](../packages/core/src/database/driver.ts)。
- Markdown 管线见[engine.ts](../packages/markdown/src/engine.ts)；当前第三方搜索图标归属见[版权说明](../THIRD_PARTY_NOTICES.md)。
