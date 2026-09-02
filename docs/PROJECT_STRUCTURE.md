# 项目结构与语言边界

> 本文专门说明 LearnLab 的**源码仓库结构**、**运行时数据结构**和**实验包结构**。三者不是同一个目录，也不是同一种语言。

## 1. 先给结论

LearnLab 不是“所有内容都用 TypeScript 写”的项目。TypeScript 是 **LearnLab 宿主工程的主线语言**，不是实验内容和所有插件运行环境的强制语言。

| 部分 | 默认技术/语言 | 是否必须 TypeScript | 说明 |
|:---|:---|:---:|:---|
| LearnLab 桌面宿主 | Electron + TypeScript + Preact/TSX | 是 | 窗口、阅读器、学习区、插件管理、IPC 等由宿主负责 |
| 核心类型与协议 | TypeScript | 是 | manifest、权限、插件契约和跨进程消息的共同定义 |
| 插件 SDK | TypeScript | MVP 优先 | 负责让插件访问受控 API；后续可提供其他语言的协议客户端 |
| 官方插件桥接层 | TypeScript | 否，但优先 | 负责插件生命周期、UI、权限请求和外部进程桥接 |
| 环境适配器进程 | 语言不限 | 否 | 例如 Python、Rust、C/C++、Java；通过 CLI/标准输入输出/本地协议接入 |
| LabKit | TypeScript CLI | MVP 优先 | 校验、预览、打包实验包；GUI 后置 |
| 实验包正文 | Markdown + YAML/JSON + 资源 | 否 | 由作者决定实验使用的语言和工具 |
| 实验代码 | 语言不限 | 否 | 可以是 SQL、Python、C/C++、Java、Shell 等，但执行必须经过插件和当前包作用域 |
| 配置与数据 | JSON、SQLite、Markdown、普通文件 | 否 | 不属于 TypeScript 源码 |

因此，**“项目使用 TypeScript”指的是宿主和工具链的实现语言，而不是对实验生态所有内容的语言限制。**

## 2. 三个容易混淆的目录

### 2.1 源码工程仓库

这是开发者提交 Git 的目录，包含 LearnLab 本体、SDK、官方插件和 LabKit。它不等于用户的学习区。

### 2.2 用户学习区

这是用户实际导入实验包后使用的目录。它包含多个实验包、共享依赖和学习区数据库，不应该被当作源码仓库。

### 2.3 实验包

这是可以独立分发的课程/实验内容单元。它可以来自 GitHub 或自定义源，也可以由用户直接导入本地目录。实验包不需要加入 LearnLab 的 pnpm workspace。

## 3. 推荐的源码仓库结构

MVP 采用 monorepo，但按职责分为 `apps`、`packages`、`plugins`、`tools` 和 `examples`：

```text
learnlab/                              # LearnLab 源码仓库
├── package.json                       # 根脚本、版本和开发依赖
├── pnpm-workspace.yaml                # apps/*、packages/*、plugins/*、tools/*
├── tsconfig.base.json                 # 共享 TypeScript 基础配置
├── electron.vite.config.ts            # 如需要，也可以下沉到 apps/desktop
├── .gitignore
├── LICENSE
├── DESIGN.md
│
├── apps/                              # 可运行的应用
│   └── desktop/                       # LearnLab 桌面宿主
│       ├── package.json
│       ├── electron.vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main/                   # Electron 主进程，TypeScript
│           │   ├── index.ts
│           │   ├── services/
│           │   │   ├── paths.ts
│           │   │   ├── config.ts
│           │   │   ├── database.ts
│           │   │   ├── package-loader.ts
│           │   │   ├── dependency-manager.ts
│           │   │   ├── plugin-registry.ts
│           │   │   ├── plugin-resolver.ts
│           │   │   └── plugin-host.ts
│           │   └── ipc/
│           │       ├── package.ipc.ts
│           │       ├── config.ipc.ts
│           │       └── plugin.ipc.ts
│           ├── preload/                # contextBridge，TypeScript
│           │   ├── index.ts
│           │   └── index.d.ts
│           └── renderer/               # Preact + TSX + CSS
│               ├── index.tsx
│               ├── components/
│               ├── views/
│               ├── markdown/
│               ├── stores/
│               └── styles/
│
├── packages/                          # 可复用的 TypeScript 包
│   ├── core-types/                     # manifest、权限、插件契约和 IPC 类型
│   │   └── src/
│   ├── core/                           # 不依赖 Electron 的核心业务逻辑
│   │   └── src/
│   ├── plugin-sdk/                     # 插件开发 SDK
│   │   └── src/
│   └── markdown/                       # Markdown 解析/渲染公共逻辑（可选拆包）
│       └── src/
│
├── plugins/                           # 官方插件和示例插件
│   ├── plugin-vim/                     # 全局 Vim 模拟插件
│   │   ├── manifest.yaml               # 插件身份、激活模式、能力和权限声明
│   │   ├── package.json
│   │   ├── src/                        # 宿主桥接/UI，优先 TypeScript
│   │   └── runtime/                    # 可选；外部运行时，语言不限
│   ├── plugin-terminal/                # 终端面板插件
│   │   ├── manifest.yaml
│   │   ├── package.json
│   │   └── src/
│   ├── plugin-io-match/                # 输出匹配判定插件
│   │   ├── manifest.yaml
│   │   └── src/
│   ├── plugin-mysql/                   # MySQL 环境适配插件
│   │   ├── manifest.yaml
│   │   ├── package.json
│   │   ├── src/                        # 插件桥接和 UI，优先 TypeScript
│   │   └── runtime/                    # 启动 mysql/client/容器等，语言不限
│   └── plugin-cpp/                     # C/C++ 编译运行适配插件
│       ├── manifest.yaml
│       ├── src/
│       └── runtime/                    # 编译器/执行器接入，语言不限
│
├── tools/                             # 开发工具，不随桌面宿主运行
│   └── labkit/                         # 实验包 CLI，TypeScript
│       ├── package.json
│       └── src/
│           ├── commands/
│           ├── manifest.ts
│           ├── validator.ts
│           ├── preview.ts
│           └── pack.ts
│
├── examples/                          # 开发测试用样例，不是用户学习区
│   └── packages/
│       └── sql-intro/
│
├── tests/                             # 跨包行为测试
│
└── docs/                              # 设计、评估和开发文档
```

### 目录职责规则

- `apps/`：能启动的应用；MVP 只有桌面宿主。
- `packages/`：被多个工程复用的库、类型或协议；不直接代表一个用户功能。
- `plugins/`：插件实现；插件可以依赖 `packages/core-types` 和 `packages/plugin-sdk`。
- `tools/`：开发、校验、打包工具；`labkit` 不属于桌面应用运行时。
- `examples/`：样例实验包和测试资源；不能被宿主当成内置用户学习区。
- `docs/`：文档，不参与运行时构建。

## 4. 插件内部的语言边界

插件分成两层：

```text
插件
├── manifest.yaml       # 声明身份、能力、依赖和权限
├── src/                # LearnLab 插件桥接层，MVP 优先 TypeScript
└── runtime/            # 可选的环境进程，语言不限
```

`src/` 不是实验环境本身，而是插件与 LearnLab 之间的适配层，负责：

- 接收 `AppContext` / `PackageContext`；
- 向核心声明和请求权限；
- 注册面板、按钮、命令和实验能力；
- 启动、监督和关闭 `runtime/` 中的外部进程；
- 将外部进程的输出转换为统一的插件协议。

`runtime/` 可以使用任何合适的技术。例如：

- `plugin-mysql` 的桥接层可用 TypeScript，实际数据库客户端可以调用系统 `mysql` 或独立服务；
- `plugin-cpp` 的桥接层可用 TypeScript，编译和运行交给系统编译器；
- Agent 插件的实验代码执行器可以由 Python 或 Rust 编写。

这意味着 LearnLab 只统一**插件协议和权限边界**，不统一所有实验环境的实现语言。

## 5. 实验包结构：不属于 TypeScript 工程

一个最小实验包可以是：

```text
sql-intro/                          # 可压缩为 .labpkg
├── manifest.yaml                   # 包元数据、实验数量、插件和运行依赖
├── chapters/
│   ├── 01-select.md                # Markdown 正文
│   └── 02-where.md
├── experiments/
│   ├── select-basic/
│   │   ├── experiment.yaml         # 实验声明
│   │   ├── init.sql                # 实验资源，可为任意语言
│   │   └── answer.sql
│   └── where-basic/
│       └── experiment.yaml
├── assets/                         # 图片、视频和其他资源
├── notes/                          # 包内可选笔记资源
├── bundled-dependencies/           # 可选：小众独立运行时的分发来源
└── .learnlab/                      # 运行后生成
    ├── package.db
    ├── experiment_history/
    └── tmp/
```

实验包中的代码由插件决定如何解释和执行。LearnLab 核心只负责：

1. 解析包结构和 manifest；
2. 加载 Markdown 和静态资源；
3. 根据包声明解析所需插件；
4. 把当前实验包作用域交给获得授权的插件；
5. 保存阅读进度和实验历史。

## 6. 依赖来源和最终归档

实验包可以只声明依赖，也可以在 `bundled-dependencies/` 中携带小众独立运行时。依赖仓库下载的运行时和实验包携带的运行时，导入后都归档到当前学习区的 `dependencies/`；这里是 LearnLab 管理运行时的唯一事实位置。

需要系统级安装的软件不进入该目录，而由 `external_prerequisites` 声明并由插件检测和引导。

## 7. 用户运行时目录：也不是源码目录

```text
~/.learnlab/
├── config.json                      # 全局设置、插件设置和授权
├── plugins/                         # 已安装插件
└── workspaces/
    └── 学习区/
        ├── .learnlab/workspace.db   # 包清单、软连接和学习区状态
        ├── dependencies/            # 该学习区共享的实际独立运行时
        │   ├── org.llvm.clang/18.1.8/darwin-arm64/<sha256>/
        │   ├── org.mysql.runtime/8.4.0/linux-x64/<sha256>/
        │   └── ...
        ├── sql-intro/               # 解压后的实验包
        │   └── .learnlab/package.db
        └── python-basics/
            └── .learnlab/package.db
```

源码仓库的 `packages/` 与用户学习区的“实验包”没有关系；前者是开发者代码目录，后者是用户内容目录。为了避免混淆，文档中尽量使用：

- `packages/`：源码公共包；
- `lab package` / `实验包`：用户导入的课程内容；
- `workspace` / `学习区`：多个实验包的容器。

## 7. MVP 的工程约束

第一版只要求：

- 宿主、核心类型、SDK、LabKit 使用 TypeScript；
- 官方插件优先使用 TypeScript 编写桥接层；
- 外部环境通过进程或 CLI 接入，不把 Python/MySQL/C++ 等环境源码塞进 LearnLab 核心；
- 实验包只要能被 `manifest.yaml` 描述、被阅读器加载、被相应插件执行即可；
- 不为了“全项目统一语言”而重写环境工具；
- 暂不为每一种外部语言都开发 SDK，先稳定跨进程插件协议。
