# 路线图

> 相关文档：[插件加载与 API 设计](superpowers/specs/2026-09-01-plugin-loading-and-scoped-permissions-design.md) · [依赖仓库与独立运行时](superpowers/specs/2026-09-02-dependency-repository-and-managed-runtimes-design.md) · [总览](OVERVIEW.md) · [架构设计](ARCHITECTURE.md) · [安全机制](SECURITY.md) · [数据模型](DATA_MODEL.md) · [测试策略](TEST_STRATEGY.md)
> 工程目录和语言边界见[项目结构与语言边界](PROJECT_STRUCTURE.md)。
>
> 目标：先做一个可靠的、由 MySQL 插件驱动的本地实验播放器，再从真实实现中提炼插件协议和生态能力。SQLite 只存 LearnLab 自身数据；其他专业环境同样通过插件接入。
> 当前基线：插件按“全局插件 + 当前实验包直接依赖及递归依赖链”解析；常见独立运行时从依赖仓库获取，小众运行时可以由实验包自带，但最终统一归档到学习区 `dependencies/`；系统级软件通过 `external_prerequisites` 由插件检测和交互；核心只提供配置 JSON 导入/导出，不实现云同步。

---

## 🚀 产品阶段

### Stage 0：技术 Spike

只验证 Electron/Preact、主进程与渲染进程通信、Markdown 渲染和本地实验包读取。不加载未知来源插件，不提供市场。

验收：打开一个本地实验包，读取 `manifest.yaml` 和章节 Markdown，并能展示实验卡片占位。

### Stage 0.5：核心解析基线

在接入真实插件前，先实现不依赖 UI 和数据库的纯逻辑边界：

- 解析 `AppContext`、`PackageContext` 和权限声明；
- 解析插件 `activation.mode`、`provides`、`requires_plugins`；
- 计算 `GlobalPlugins ∪ Closure(package.required_plugins)`；
- 对缺失、停用、不兼容、冲突和循环返回结构化状态；
- 解析包 `runtime_dependencies`、`external_prerequisites` 和可选的 `bundled-dependencies/`；
- 根据平台、架构、版本和 SHA-256 计算独立运行时实例；
- 规划从依赖源下载或从实验包导入，最终创建/复用当前学习区 `dependencies/` 的目标路径；
- 不在核心中自动安装系统级软件或执行实验包携带的安装脚本。

验收：用纯单元测试覆盖插件解析和依赖指纹，不启动 Electron、不需要 MySQL。

### Stage 1：MySQL MVP

只支持一个真实环境和少量真实内容：

- 导入本地目录或 `.labpkg`；
- 选择/新建/切换学习区；
- Markdown 阅读和当前学习区全文搜索；
- 官方 MySQL 插件通过独立插件宿主提供能力（暂不开放第三方动态插件）；
- 当前包插件按 `required_plugins` 和传递依赖加载；全局插件对所有包可用，缺失插件提示并允许只读阅读；
- MySQL 插件提供的环境预检；
- 支持 MySQL 独立运行时或用户系统 MySQL 两种模式；
- 依赖缺失时提示用户准备独立运行时或查看外部安装说明。
- 开始、运行、停止、重置；
- `mysql-schema` 分项判定；
- 已读进度和当前会话恢复；
- 基础错误提示和脱敏崩溃报告；
- 3～10 个真实 MySQL 实验。

MVP 暂不支持：第三方动态插件、源市场、云同步、GUI LabKit、多环境适配器、自动更新和完整国际化。

### Stage 2：自用 Alpha

- 笔记正文 Markdown 自动保存；
- 实验 `experiment_history` 展示和导出；
- 包校验和导入失败回滚；
- 工作区数据库与实验包数据库；
- 学习区 `dependencies/` 依赖目录和 `DependencyManager` 的共享/状态记录；
- 依赖源索引、平台/架构选择、下载校验和实验包 `bundled-dependencies/` 导入；
- 手动复制学习区 + 配置 JSON 的备份指引；
- 可配置的少量快捷键；
- `labkit validate/preview/pack`；
- Python 或 C++ 第二适配器，用于验证接口是否足够通用。

### Stage 3：插件 Beta

在 MVP 已验证的宿主边界上开放第三方插件：

- 插件发现、安装、停用和崩溃恢复；
- 白名单 API 和 `AppContext`/`PackageContext` 作用域；
- 读、写、执行三类权限及资源级细分；
- 插件 manifest：ID、版本、作者、签名、API 版本、激活模式和破坏性更新标识；
- 实验包的 `required_plugins`、插件传递依赖和兼容版本范围；
- 全局插件始终可用，但宿主进程支持按需启动；
- 插件崩溃恢复和执行监督；
- 最小 SDK、示例插件和契约测试。

### Stage 4：分享与生态

在前述协议稳定后，再考虑：

- 实验包 GitHub/自定义源发现与下载器；
- 包完整性校验；
- 实验包版本升级和回滚提示；
- GUI LabKit；
- 用户自定义同步插件；
- 社区作者信息、star、日志和许可证展示；
- AI 辅助提示。

---

## 📅 16 周开发计划（约 80 小时）

这里的 16 周是完成第一个可用产品闭环的目标窗口，不把所有生态功能承诺为 80 小时内完成。若核心闭环需要更长时间，优先延长周期，不牺牲可靠性；后续功能按版本逐步发布，自动更新/OTA 机制本身不属于 MVP，后续可随版本发布策略逐步加入。

| 周期 | 目标 | 交付物 |
|:---:|:---|:---|
| W1 | Electron + TypeScript 基础 | 窗口、开发脚本、最小 README |
| W2 | 主进程/渲染进程通信 | 安全 preload、最小 IPC |
| W3 | VSCode Workbench UI 骨架 | Activity Bar、主侧边栏、标签页、中央阅读区、状态栏 |
| W4 | Markdown 阅读 | 代码块、旁注、公式占位 |
| W5 | 包格式 v0 | `manifest.yaml`、Schema 校验、目录导入 |
| W6 | 学习区和依赖 | `workspace.db`、包列表、切换、最近打开、`dependencies/` 和独立运行时记录 |
| W7 | 插件解析和官方 MySQL 插件原型 | `AppContext`/`PackageContext`、全局/包级解析、独立宿主、预检、会话、执行、停止、重置 |
| W8 | 执行监督 | 超时、输出上限、进程清理 |
| W9 | 判定器 | `mysql-schema`、分项反馈 |
| W10 | 进度和恢复 | `package.db`、滚动到底标记已读 |
| W11 | 真实内容 | 3 个可完整完成的 MySQL 实验 |
| W12 | 历史和诊断 | `experiment_history`、脱敏报告 |
| W13 | 笔记和搜索 | Markdown 笔记、当前学习区全文搜索 |
| W14 | 导入/导出 | `.labpkg`、完整性校验、失败回滚 |
| W15 | 测试和跨平台记录 | 黄金路径测试、平台问题清单 |
| W16 | 自评和发布材料 | README、截图、已知限制 |

如果某周时间不足，优先级依次为：**能读 → 能跑 → 能判 → 能保存 → 能解释错误**。插件市场和 LabKit 不得挤占这条闭环。

---

## 🧭 当前最小可开工范围

为了避免 UI、Electron、数据库和插件协议互相阻塞，建议按以下顺序开工：

1. **纯数据类型与解析器**：`core-types` 中定义 package/plugin manifest、权限、激活模式和解析结果；先用固定对象测试，不接文件系统。
2. **纯插件解析器**：实现插件 ID/版本范围、全局插件、当前包直接依赖、递归依赖、缺失/冲突/循环状态；不启动宿主。
3. **纯依赖路径管理**：实现依赖 ID、版本、平台、架构和 SHA-256 的实例键及 `<workspace>/dependencies/<dependency-id>/<version>/<platform>-<arch>/<sha256>` 路径计算；下载/导入动作之后再接。
4. **实验包只读播放器**：实现 manifest/章节读取、当前学习区注册、当前学习区全文搜索和阅读进度；插件先只返回缺失提示。
5. **官方插件宿主**：接入一个最小 MySQL 插件，验证权限求交、当前包作用域和执行监督；再逐步开放 UI 注册。
6. **数据库持久化**：最后冻结 `workspace.db`/`package.db` 的 migration 和读写边界，不为插件另加数据库。

这条顺序的关键是：**插件解析器和包阅读器可以先独立完成；真正执行环境、UI 扩展和数据库都不是第一步阻塞项。**

---

## 🎯 难度评估

| 组件 | 难度 | 说明 |
|:---|:---:|:---|
| Electron/Preact 骨架 | ⭐⭐ | 模板简单，但 IPC 安全不能跳过 |
| Markdown 阅读 | ⭐ | 先限制扩展范围 |
| 包格式和 Schema | ⭐⭐ | 需要稳定 ID、版本和路径校验 |
| 学习区/包数据库 | ⭐⭐⭐ | 两层数据库和移动限制需要明确 |
| MySQL 适配器 | ⭐⭐⭐ | 会话、重置、平台和错误处理 |
| 执行监督 | ⭐⭐⭐⭐ | 超时、进程树和跨平台回收是难点 |
| 插件宿主 | ⭐⭐⭐⭐ | 独立进程、IPC 和作用域 API |
| GUI LabKit | ⭐⭐⭐⭐ | 先用 CLI 验证需求 |
| 市场/源机制 | ⭐⭐⭐ | 下载、校验、失败恢复；不做复杂评级 |

---

## 🔧 技术决策

| 项目 | 决策 |
|:---|:---|
| 桌面壳 | Electron |
| 主线语言 | TypeScript |
| 前端 | Preact + TypeScript |
| 构建 | electron-vite + electron-builder |
| Markdown | markdown-it + 有限标准扩展 |
| 终端 | xterm.js + node-pty，由插件提供 |
| 数据 | `config.json` + 学习区 `workspace.db` + 实验包 `package.db` + Markdown/历史文件 |
| 插件宿主 | 独立宿主进程 + 白名单 API；不把 Node `vm` 当成安全边界 |
| C++ 接入 | 独立 CLI 子进程，不使用 N-API |
| 自动更新 | 暂不上 |
| 国际化 | MVP 先中文，保留文案抽取结构 |
| 仓库 | 可使用 monorepo；插件和实验包在发布和版本上独立 |
