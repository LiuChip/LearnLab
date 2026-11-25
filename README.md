# LearnLab

[![CI](https://github.com/LiuChip/LearnLab/actions/workflows/ci.yml/badge.svg)](https://github.com/LiuChip/LearnLab/actions/workflows/ci.yml)

**本地交互式实验浏览器，处于早期开发阶段。** LearnLab 希望把教程、练习和反馈组织成可分享的实验包：学习者在同一桌面工作台阅读内容、动手实验，作者用独立的工具和插件提供内容与环境。

> 2026-11-25 开发基线。桌面版已接入默认学习区的目录导入、章节阅读与查找、最小阅读会话恢复，以及实验标签与尝试历史。内部子进程宿主可执行测试夹具，真实 MySQL 课程、运行时授权和分发能力仍在开发。

## 当前能体验什么

| 已实现的开发基线                                                     | 尚未开放的产品链路                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Electron/Preact 工作台：章节、标签、侧栏、搜索、插件与依赖状态、通知 | 创建、打开和切换学习区，以及完整首次使用引导              |
| 加载已登记的本地目录型实验包，阅读 Markdown 并记录章节进度           | `.labpkg` 打包/导入、课程源与运行时下载                     |
| 解析全局/包级插件依赖，报告缺失或不兼容状态；纯逻辑权限求交          | 运行时授权、真实 MySQL 实验与判定      |
| 从系统目录选择框导入本地实验包（复制进学习区后登记）；当前章节内查找、高亮与上/下跳转 | 实验包/学习区范围查找、替换写入暂不开放 |

桌面应用默认打开本地学习区。首次打开空学习区时，可从侧栏导入本地实验包。源码开发环境另提供示例导入入口。独立 UI 原型使用模拟数据，用于布局评审。

## 从源码启动

需要 Node.js 和 pnpm；本仓库已在 Node.js 22.23.2、pnpm 12.6.0 的开发环境验证。当前没有预编译安装包或稳定版本承诺。

```bash
pnpm install
pnpm dev
```

如果启动时报 `Electron uninstall` 或 Electron 缺少 `dist/path.txt`，说明本机 Electron 安装脚本没有完成。运行 `pnpm rebuild electron` 后再启动；若官方下载连接失败，可临时使用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm rebuild electron`。这只修复本机依赖，不更改项目锁定的 Electron 版本。

查看独立 UI 原型（模拟数据）：

```bash
pnpm --filter @learnlab/ui-prototype dev
```

常用检查：`pnpm test:run`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。`pnpm build` 生成开发构建，不等于完成桌面安装包或跨平台发布验证。

## 项目如何组织

- `apps/desktop`：Electron 主进程、受控 preload、Preact 工作台。
- `packages/core`、`core-types`、`markdown`：实验包、学习区、进度、插件解析及内容渲染逻辑。
- `apps/ui-prototype`：使用模拟数据的独立视觉与交互原型。
- `tools/labkit`：实验包校验/预览的内部模块；CLI 与打包命令尚未提供。
- `examples/packages/sql-intro`：开发和测试使用的目录型示例包。
- `plugins`、`packages/plugin-sdk`：官方插件占位与实验性 SDK 类型。

LearnLab 的方向是**本地优先、内容与运行环境分离**。实验包描述课程和依赖；实际环境及判定能力将由受控插件提供。当前“插件权限”只有解析与求交逻辑，不能被当作已部署的沙箱或运行时授权。

## 接下来

继续完善插件运行时授权、专用进程回收和跨平台验收，然后走通首个 MySQL 实验，再推进作者工具和分发。[路线图](docs/ROADMAP.md)

## 文档

- [项目宣传与介绍](docs/PROJECT_BRIEF.md)：面向学习者、内容作者和合作者的完整说明。
- [文档状态与冲突清单](docs/STATUS.md)：当前实现、设计决策、历史稿与冲突处理。
- [产品总览](docs/OVERVIEW.md)、[架构](docs/ARCHITECTURE.md)、[UI 设计](docs/UI_DESIGN.md)。
- [API 现状](docs/API_REFERENCE.md)、[插件开发边界](docs/PLUGIN_DEVELOPMENT.md)、[安全设计](docs/SECURITY.md)。

历史规格和原型计划保留在 `docs/superpowers/`；它们记录当时的设计过程，不等于已交付功能。完整目录及阅读顺序见[文档状态](docs/STATUS.md)。

## 参与与许可

欢迎围绕可复现的问题、实验包格式、阅读体验和插件边界提出讨论。贡献前请查看[路线图](docs/ROADMAP.md)与[API 现状](docs/API_REFERENCE.md)，避免把尚未冻结的内部接口当作稳定 SDK。

源码按 [GPL-3.0](LICENSE) 许可发布；现有第三方视觉素材另见[版权说明](THIRD_PARTY_NOTICES.md)。
