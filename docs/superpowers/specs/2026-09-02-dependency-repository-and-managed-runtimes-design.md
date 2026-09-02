# 依赖仓库与独立运行时设计

> 日期：2026-09-02
> 状态：已确认，等待实现
> 相关文档：[架构设计](../../ARCHITECTURE.md) · [数据模型](../../DATA_MODEL.md) · [安全机制](../../SECURITY.md) · [项目结构与语言边界](../../PROJECT_STRUCTURE.md) · [插件加载与 API 设计](2026-09-01-plugin-loading-and-scoped-permissions-design.md)

## 1. 目标

LearnLab 同时管理实验包、插件和实验运行所需的独立运行时。实验包不应为了常见运行时而重复携带大型依赖，但小众依赖又不能因为依赖仓库暂时没有收录而无法分发。因此依赖允许来自多个来源，但导入后的 LearnLab 管理运行时统一归档到当前学习区的 `dependencies/`。

本设计解决：

- 实验包如何声明运行时依赖；
- 依赖仓库如何提供可下载的独立运行时；
- 小众依赖如何随实验包分发；
- 多个实验包如何复用同一份依赖；
- 系统级软件如何与 LearnLab 管理的运行时区分；
- 依赖下载、导入、校验和失败时如何处理。

## 2. 非目标

MVP 不做：

- 企业级软件供应链审核、中央签名服务或漏洞平台；
- 自动修改操作系统 PATH、注册表、系统服务或包管理器状态；
- 自动安装需要管理员权限的系统级软件；
- 为每个操作系统提供完整的系统软件分发方案；
- 让实验包在导入阶段自动执行任意安装脚本；
- 额外增加依赖数据库；依赖状态摘要仍记录在 `workspace.db`。

## 3. 三类仓库

### 3.1 实验包仓库

存放课程内容。实验包 manifest 只声明所需插件、LearnLab 管理的运行时和外部前置软件；常见依赖不默认打包进实验包。

### 3.2 插件仓库

存放插件桥接层和插件 manifest。插件声明自己提供的能力、支持的运行时以及能够检测的外部前置软件。插件负责把已准备好的运行时接入实验执行流程。

### 3.3 依赖仓库

存放可由 LearnLab 下载、校验、解压并运行的独立运行时及其索引。依赖仓库可以采用：

- GitHub 仓库保存索引和元数据，二进制放 Release 资产；
- 用户自定义的静态 HTTP 源；
- 后续可替换为其他简单文件服务。

MVP 不要求实现专门的动态服务端。客户端根据索引获取平台、架构、版本和下载信息。

## 4. 依赖来源与类型

### 4.1 LearnLab 管理的独立运行时

这类依赖可以是：

- GNU GCC、LLVM/Clang、CMake、Ninja；
- 独立 Python、OpenJDK、Node.js 等运行时；
- 可独立解压和启动的 MySQL 或其他数据库运行时；
- 小型 CLI、编译器辅助程序和课程专用执行器。

它们不要求写入系统目录。LearnLab 下载或导入后放入当前学习区的 `dependencies/`，插件通过核心提供的受控路径使用它们。

### 4.2 实验包自带依赖

小众、冷门、版本固定或依赖仓库暂时没有收录的独立运行时可以放在实验包的 `bundled-dependencies/` 中。它只是分发来源，不是最终运行时目录。导入成功后，依赖实体移动或复制到学习区 `dependencies/`，实验包内的临时副本不作为事实来源。

### 4.3 外部系统前置软件

需要用户自行安装或系统级配置的软件使用 `external_prerequisites` 声明，例如：

- 系统 Docker 服务；
- 用户已经安装的 MySQL；
- 操作系统提供的编译器或驱动；
- 需要管理员权限、系统注册或服务安装的软件。

这类软件不进入学习区 `dependencies/`。插件负责检测、显示安装说明或在用户明确确认后打开外部安装程序。核心不静默执行实验包提供的系统安装脚本。

## 5. 实验包 manifest

常规依赖：

```yaml
runtime_dependencies:
  - id: org.llvm.clang
    version: ">=18.0.0"
    provider: learnlab.cpp
    source: repository
```

小众依赖随包分发：

```yaml
runtime_dependencies:
  - id: org.example.special-runtime
    version: "1.0.0"
    provider: learnlab.example
    source: bundled
    bundled_artifact:
      path: bundled-dependencies/org.example.special-runtime/runtime.tar.zst
      sha256: "..."
```

第一版支持的 `source`：

- `repository`：只能从依赖源获取；
- `bundled`：必须使用实验包携带的依赖；
- `either`：后续支持从学习区缓存、实验包或依赖源选择。

如果未指定 `source`，默认按 `repository` 处理，避免实验包意外膨胀。

外部前置软件：

```yaml
external_prerequisites:
  - id: system.docker
    version: ">=27.0.0"
    required: true
    reason: "本实验需要 Docker 服务"
    detect: plugin

  - id: system.mysql
    version: ">=8.0.0"
    required: false
    reason: "也可以连接用户已有的 MySQL"
    detect: plugin
```

教程正文仍然要解释安装和配置方法；manifest 的机器可读声明用于导入前提示和插件预检，两者不能互相替代。

## 6. 依赖 manifest 与平台选择

依赖仓库中的每个构建变体至少声明：

```yaml
id: org.llvm.clang
version: 18.1.8
kind: compiler
platform: darwin
arch: arm64

archive:
  file: clang-18.1.8-darwin-arm64.tar.zst
  sha256: "..."
  size: 245000000

runtime:
  root: clang
  bin:
    - clang
    - clang++
  entrypoints:
    compile: bin/clang++

license:
  name: Apache-2.0
  notice: LICENSE.txt
```

同一个逻辑依赖可以存在多个平台和架构变体：

```text
linux-x64
linux-arm64
windows-x64
darwin-x64
darwin-arm64
```

解析时必须同时匹配依赖 ID、版本范围、当前平台和当前架构。没有可用变体时，包可以继续阅读，但相关实验能力进入不可用或只读状态。

## 7. 最终存储与复用

无论依赖来自仓库还是实验包，最终都放在当前学习区：

```text
学习区/
├── .learnlab/workspace.db
├── dependencies/
│   ├── org.llvm.clang/
│   │   └── 18.1.8/darwin-arm64/<sha256>/
│   └── org.example.special-runtime/
│       └── 1.0.0/linux-x64/<sha256>/
├── package-a/
└── package-b/
```

推荐使用内容寻址路径：

```text
<dependency-id>/<version>/<platform>-<arch>/<sha256>/
```

相同 ID、版本、平台、架构和哈希的依赖只保留一份；不同哈希可以并存，由 workspace 锁定具体实例。删除实验包时不直接删除依赖，至少在 MVP 中只标记为可清理。

## 8. 解析、下载与导入流程

```text
打开或导入实验包
  → 解析 runtime_dependencies
  → 解析当前平台和架构
  → 查询 workspace.db 中的精确锁定
  → 查找学习区已有且哈希一致的依赖
  → 若 source= bundled，读取实验包 bundled-dependencies/
  → 若 source= repository，查询依赖源
  → 提示用户需要下载或导入的可执行运行时
  → 下载/复制到临时目录
  → 校验大小和 SHA-256
  → 安全解压到学习区 dependencies/
  → 原子登记 dependency_records 和 package_dependencies
  → 将受控路径交给插件
  → 插件执行预检并启动运行时
```

下载或导入失败时：

- 不覆盖已有的可用依赖；
- 不在学习区留下半成品目录；
- 保留可阅读能力；
- 对受影响的实验显示缺失、不可用或只读状态；
- 允许用户稍后重试。

建议来源优先级：

```text
workspace.db 已锁定的精确实例
  > 学习区已有且哈希一致的实例
  > 实验包自带依赖
  > 依赖仓库
  > external_prerequisites 对应的系统软件
```

最后一项只适用于实验包明确声明允许使用外部系统软件，不能用系统软件静默替换一个明确要求的 LearnLab 独立运行时。

## 9. 安全边界

MVP 保持轻量，但以下规则必须执行：

- 下载使用 HTTPS 或用户信任的源；
- 依赖包必须校验 SHA-256 和文件大小；
- 压缩包解压必须拒绝绝对路径和路径穿越；
- 导入过程不执行任意 `install.sh`、`setup.exe` 或 post-install 脚本；
- 可执行运行时首次准备需要用户可见的确认；
- 插件只能获得当前实验包被授权的依赖路径；
- 独立运行时的进程仍受插件宿主的超时、停止和输出限制；
- 不把哈希校验描述为作者身份认证，依赖源信任仍由用户负责。

由于 LearnLab 不提供 OS 级沙箱，独立运行时本身如果具有强大系统权限，仍可能触达作用域外资源。开发者模式和高风险执行必须明确提示。

## 10. 核心模块

```text
DependencySourceRegistry   # 依赖源配置和索引读取
DependencyResolver         # 版本、平台、架构和来源解析
DependencyDownloader       # 下载到临时目录并校验
DependencyImporter         # 导入 bundled-dependencies 并安全解压
DependencyStore            # 学习区 dependencies/ 的存储和复用
DependencyManager          # 编排上述流程并更新 workspace.db
```

MVP 可以先把这些职责收敛在 `DependencyManager` 和少量纯函数中，不需要一开始拆成六个独立包。

## 11. MVP 验收标准

- 实验包可以只声明常见独立运行时而不携带实体文件；
- 小众独立运行时可以放在 `bundled-dependencies/`；
- 两种来源最终都进入学习区 `dependencies/`；
- 相同哈希依赖在同一学习区只存一份；
- 不同哈希可以并存且由包关系锁定；
- 当前平台没有变体时给出明确提示；
- 下载、复制、校验或解压失败不会留下半成品；
- 系统级软件只做检测和用户确认后的外部交互；
- 不执行实验包携带的任意安装脚本；
- 依赖状态可以在配置 JSON 之外由 workspace.db 恢复。
