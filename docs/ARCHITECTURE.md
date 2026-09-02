# 架构设计

> 相关文档：[插件加载与 API 设计](superpowers/specs/2026-09-01-plugin-loading-and-scoped-permissions-design.md) · [总览](OVERVIEW.md) · [UI 设计](UI_DESIGN.md) · [安全机制](SECURITY.md) · [路线图](ROADMAP.md) · [数据模型](DATA_MODEL.md) · [测试策略](TEST_STRATEGY.md)
>
> 2026-09-01 更新：确认插件优先架构、有限作用域、独立插件宿主、执行监督、分层存储和按依赖链加载插件

---

## 📦 核心概念：实验包（Lab Package）

LearnLab 是**实验包播放器**。实验包 = 一个 ZIP 文件（`.labpkg`）或一个文件夹，包含：

```
实验包/
├── manifest.yaml             # 元数据、章节/实验统计、插件和运行依赖声明
├── chapters/                 # 章节目录
│   ├── 01-基础/
│   │   ├── content.md          # 本章讲解文本（Markdown，支持 LaTeX 公式）
│   │   ├── video-1.mp4         # 视频讲解（可选，支持 mp4/webm/avi 等常见格式）
│   │   ├── lab-1.yaml          # 实验卡片定义（可选）
│   │   └── lab-2.yaml
│   ├── 02-进阶/
│   │   ├── content.md
│   │   ├── video-1.mp4
│   │   └── lab-1.yaml
│   └── ...
├── dependencies/              # 依赖声明文件（可选，不是学习区的安装目录）
│   ├── requirements.txt       # Python 依赖
│   └── packages.txt           # 系统级依赖（apt/brew 等）
└── env/                       # 环境配置脚本（可选）
    └── setup.sh               # 初始化脚本（用户同意后执行）
```

用户双击 `.labpkg` 导入 → 解压到学习区 → 实验包出现在左侧目录树 → 开始学习。

### 作者元数据（manifest）

除了机器识别所需的 `package_id`、版本和插件依赖外，作者应尽量明确填写：

- `author`：作者或维护组织；
- `goal`：学习目标和适用人群；
- `prerequisites`：前置知识；
- `environment`：需要的软件、版本和平台；
- `logs`：已知限制、变更记录或排错入口；
- `license`：内容和代码的许可证；
- `experiment_count`：作者声明的实验数量，用于展示和包级统计；
- `required_plugins`：当前实验包直接依赖的插件；
- `runtime_dependencies`：当前实验包需要的环境依赖，实际安装由学习区管理。

这些字段用于导入前展示和用户自行判断质量，不代表 LearnLab 的官方背书。

### 学习区（Workspace）

> 设计决策（2026-08-15）：**LearnLab 像选择"工作区"一样选择"学习区"**——每个学习区是一个可包含多个实验包的目录，用户在不同学习区之间切换，包内进度和笔记按实验包隔离喵~ (´･ω･`)

**类比**：
- VS Code：打开一个文件夹 = 一个工作区（文件夹里可以有多个项目）
- Minecraft：一个世界 = 一个存档（世界里可以有多个 mod）
- LearnLab：一个学习区 = 一个学科目录（目录里可以有多个实验包）

**导入流程（类似 MC 导入整合包）**：

```
用户获得 .labpkg（压缩包，比如从 U 盘/源下载）
       ↓
选择学习区 ① 导入到现有学习区（同一学科，合集在一起）
         ② 新建学习区（如 "Java 学习区"）
       ↓
LearnLab 解压 .labpkg → 装入学习区目录
       ↓
✅ 导入完成 → 原 .labpkg 压缩包可以丢弃（资源包已释放到学习区）
```

**多个实验包共享一个学习区**：学习区是"学科目录"，一个学习区可以载入**不止一种实验包**（比如"Java 学习区"里同时装着 Java 入门、Java 多线程、Java 设计模式三个包），也可以在"大学课程"学习区里同时装 MySQL、编译原理、计组的包；包之间在目录树中并列展示，进度/笔记按包隔离。

**学习区的目录结构**：

```
学习区目录（可自定义位置，默认 ~/.learnlab/workspaces/）
├── .learnlab/
│   └── workspace.db                 # 实验包、软连接、顺序和依赖状态
├── dependencies/                    # 当前学习区共享的已安装依赖
│   ├── python/<dependency-fingerprint>/
│   ├── mysql/<dependency-fingerprint>/
│   └── ...
├── java-intro/                      # 实验包 ①（解压后的内容）
│   ├── chapters/
│   ├── manifest.yaml
│   └── .learnlab/                   # 该包的进度/尝试历史/用户文件
├── java-multithread/                # 实验包 ②
│   └── ...
└── java-design-patterns/            # 实验包 ③
    └── ...
```

**学习区切换体验**：

```
启动 LearnLab → 学习区选择器：

┌──────────────────────────────────────────────┐
│ 📂 选择学习区                                  │
│                                               │
│  📚 Java（3 个包）               45%  ⏺ 打开 │
│     ├ java-intro           ✅ 90%            │
│     ├ java-multithread     ⏳ 45%            │
│     └ java-design-patterns     0%            │
│  🎓 大学课程（3 个包）      18%  ⏺ 打开     │
│  📦 物理（1 个包）           0%  ⏺ 打开     │
│                                               │
│  [➕ 导入新实验包]  [🗑 删除学习区]             │
└──────────────────────────────────────────────┘
```

**关键特性**：

| 特性 | 说明 |
|:---|:---|
| **解压即用** | 压缩包导入后解压到学习区，之后不再依赖原始包 |
| **原包可弃** | 导入完成后 .labpkg 可丢弃，学习区已有全部内容 |
| **学习区隔离** | 每个学习区的进度/笔记/尝试历史互相独立 |
| **位置自定义** | 学习区可放任何位置（默认 `~/.learnlab/workspaces/`，也可以放 U 盘/外接盘） |
| **离线无忧** | 学习区是纯本地目录，离线可用 |
| **轻量多开** | 想学新课程 = 新建学习区导入，不互相干扰 |

### 学习进度定义

学习进度与实验通过率分开计算，不把“做对实验”强行等同于“读完课程”。

- **章节阅读完成**：章节内容页面滚动到底部时，标记该章节已读；关闭前保存当前位置和滚动位置。
- **学习区/实验包阅读百分比**：按实际发现的章节 Markdown 数量计算；章节滚动到底视为完成。实验卡片数量不参与阅读百分比。
- **实验数量展示**：实验包的实验总数由作者在 manifest 中声明；LearnLab 可以扫描并校验实际实验卡片，但不通过扫描结果替换作者声明的统计口径。
- **实验状态**：实验另行显示“未开始 / 进行中 / 已完成 / 用户自判”，不改变阅读百分比。
- **内容更新**：如果章节内容指纹没有变化，保留原有已读状态；如果内容发生变化，该章节重置为 0%，再重新计算包和学习区百分比。
- **答案查看**：查看答案后通过不额外标记，尝试历史中仍保留实际操作记录。

### 开屏：选择学习区（对标 IntelliJ IDEA 项目选择器）

> 设计决策（2026-08-15）：**启动时先选学习区，再进入主界面**——就像 IntelliJ IDEA 启动时先选项目一样喵~ (๑•̀ㅂ•́)و✧

```
LearnLab 启动
       ↓
开屏 = 学习区选择器（IDEA 风格）
       ↓
选择一个学习区 → 进入主界面（载入该学习区的实验包）
       ↓
（可选）设置"记住上次学习区" → 下次启动直接进入
```

**开屏界面**：

```
┌──────────────────────────────────────────────────┐
│  LearnLab                                          │
│  欢迎回来 👋                                       │
│                                                    │
│  📂 最近学习区                                     │
│  ┌────────────────────────────────────────────┐   │
│  │ 📚 Java（3 个包）            45%   最近打开 │   │
│  │ 📦 物理（1 个包）             0%           │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  📂 所有学习区                                     │
│  ┌────────────────────────────────────────────┐   │
│  │ 🎓 大学课程（3 个包）        18%  ⏺ 打开   │   │
│  │ 📚 Java（3 个包）            45%  ⏺ 打开   │   │
│  │ 📦 物理（1 个包）             0%  ⏺ 打开   │   │
│  │ ────────────────────────────────────────── │   │
│  │ [➕ 导入新实验包]  [🗑 删除学习区]  [⚙️]   │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  ☑ 记住上次的学习区（下次启动直接进入）             │
└──────────────────────────────────────────────────┘
```

**与 IDEA 的对照**：

| IntelliJ IDEA | LearnLab |
|:---|:---|
| 启动 → 选择项目 | 启动 → 选择学习区 |
| 项目 = 一个代码工程 | 学习区 = 一个学科目录（含多个实验包） |
| 最近项目列表 | 最近学习区列表 |
| 打开新项目 | 导入新实验包（新建学习区） |

**这个设计的价值**：
- **语境清晰**：每次进来先选"学什么"，再开始"怎么学"——对非程序员用户也是一种温和的引导
- **多线学习不混乱**：同时学 Java 和物理的用户，开屏选一个，进主界面只有那个学习区的内容
- **保留感**：最近学习区 + 进度百分比，一开屏就有"接着上次学"的暗示喵~

### 多语言（实验包作者决定）

> 设计决策（2026-08-14）：**多语言是实验包作者的事**——由作者在 manifest 里规定哪些语言加载哪些 Markdown 文件，LearnLab 核心不做翻译、不做机制，只负责"按用户显示语言选择对应文件"喵~ (｀・ω・´)

```yaml
# manifest.yaml
name: "MySQL 入门教程"
locales:                     # 作者声明支持的语种
  default: zh-CN             # 默认语种（没有匹配时会用这个）
  languages:
    - zh-CN
    - en-US

# 目录结构：不同语言的文件并列，后缀区分
chapters/
├── 01-基础/
│   ├── content.zh-CN.md     # 中文版
│   ├── content.en-US.md     # 英文版
│   ├── lab-1.zh-CN.yaml
│   └── lab-1.en-US.yaml
```

**加载策略：**

```
1. 首次导入实验包 → 按用户本机默认显示语言加载（如系统是中文，加载 zh-CN）
2. 用户后续在设置里切换显示语言 → 重新匹配语言文件
3. 该语言文件不存在 → 回落到 locales.default（作者指定的默认语种）
```

**单语言实验包（默认不显示切换）：**

```
manifest.yaml 不写 locales 字段（或只有一个语言）→ 单语言包
   → 学习界面不显示任何语言切换入口（保持简洁、不打扰）
   → 后续作者更新添加第二语言后，切换入口自动出现
```

- 核心**不做翻译**（作者自备各语言内容）
- **语言切换入口按需出现**：单语言包不显示，多语言包才显示
- 实验进度里**记录用户当时用的语言**（见记忆系统），切换语言后进度独立可追溯喵~

---

## 🎴 实验卡片（Lab Card）

实验卡片嵌入在学习内容中，是 LearnLab 的核心单元喵~：

```
┌─────────────────────────────────────────┐
│ 📗 实验 2.3-1：创建 student 表          │
│                                         │
│ 请创建一个学生表 student，包含以下字段：  │
│ - StudentID: CHAR(12), 主键             │
│ - StudentName: VARCHAR(10), 非空        │
│ - Sex: CHAR(1), 默认值 '男'             │
│ - Birthday: DATE                        │
│                                         │
│ 尝试次数: 2/5         状态: ❌ 未通过    │
│ [开始实验]  [重置]  [💡 查看提示]        │
└─────────────────────────────────────────┘
```

### 实验卡片定义（YAML）

```yaml
lab:
  id: "ch2-3-1"
  title: "创建 student 表"
  type: auto               # auto = 自动判定，manual = 用户自判

  # 环境配置
  environment:
    type: mysql            # 环境类型：mysql / python / java / cpp / bash / custom
    init: |
      USE studentinfo;     # 初始化脚本（每次 reset 重新执行）

  # 实验要求
  instruction: |
    请创建一个学生表 student，包含以下字段：
    - StudentID: CHAR(12), 主键
    - StudentName: VARCHAR(10), 非空
    - Sex: CHAR(1), 默认值 '男'
    - Birthday: DATE

  # 判定规则（type: auto 时生效）
  validation:
    provider: mysql-schema   # 判定器（插件提供，默认 io-match）
    max_attempts: 5
    check:
      - type: table_exists
        params: { table: student }
      - type: column_exists
        params: { table: student, column: StudentID, type: char(12), nullable: false }
        message: "StudentID 应为 CHAR(12) 且非空"   # 作者写的说明（可选，不是程序推断）
      - type: column_exists
        params: { table: student, column: StudentName, type: varchar(10) }
      - type: column_exists
        params: { table: student, column: Sex, type: char(1), default: "男" }
      - type: column_exists
        params: { table: student, column: Birthday, type: date }

  # 提示与答案（逐步揭示）
  hints:
    - level: 1
      message: "试试用 CREATE TABLE 语句"
    - level: 2
      message: "主键用 PRIMARY KEY，非空用 NOT NULL"
    - level: 3
      message: "参考语法：CREATE TABLE 表名 (列名 类型 约束, ...)"
  solution:
    content: |
      CREATE TABLE student (
        StudentID CHAR(12) PRIMARY KEY,
        ...
      );
    # 答案只有用户手动点击才显示（不会自动展开）

  # 成功/失败消息（type: manual 时只显示提示，不自动判）
  on_success: "✅ 实验通过！"
  on_failure: "❌ 实验失败，再试试吧~"
```

### 提示与答案的显示策略

> 设计决策（2026-08-15）：**提示自动展开，答案必须手动点**——提示在尝试次数过多时自动出现，答案永远不自动弹出喵~ (｀・ω・´)

| 内容 | 何时显示 | 交互 |
|:---|:---|:---|
| **提示（hints）** | 尝试超过一定次数时**自动展开**（默认：失败 ≥ 2 次时逐级显示） | 用户也可手动点「💡 查看提示」 |
| **答案（solution）** | **永远不自动出现** | 只有用户手动点击「👁️ 查看答案」才显示，且通常需确认"确定要看答案？" |

> 设计意图：提示是"脚手架"，该给就给；答案是"终点"，要保护学习过程——看一眼答案就失去自己思考的机会了喵~ (´･ω･`)

---

## ⚖️ 判定模式（双判定 + 判定器插件化）

| 模式 | 标签 | 适用场景 | 怎么判 |
|:---|:---:|:---|:---|
| **自动判定** | `type: auto` | 由对应专业插件和判定器实现 | 运行领域操作 → 用判定器插件检查 → 输出结构化结果 |
| **用户自判** | `type: manual` | 数理化/文科/其他 | 执行完实验后，用户自己点 ✅ 或 ❌ |

**这是一个很务实的设计**——可自动验证的实验交给对应领域判定器插件，数学、物理、医学等不适合自动判定的实验仍可由作者设计为展示结果或用户自判，不强行统一喵~ (´･ω･`)

### 判定器 == 插件（不只是 in/out）

> 设计决策（2026-08-15）：**自动判定不是内置单一的"输出匹配"**——判定逻辑做成插件，不同的实验可以注册不同的判定器喵~ (｀・ω・´)

```yaml
# manifest.yaml 或 lab 卡片里声明用哪个判定器
validation:
  provider: io-match        # 最常用：输出匹配（退出码 + 文本包含预期）
  rules: { ... }
```

可用的判定器（全部通过插件提供）：

| 判定器 | 判什么 | 归属 |
|:---|:---|:---:|
| `io-match` | 退出码 + 输出包含预期文本 | 官方示例插件 |
| `mysql-schema` | 检查表/列/类型/约束是否存在 | mysql 适配器插件 |
| `pytest-runner` | 跑测试用例 | python 适配器插件 |
| `choice-check` | 选择题答案比对 | 判定器插件 |
| `rubric-check` | 按评分项勾选 | 判定器插件 |
| `custom` | 任意自定义判定 | 第三方插件 |

**判定器的结果 = 分项报告（见下）**，不同判定器做的检查不同，但都输出统一格式的分项结果喵~！

### 判定结果：分项反馈（只给"哪错了"，不给"为什么错"）

> 设计决策（2026-08-15）：**LearnLab 核心不做"程序分析错误原因"**——对错的具体缘由不好判断（插件太多、判定方法各异，看谁的？）。程序只负责指出 **哪一项错了**，具体原因解释由作者写在检查项里，或由提示系统引导喵~ (｀・ω・´)

判定结果不是单个 ✅/❌，而是**分项报告**：

```json
{
  "passed": false,
  "score": 3,
  "total": 5,
  "checks": [
    { "id": "table_exists", "status": "passed" },
    { "id": "student_id_type", "status": "failed", "hint_level": 1 },
    { "id": "student_name_nullable", "status": "failed", "hint_level": 2 }
  ]
}
```

展示效果：

```
实验结果：3/5 通过 ❌

✅ 第 1 项：student 表已创建
❌ 第 2 项：StudentID 字段检查未通过   → 查看提示 (Lv1)
❌ 第 3 项：StudentName 字段检查未通过 → 查看提示 (Lv2)
```

- **程序只判"过/不过"**，不做错误原因分析
- **作者**可以在检查项里附带 `message`（如"StudentID 应为 CHAR(12)"）——但这是作者写的说明，不是程序推断的
- **提示系统**按 `hint_level` 逐级引导，而不是程序直接说"你这里错了，因为..."

---

## 🧪 实验生命周期

```
用户点击 [开始实验]
       ↓
执行 init 脚本（初始化环境）
       ↓
操作区唤起对应 CLI
       ↓
用户输入命令 → 点击 [▶ 运行]
       ↓
系统执行命令，捕获输出
       ↓
┌─── type: auto？───┐
│      是           否        │
│       ↓            ↓        │
│  自动判定输出    显示输出    │
│  ┌─ 匹配？──┐   用户自判    │
│  │ 是    否 │    ↓          │
│  │ ✅   尝试+1│  [✅/❌]    │
│  │      ↓     │             │
│  │  次数超？   │             │
│  │ 是    否   │             │
│  │ ❌   等待  │             │
│  └──────────┘              │
└────────────────────────────┘

用户点击 [↺ 重置] → 重新执行 init 脚本，尝试次数归零
```

---

## 🧩 插件体系（核心设计）

LearnLab 采用插件优先架构，但插件不是获得本机完全控制权的脚本。插件通过独立宿主进程和白名单 API 接入，核心负责稳定的领域能力、权限授权、依赖解析和执行监督。

插件类别只是帮助理解的示例，不是封闭枚举。插件真正声明的是“提供什么能力”和“需要什么权限”；实验包依赖这些能力，不依赖核心内置的固定插件类型。

### 插件类型总览

| 类型 | 提供什么 | 示例 |
|:---|:---|:---|
| **面板插件** | 底部/侧边 UI 面板 | terminal、charts |
| **环境适配器** | 检查环境、生成执行计划、管理会话 | mysql、python、cpp、cad、统计、医学等 |
| **判定器** | 消费结构化执行结果并输出分项判定 | io-match、mysql-schema、pytest-runner 或专业领域判定器 |
| **主题/字体插件** | 外观和字体变量 | glass、sepia、中文阅读字体 |
| **渲染插件** | Markdown 容器或交互式内容 | mermaid、geogebra、echarts 或专业可视化 |
| **同步/工具插件** | 可选的数据导入导出或 LabKit 能力 | 自定义同步、LabKit 或行业工具 |

### 插件宿主、上下文与作用域

```text
LearnLab 主进程
    │ 受控 IPC / 白名单 API
    ▼
插件宿主进程（每个插件或插件组独立）
    ├── AppContext：软件全局作用域的只读抽象
    ├── PackageContext：当前实验包及其 .learnlab/ 运行区
    └── 经用户授权的能力和资源句柄
```

插件不会拿到一个可以随意修改的 JavaScript 全局变量。核心对软件抽象一个只读 `AppContext`，它是整个 LearnLab 作用域的稳定入口；当前包使用 `PackageContext`。学习区组织关系由核心内部的 `WorkspaceContext` 管理，默认不暴露给插件，确有需要时只通过高层 API 暴露有限摘要。

```typescript
interface AppContext {
  readonly learnlabVersion: string
  readonly apiVersion: number
  readonly currentPackage?: PackageSummary
  readonly installedPlugins: ReadonlyArray<PluginSummary>
  readonly settings: Readonly<ExposedSettings>
  registerPanel(definition: PanelDefinition): Registration
  registerCommand(definition: CommandDefinition): Registration
  registerAction(definition: ActionDefinition): Registration
}

interface PackageContext {
  readonly packageId: string
  readonly packageRoot: string
  readonly manifest: Readonly<PackageManifest>
  readonly runtimeDir: string       // <package>/.learnlab/
  // 不直接暴露 workspace.db、其他包路径或任意用户目录
}
```

默认作用域：

1. **LearnLab 本体作用域**：只能通过 `AppContext` 和公开 API 使用版本、能力、部分设置等信息，不直接修改安装目录。
2. **当前实验包作用域**：可按权限读取当前包静态内容，写入当前包 `.learnlab/` 动态区，并使用当前包依赖环境。
3. **学习区作用域**：学习区数据库、其他实验包和共享依赖目录默认由核心管理，插件不可以自行扫描或直接修改；需要时只能调用经过授权的高层 API。
4. **外部文件作用域**：插件不能直接读取任意用户路径；需要访问时请求核心打开文件，由系统选择器和临时资源句柄处理。
5. **开发者模式**：可以申请更大的文件、外部进程或网络权限，但必须显示“插件可能执行任意本机操作”的风险提示。

这里的作用域限制是 LearnLab API、工作目录、资源句柄和执行计划层面的限制，不是 OS 级沙箱。只要允许插件启动足够强的外部程序，就不能承诺该程序绝对无法读取其他文件。

### 插件能力与权限

插件 manifest 同时声明：

- `provides`：插件提供的领域能力，例如 `environment.mysql`、`validator.mysql-schema`、`editor.vim-mode`；
- `permissions`：插件运行时请求的动作权限，顶层分为 `read`、`write`、`execute`，再按资源、动作和作用域细分。

第一版权限范围：

| 顶层权限 | 允许的细分能力 |
|:---|:---|
| `read` | LearnLab/API 版本、已安装插件摘要、经授权的设置、当前实验包/章节/实验、当前包依赖摘要；学习区包摘要需要额外授权 |
| `write` | 剪贴板、当前包 `.learnlab/` 文件、插件设置新属性、用户授权的部分设置、当前包环境变量、面板/按钮/右键菜单/命令注册 |
| `execute` | 网络请求、当前包附带可执行文件和环境、当前包内用户主动运行的代码、外部文件选择请求、核心执行计划 |

有效权限采用求交，而不是“声明即拥有”：

```text
有效权限 = 插件声明
         ∩ 当前包请求的作用域
         ∩ 用户授权
         ∩ LearnLab 核心策略
         ∩ 当前平台支持能力
```

全局激活只决定插件对所有包可用，不自动赋予插件读取所有包、写入所有包或访问整个学习区的权力。

### 插件协议与版本

插件 manifest 至少包含：

```yaml
plugin_id: "org.learnlab.mysql"
version: "1.2.0"
author: "LearnLab Contributors"
signature: "..."       # 作者签名/发布信息；不自动等于安全认证
api_version: 1
activation:
  mode: package         # global | package
provides:
  - environment.mysql
  - validator.mysql-schema
requires_plugins:
  - id: "org.learnlab.io-match"
    version: ">=1.0.0 <2.0.0"
permissions:
  read:
    - package.manifest
    - package.files:chapters/**
  write:
    - package.runtime
  execute:
    - package.process
    - network.request
breaking_change: false
```

实验包只声明直接依赖：

```yaml
experiment_count: 5
required_plugins:
  - id: "org.learnlab.mysql"
    version: ">=1.1.0 <2.0.0"
    provides: ["environment.mysql", "validator.mysql-schema"]
runtime_dependencies:
  - kind: mysql
    version: ">=8.0"
    platform: [macos, linux, windows]
```

`plugin_id`、版本、作者和签名构成插件的最小身份；不引入复杂注册中心、评级体系或企业级审核。兼容更新应尽量让旧实验包无感升级；破坏性更新必须显式标注。没有满足版本范围的插件时，包可以进入只读模式，但不能开始依赖该插件的实验。

### 全局插件与当前包插件的加载规则

插件加载不是“用户安装过就全部加载”，而是按当前实验包解析：

```text
ActivePlugins(package)
  = GlobalPlugins
  ∪ Closure(package.required_plugins)
  ∪ Closure(GlobalPlugins.requires_plugins)
```

- `global` 插件对所有实验包生效，例如 Vim 模拟、全局主题、全局快捷键增强；宿主可以按需启动，但解析、注册和状态对每个包都可见。
- `package` 插件只在当前实验包需要时激活；直接依赖由包 manifest 声明，传递依赖由插件 manifest 的 `requires_plugins` 递归解析。
- 同一 `plugin_id` 在 MVP 中只允许一个活动版本。版本范围冲突时当前包只读，不实现同一插件多版本并行宿主。
- 全局插件的依赖缺失时，全局插件标记为 `blocked`，所有受影响的包都显示统一原因。
- 缺失插件、停用插件和不兼容插件不能静默跳过；打开包时提示缺失列表，使用受影响功能时再次提示。

核心至少区分以下状态：`installed`、`active-global`、`active-package`、`missing`、`disabled`、`incompatible`、`blocked`、`read-only`。

### 插件生命周期

```text
发现 → 读取 manifest → 解析全局插件
→ 解析当前包直接依赖和传递依赖
→ 检查版本/API/权限/依赖环境
→ 提示缺失与风险
→ 用户授权后启动宿主（可延迟启动）
→ 注册 UI/命令/能力 → 运行
→ 停用/崩溃回收 → cleanup
```

插件运行时使用 `PluginRegistry` 管理已安装清单，使用 `PluginResolver` 计算全局和当前包的活动集合，使用 `PluginActivator` 启动宿主并挂载经过授权的上下文。切换实验包时重新生成 `PackageContext`；上一个包的文件句柄和运行权限不得带入新包。

官方示例插件用于验证协议，但不等于全部内置在核心：

| 插件 | 类型 | 用途 |
|:---|:---|:---|
| `learnlab-plugin-mysql` | 环境适配器 + 判定器 | MySQL 环境和 mysql-schema |
| `learnlab-plugin-python` | 环境适配器 + 判定器 | Python 环境和 pytest |
| `learnlab-plugin-cpp` | 环境适配器 + 判定器 | C/C++ 编译运行和 io-match |
| `learnlab-plugin-terminal` | 面板插件 | xterm.js + node-pty 终端 |
| `learnlab-plugin-io-match` | 判定器 | 通用输出匹配 |

---

## 🔌 环境适配器与执行监督

环境适配器负责描述“如何准备和运行一种环境”，但不负责单独决定安全边界，也不直接拥有无限制的进程控制权。

### 适配器接口

```typescript
interface PackageContext {
  packageId: string
  packageRoot: string
  manifest: Readonly<PackageManifest>
  // 不直接暴露 workspace.db、其他包路径或任意用户目录
}

interface EnvironmentAdapter {
  name: string
  version: string
  capabilities: string[]
  checkEnvironment(): Promise<CheckResult>
  setup(context: PackageContext): Promise<SetupPlan>
  startSession(): Promise<SessionInfo>
  createExecution(request: ExecutionRequest): Promise<ExecutionPlan>
  reset(): Promise<ResetPlan>
  collectArtifacts(): Promise<Artifact[]>
  explainFailure(result: RunResult): string
  cleanup(): Promise<void>
}

interface ValidatorProvider {
  id: string
  version: string
  validate(result: RunResult, rules: ValidationRule[]): Promise<ValidationResult>
}
```

### 内核执行监督器

所有外部进程由内核 `ExecutionSupervisor` 统一启动和管理：

- 校验适配器生成的执行计划是否落在允许的命令、目录和环境变量范围内；
- 负责超时、取消、输出大小、进程树回收和孤儿进程清理；
- 记录标准化的 `RunResult`，再交给判定器；
- 适配器崩溃只影响当前实验，不应拖垮 LearnLab 主界面；
- 适配器可提供平台相关实现，但不能绕过内核监督器直接启动不受控进程。

### 临时文件规范

| 适配器 | 临时内容 | 清理 |
|:---|:---|:---|
| Python | `.learnlab/tmp/.venv`、缓存 | 清空当前包的 `tmp/` |
| Node.js | `.learnlab/tmp/node_modules` | 清空当前包的 `tmp/` |
| Java/C++ | 编译产物 | 清空当前包的 `tmp/` |
| 其他 | 运行脚本和缓存 | 全部放入当前包的 `tmp/` |

### 跨平台初始化

优先使用适配器支持的声明式依赖；必须使用脚本时按平台声明：

```yaml
setup:
  macos: "env/setup.sh"
  linux: "env/setup.sh"
  windows: "env/setup.ps1"
```

声明式依赖不是安全绕过方式。安装前仍需用户授权，执行过程仍由内核监督和日志记录。

### 支持的实验类型（规划）

| 类型 | 标识 | 自动判定 | 提供方 |
|:---|:---:|:---:|:---|
| MySQL | `mysql` | ✅ | 官方示例插件（验证插件接口） |
| Python / Java / C++ 等 | 由插件定义 | 看实现 | 官方或社区插件 |
| 其他专业环境 | 由插件定义 | 看实现 | 第三方/领域插件 |
| 自定义 | 由插件定义 | 看实现 | 第三方插件 |

## 🛠️ 实验包制作工具（LabKit）

LearnLab 是"播放器"，还需要一个"制作器"——让不会编程的人（比如优秀的教授们）也能创作实验包喵~！

### 两阶段策略

| 阶段 | 制作方式 | 适用人群 |
|:---|:---|:---|
| **Phase 1（初期）** | 手写 YAML + 手动组织 ZIP 压缩包 | 程序员、开源贡献者 |
| **Phase 2（后期）** | 可视化编辑器（LabKit） | 非计算机专业的教授、教师、内容创作者 |

### 手动制作（Phase 1）

初期用户用任何文本编辑器 + 文件管理器就能制作实验包：

```
1. 创建文件夹结构
   ├── manifest.yaml       # 手写元数据
   ├── chapters/01-基础/
   │   ├── content.md      # 手写 Markdown
   │   └── lab-1.yaml      # 手写实验卡片定义
   └── dependencies/       # 可选：依赖文件

2. 打包为 .labpkg（其实就是 ZIP）
   zip -r my-lab-package.labpkg .
```

### 创作者 CLI（优先于 GUI）

在完整可视化编辑器之前，先提供轻量 CLI：`labkit validate`、`labkit preview`、`labkit pack`、`labkit inspect-permissions`。它负责校验包结构、查找资源断链、预览 Markdown、生成 `.labpkg` 和检查权限声明；不要求模拟不同平台。

### 可视化编辑器——LabKit（Phase 2）

LabKit 是一个**图形化的实验包创作工具**，可以独立发布，也可以作为 LearnLab 的插件：

```
┌─────────────────────────────────────────────────────────┐
│  LabKit · 实验包创作工具                                  │
│                                                          │
│  📁 实验包结构          📝 章节编辑器                     │
│  ┌──────────────┐      ┌────────────────────────────┐   │
│  │ ☑ 01-基础    │      │  # 2.3 创建表                │   │
│  │   ☑ content  │      │  CREATE TABLE 语句用于...    │   │
│  │   ☑ lab-1    │      │                              │   │
│  │   ☑ lab-2    │      │  [B] [I] [U] [代码] [公式]  │   │
│  │ ☐ 02-进阶    │      └────────────────────────────┘   │
│  │ ☐ 03-高级    │                                        │
│  └──────────────┘      ┌────────────────────────────┐   │
│                         │  🧪 实验卡片编辑器          │   │
│  [➕ 章节] [➕ 实验]     │  ┌─ 自动判定 ──────────┐  │   │
│                         │  │ 环境: mysql ▼        │  │   │
│                         │  │ 初始化脚本: [...]    │  │   │
│                         │  │ 判定规则:            │  │   │
│                         │  │  ☑ 检查表存在        │  │   │
│                         │  │  ☑ 检查列类型        │  │   │
│                         │  │ 最大尝试次数: [5]    │  │   │
│                         │  └────────────────────┘  │   │
│                         └────────────────────────────┘   │
│                                                          │
│  [📦 导出 .labpkg]  [💾 保存草稿]  [▶ 预览实验]        │
└─────────────────────────────────────────────────────────┘
```

**LabKit 的核心功能：**

| 功能 | 说明 |
|:---|:---|
| **章节结构管理器** | 可视化拖拽调整章节目录树，自动生成目录结构 |
| **Markdown 编辑器** | 所见即所得（WYSIWYG），支持 LaTeX 公式、代码块、图片插入 |
| **实验卡片编辑器** | 可视化选择实验类型（auto/manual）、环境类型、判定规则模板 |
| **依赖配置器** | 点选/搜索依赖，自动生成 `dependencies/` 目录 |
| **一键导出** | 自动打包为 `.labpkg` 文件 |
| **预览模式** | 在 LearnLab 里直接预览实验包效果（不导出也能测试） |
| **模板系统** | 提供常见学科模板（MySQL 实验模板、Python 编程模板、数学公式模板） |

> **没有 LabKit，LearnLab 只有程序员能制作实验包。有了 LabKit，任何教授都能为自己课程制作实验包——这才是生态真正转起来的关键。**

### 实验包编辑能力（核心 vs LabKit 分工）

LearnLab 的设计原则是：**播放器自带轻编辑，重编辑交给 LabKit**。

**核心自带（轻编辑）**：

```
新建/编辑 content.md      → Markdown 编辑器（已有关联标签页）
编辑 manifest.yaml         → YAML 编辑器（带语法校验）
编辑实验卡片 YAML          → YAML 编辑器（带卡片 schema 提示）
添加/删除章节              → 目录树右键菜单
新建笔记（已有）            → 自动保存为 .md
导出为 .labpkg             → 一键打包
```

**LabKit 负责（重编辑）**：可视化、拖拽式、面向非编程用户的实验包创作。

**两者可以互相调用**——在 LearnLab 里觉得"这个实验包需要大改"，点"在 LabKit 中打开" → 自动切换到 LabKit，改完保存后 LearnLab 自动刷新喵~！

---

## 📄 Markdown 渲染架构

LearnLab 用 **标准解析器 + 标准扩展 + 自定义渲染层** 的策略——**不魔改解析器**，但深度定制渲染效果。这样语法保持兼容（Obsidian/Typora 也能显示），渲染效果却只有 LearnLab 有喵~！

### 解析层（标准，不魔改）

| 组件 | 用途 |
|:---|:---|
| **markdown-it** | 业界标准 Markdown 解析器（VS Code 同款） |
| **GFM 扩展** | 表格、任务列表、删除线 |
| **markdown-it-admonition** | 彩色旁注（NOTE/TIP/IMPORTANT/WARNING/CAUTION） |
| **markdown-it-texmath** | LaTeX 公式（KaTeX 渲染） |
| **markdown-it-front-matter** | YAML 元数据解析 |

### 渲染层（LearnLab 的定制空间）

**Admonition 彩色旁注**（`> [!类型]` 语法，兼容 Obsidian/Typora/MkDocs）：

```markdown
> [!NOTE]
> 这是普通笔记（蓝色块）

> [!TIP]
> 这是实用建议（绿色块）

> [!IMPORTANT]
> 这是必须注意的重点（紫色块）

> [!WARNING]
> 这是警告（橙色块）

> [!CAUTION]
> 这是危险操作（红色块）
```

LearnLab 渲染成**漂亮的渐变色卡片**，并支持自定义图标和折叠：

```
┌─ 📘 NOTE ────────────────────────┐
│ 这是普通笔记（蓝色块）             │
└──────────────────────────────────┘
```

**LearnLab 独有容器**（`::: 类型` 语法，markdown-it-container 机制）：

```markdown
::: lab-card{id="ch2-3-1"}
<!-- 渲染成可交互的实验卡片组件 -->
:::

::: formula
E = mc²
<!-- 渲染成 KaTeX 公式块 -->
:::

::: mermaid
graph LR; A-->B
<!-- 渲染成 Mermaid 流程图 -->
:::

::: code-block{lang="java"}
// 渲染成带复制按钮的代码块
:::
```

### 为什么"标准扩展 + 自定义渲染"而不是"魔改"？

| 方案 | 优点 | 缺点 |
|:---|:---|:---|
| **魔改解析器** ❌ | 可以发明任意语法 | 与生态脱节；内容换平台就废；维护成本高 |
| **标准扩展 + 自定义渲染** ✅ | 语法通用（Obsidian 也能显示同样的旁注）；渲染惊艳；维护简单 | 语法受限于既有生态（但已很丰富，够用） |

**关键原则**：内容不锁死在 LearnLab——教授写的教材，学员可以拿到任何 Markdown 编辑器里继续阅读，LearnLab 的价值在于**渲染体验**而不是**语法垄断**喵~！

---

## 🎨 主题与外观（插件化）

LearnLab 的视觉风格遵循同样的"极简内核 + 插件扩展"理念——**默认只内置 1 套主题，其他主题全靠插件提供**喵~！

### 设计原则

- 内置主题：**一对默认主题（浅色 + 深色）**，跟随系统自动切换（`prefers-color-scheme`）
- 内置这一对是为了**跟随系统**——用户系统是深色模式，LearnLab 也得是深色，这是基础体验，不能靠插件喵~ (｀・ω・´)
- 其他主题 = 插件：用户想要玻璃拟态、护眼绿等风格，安装对应主题插件
- 字体同理：字体插件可提供等宽字体（编程）、中文优化字体（阅读）等
- 核心只提供**主题接口**（CSS 变量），不做死的主题

### 主题接口（CSS 变量）

```css
/* 主题插件的核心：提供一套颜色变量 */
:root {
  --color-bg: #ffffff;            /* 背景 */
  --color-bg-sidebar: #f7f6f3;    /* 侧边栏 */
  --color-fg: #37352f;            /* 文字 */
  --color-fg-muted: #787774;      /* 次要文字 */
  --color-accent: #007acc;        /* 主色 */
  --color-card: #ffffff;          /* 卡片背景 */
  --color-border: #ededec;        /* 边框 */
  --color-code-bg: #f7f6f3;       /* 代码块背景 */
  --font-body: -apple-system, "PingFang SC", sans-serif;
  --font-mono: "SF Mono", Menlo, Consolas, monospace;
  --radius: 8px;
}
```

任何主题插件只需要**实现这套变量**，LearnLab 核心的组件（目录树、标签页、实验卡片、终端、按钮）都会自动适配——**核心代码零改动**喵~！

### 主题插件清单（规划）

| 主题 | 风格 | 状态 |
|:---|:---|:---:|
| **learnlab-light**（默认·浅色） | Notion 浅色极简 | ✅ 内置 |
| **learnlab-dark**（默认·深色） | VS Code 深色工具风 | ✅ 内置（跟随系统） |
| **learnlab-glass** | 玻璃拟态现代风 | 📦 插件 |
| **learnlab-sepia** | 护眼纸感（阅读模式） | 📦 插件 |
| **learnlab-midnight** | 深蓝夜读 | 📦 插件 |
| **learnlab-contrast** | 高对比主题 | 📦 后续可选插件；不属于 MVP 无障碍承诺 |

> 内置浅色/深色跟随系统自动切换，且支持用户手动覆盖（设置里可固定某一套）喵~

---

## 🗂️ 文件系统规范：学习区、实验包与动态运行区

LearnLab 采用“学习区数据库 + 实验包数据库”的两层模型。学习区负责组织实验包、软连接和共享依赖；实验包负责自身的实验状态、阅读进度和运行历史。MySQL、Python、C++ 以及其他环境均由插件提供；核心内置的 SQLite 只用于这些 LearnLab 元数据，不承担任何 MySQL 环境职责。

### 学习区目录

```text
学习区/
├── .learnlab/
│   └── workspace.db       # 实验包、软连接、显示顺序和依赖状态
├── dependencies/          # 当前学习区共享依赖（按指纹复用）
│   ├── mysql/<fingerprint>/
│   └── python/<fingerprint>/
├── mysql-intro/           # 实验包目录，可为真实目录或软连接
│   ├── manifest.yaml
│   ├── chapters/
│   └── .learnlab/
│       ├── package.db     # 实验状态、章节阅读进度、会话状态摘要
│       ├── tmp/            # 临时环境和编译产物
│       └── experiment_history/ # 每次实验的输入、输出、错误和通过结果
└── python-intro/
    └── ...
```

### 数据归属

| 数据 | 所在位置 | 说明 |
|:---|:---|:---|
| 学习区内有哪些包 | 学习区 `.learnlab/workspace.db` | 记录包路径、软连接、顺序、展示信息和依赖状态 |
| 实验包有哪些实验 | 实验包 `.learnlab/package.db` | 使用 manifest 的 `experiment_count`，扫描结果用于校验和定位 |
| 阅读位置和已读状态 | 实验包 `package.db` | 按章节内容指纹保存 |
| 每次运行的细节 | `experiment_history/` | 保存代码/命令、输出、报错、判定和产物 |
| 用户设置和插件设置 | `~/.learnlab/config.json` | 可手动导出/导入 |
| 用户笔记正文 | `notesDir/*.md` | Markdown 文件，元数据可在 package.db 或重建索引中保存 |
| 学习区共享依赖 | `<workspace>/dependencies/` | 由 `DependencyManager` 按指纹复用的实际依赖 |

### 进度和移动限制

- LearnLab 不提供跨路径的进度迁移协议。
- `package.db` 随实验包目录保存，但 LearnLab 只通过学习区数据库登记的路径识别它；因此“复制整个学习区”通常可保留进度，单独移动/复制包则不保证被重新绑定。
- 如果实验包被移动、复制到新的学习区或通过未登记的路径打开，默认按新的安装位置处理；原阅读进度不提供跨路径迁移保证，可能无法自动识别，界面应明确提示这一限制。
- 用户如需保留内容，应复制完整学习区目录和 `config.json`，不要只复制单个文件。
- 同一个实验包安装到两个地方不作为正式使用场景；如果确实需要共享内容，学习区可以登记软连接。
- 删除学习区前必须确认会删除其包目录和本地进度；删除软连接时不得误删目标目录。

### 静态区与动态区

- `manifest.yaml`、`chapters/` 等是包静态内容；升级时只替换静态文件。
- `.learnlab/tmp/` 可安全清理，不得影响阅读进度或实验历史。
- `.learnlab/package.db` 和 `experiment_history/` 属于用户运行数据，普通包升级保留。
- 用户编辑官方包时仍应使用“Fork/派生副本”，避免升级覆盖作者内容。

## 📦 实验包市场（源机制）

LearnLab 不维护中心化市场，支持两种来源：

1. GitHub 仓库中的实验包或索引；
2. 用户自行管理的自定义源，包括 `https://`、局域网地址和 `file://`。

源机制只负责发现、下载和完整性校验，不替用户判断源的内容质量，也不承诺自定义源本身可信。用户导入前仍应查看作者、目标、前置知识、环境、日志和许可证信息。

### 最小源配置

```json
{
  "sources": [
    {
      "name": "官方 GitHub 源",
      "url": "https://example.org/learnlab/index.json",
      "enabled": true
    },
    {
      "name": "本地源",
      "url": "file:///Users/me/my-lab-packages/index.json",
      "enabled": true
    }
  ]
}
```

### 下载和导入要求

- `index.json` 至少提供 `package_id`、版本、作者、描述、下载地址、文件大小和 SHA-256；
- 下载完成后必须校验文件大小和 SHA-256，不一致则拒绝导入；
- 支持失败重试，但不在后台静默安装；
- 解压采用临时目录，导入成功后再移动到学习区；
- 目标文件已经存在时必须让用户选择覆盖、并存或取消；
- 源的星标、作者信息和日志可以展示，但不等于官方背书。

## 🔄 实验包版本管理

### 身份和版本

```yaml
package_id: "org.learnlab.mysql-intro"
name: "MySQL 入门教程"
version: "1.2.0"
author: "NJUPT 数据库教研组"
goal: "掌握关系型数据库基础操作"
prerequisites: ["基础计算机操作"]
environment: "由 org.learnlab.mysql 插件提供"
logs: "已知限制和变更记录见仓库日志"
license: "CC BY-NC-SA 4.0"
signature: "..."       # 可用于标识作者发布的包；不替代下载完整性校验
experiment_count: 5
required_plugins:
  - id: "org.learnlab.mysql"
    version: ">=1.1.0 <2.0.0"
    provides: ["environment.mysql", "validator.mysql-schema"]
runtime_dependencies:
  - kind: mysql
    version: ">=8.0"
```

`package_id` 是稳定身份，`name` 只是展示名称。前置依赖必须引用 `package_id`，不能只引用中文名称。

### 升级规则

| 更新类型 | 默认行为 |
|:---|:---|
| 内容未改变、修复打包问题 | 可提示用户更新，保留阅读进度 |
| 新增章节/实验 | 可选更新；已有未变章节继续保留已读状态 |
| 修改已有章节内容 | 依据章节内容指纹，将被修改章节重置为 0% |
| 修改实验判定规则 | 提示用户；旧的 `experiment_history` 永久保留 |
| 主版本或包身份变化 | 作为新包安装，旧包和旧进度保留 |

不提供复杂的自动迁移 DSL。稳定的章节/实验 ID 和内容指纹足以支持当前项目需要；确实无法对应时，显示为历史记录而不是伪造迁移成功。

### 尝试历史

每次实验运行的具体细节写入当前包的 `experiment_history/`，而不是塞入全局数据库：

```json
{
  "attempt_id": "attempt-20260901-001",
  "lab_id": "ch2-3-1",
  "started_at": "2026-09-01T21:32:05+08:00",
  "duration_ms": 2350,
  "input": { "code": "CREATE TABLE ...", "command": "mysql -e ..." },
  "output_tail": "Query OK, 0 rows affected",
  "validation": { "passed": false, "score": 3, "total": 5 },
  "error": null
}
```

数据库只保留实验状态和历史索引；完整输入、输出、报错和产物由 `experiment_history/` 负责。历史文件可被用户复制、导出或手动删除。

## 🧩 实验包前置依赖（DAG）

实验包可以在作者说明中写明前置知识和推荐顺序。MVP 不强制建立跨包依赖 DAG，也不把“完成前置包”作为运行条件；后续如确有需求，再由插件或包元数据扩展。

导入进阶实验包时：

```
用户导入实验包
       ↓
LearnLab 检查 prerequisites
       ↓
┌─── "MySQL 入门教程" 已安装且已完成？───┐
│        是                  否 / 未安装         │
│         ↓                   ↓                  │
│     ✅ 允许导入      ❌ 提示用户：              │
│                       "此实验包需要先完成      │
│                        《MySQL 入门教程》"      │
│                       [去安装] [取消]           │
└──────────────────────────────────────────────┘
```

当用户完成一个实验包后，LearnLab 可以自动推荐：
> "恭喜完成《MySQL 入门教程》！推荐下一步：📚 MySQL 进阶教程、📚 Redis 入门"

---

## 🔎 当前学习区全文搜索

搜索面向当前已经打开的学习区，MVP 索引该学习区所有已登记实验包的章节 Markdown 正文，不跨学习区搜索。用户打开学习区并开始学习后，LearnLab 在后台建立可重建索引；索引未完成时仍可使用基础文本搜索。搜索结果显示实验包名称和章节路径，并跳转到对应章节和匹配位置。索引属于缓存，不是学习数据的唯一事实来源，损坏或删除后可以重新生成。实验卡片和笔记搜索可以在后续版本按需加入。

## 🧠 记忆系统（断点续读）

> 设计决策（2026-08-14）：**用户学到哪、看到哪、用什么语言看的，关闭时必须留记录**——不然每次打开都从头开始，体验灾难喵~ (´･ω･`)

### 记录内容

LearnLab 在关闭/切换页面时自动记录（本地 SQLite，无需用户手动保存）：

| 记录项 | 示例 | 用途 |
|:---|:---|:---|
| **当前位置** | `ch2-3`（第 2 章第 3 节） | 重新打开 → 直接跳到上次位置 |
| **滚动位置** | `scroll_y: 1450` | 长文档也不用从头读 |
| **打开的标签页** | `["ch2-3", "lab-2-3-1", "note-1"]` | 恢复多标签工作状态 |
| **当前实验状态** | 实验 2-3-1 尝试中、步骤进度 | 实验中断续做 |
| **显示语言** | `zh-CN` | 按用户当时看的语言恢复 |

### 恢复策略

```
用户关闭 LearnLab → 自动保存所有会话状态
用户重新打开 LearnLab → 读取上次会话 → 提示：
  "上次学到「2.3 数据类型」，继续？[继续] [从头开始]"

→ 点击继续：恢复到 章节 + 滚动位置 + 打开的标签页 + 语言
```

### 设计要点

- **自动**：关闭即存，无需用户按保存键
- **多实验包隔离**：每个实验包独立记录位置，互不干扰
- **多语言隔离**：语言是记录项的一部分——用户在中文环境看到 ch3，切英文后进度独立可追溯（配合多语言设计）
- **导出友好**：设置可导出为 JSON；学习区和实验包可由用户自行复制备份
- **隐私**：核心不上传数据；如启用第三方同步插件，认证、传输和冲突处理由插件负责喵~

---

## 📤 数据导入导出（不内置云同步）

LearnLab 核心不提供账号、服务器、云端数据库或“云同步”服务。核心只提供本地设置的 JSON 导入/导出。

`config.json` 包含：

- LearnLab 界面设置；
- 工作区路径和最近打开记录；
- 源配置；
- 插件启用状态和插件设置；
- 用户自定义快捷键；
- 必要的信任决策摘要。

用户可以手动复制这个 JSON，或者使用设置页的“导出配置 / 导入配置”。实验包、实验包数据库、笔记和 `experiment_history` 不通过设置导入导出携带；需要备份时，用户自行复制学习区目录和配置 JSON。

如果第三方作者希望接入 WebDAV、Git、网盘或学校服务器，可以作为插件实现。插件自行负责认证、冲突处理和数据格式，不能要求 LearnLab 核心默认拥有网络服务。

## 🧱 数据库版本与 migration

`workspace.db` 和 `package.db` 的 schema 属于 LearnLab 软件本体，不属于实验包或插件。数据库版本升级跟随软件本体升级：核心代码内置按顺序排列的 migration 函数，每个函数对应一个唯一 schema 版本号，启动时读取数据库版本并执行缺少的 migration。

执行规则：

- migration 只由核心代码执行，插件不能修改核心数据库 schema；
- migration 必须幂等或在版本记录保护下只执行一次；
- 每次 migration 尽量在事务中完成；
- 失败时保留原数据库文件，进入只读/恢复提示，不静默覆盖；
- schema 变化需要同步更新数据模型和测试；
- 用户导入/导出配置 JSON 不携带数据库 migration。

## 💾 存储策略与目录规范

| 数据 | 格式/位置 | 事实来源 |
|:---|:---|:---|
| 全局设置、插件设置 | `~/.learnlab/config.json` | JSON 文件 |
| 学习区包清单、软连接、顺序 | `<workspace>/.learnlab/workspace.db` | 学习区数据库 |
| 包内实验索引、阅读进度、实验摘要 | `<package>/.learnlab/package.db` | 实验包数据库 |
| 实验运行细节、报错、输出、产物 | `<package>/.learnlab/experiment_history/` | 历史文件 |
| 临时环境和编译缓存 | `<package>/.learnlab/tmp/` | 可清理缓存 |
| 笔记正文 | `notesDir/` 下 `.md` | Markdown 文件 |
| 笔记检索索引 | 可从 Markdown 重建 | SQLite 或后续索引实现 |
| 学习区全文搜索索引 | `<workspace>/.learnlab/tmp/search-index/` | 可删除、可重建的缓存 |

### 默认目录

```text
~/.learnlab/
├── config.json
├── workspaces/
│   ├── Java/
│   │   ├── .learnlab/workspace.db
│   │   ├── dependencies/
│   │   │   └── python/<fingerprint>/
│   │   ├── java-intro/.learnlab/package.db
│   │   └── java-intro/.learnlab/experiment_history/
│   └── 大学课程/
├── notes/
└── plugins/
```

### 自定义路径和保护

`config.json` 固定在 `~/.learnlab/` 下；`workspacesDir`、`notesDir`、`pluginsDir` 和依赖缓存策略可配置，但学习区的 `dependencies/` 始终跟随对应学习区。

- 启动时发现路径不存在，提示用户插入外接盘或选择临时默认目录；
- 生效前检查可读写权限；
- 自定义路径只影响对应数据，不改变配置锚点；
- 不提供自动快照；用户需要备份时自行复制学习区和配置 JSON。

## 📁 源码工程仓库结构（Monorepo）

> 详细的源码目录、插件语言边界、实验包目录和用户运行时目录见[项目结构与语言边界](PROJECT_STRUCTURE.md)。这里保留架构层面的最小说明，避免把源码仓库和学习区混为一谈。

LearnLab 采用 **pnpm workspace + Electron + TypeScript + Preact**。源码仓库和用户学习区是两个完全不同的概念：

```text
源码仓库 learnlab/
├── apps/desktop/       # Electron 宿主，TypeScript/TSX
├── packages/           # core-types、core、plugin-sdk 等可复用 TypeScript 包
├── plugins/            # 官方插件；桥接层优先 TypeScript，runtime 语言不限
├── tools/labkit/       # 实验包校验/预览/打包 CLI，TypeScript
├── examples/packages/  # 开发用样例实验包
├── tests/              # 跨包行为测试
└── docs/               # 设计文档

用户学习区/
├── .learnlab/workspace.db
├── dependencies/       # 当前学习区共享依赖
└── 各个实验包/         # Markdown、资源和任意语言的实验代码
```

目录职责和语言规则如下：

- 宿主应用、核心协议、SDK 和 LabKit 是 TypeScript 主线；
- 官方插件的 `src/` 是桥接层，MVP 优先 TypeScript；
- 插件的 `runtime/` 是可选外部环境进程，可以使用 Python、Rust、C/C++、Java 等；
- 实验包不是 TypeScript 工程，正文使用 Markdown，实验代码由具体环境插件决定；
- `packages/` 只表示源码公共包，不表示用户安装的实验包；
- 学习区 `dependencies/` 是运行时依赖目录，不参与 pnpm workspace。

## 🛠️ 技术栈（本地版）


> 2026-09-01 更新：前端框架确认为 Preact，存储策略确认为 JSON（设置）+ SQLite（其余）。

| 层 | 决策状态 | 方案 |
|:---|:---|:---|
| **桌面壳** | ✅ 已定 | Electron（跨平台，VS Code 同款） |
| **主线语言** | ✅ 已定 | TypeScript |
| **高性能内核** | ✅ 已定 | LearnLab 不内置环境内核；具体环境由插件通过独立 CLI/进程接入，Rust/C++ 只在插件确有需要时使用 |
| **前端框架** | ✅ 已定 | **Preact + TypeScript**（3KB，API 与 React 一致，electron-vite 原生支持 JSX） |
| **终端** | ✅ 已定 | xterm.js + node-pty（通过插件提供） |
| **Markdown 渲染** | ✅ 已定 | markdown-it + admonition |
| **Markdown 编辑器** | ✅ 已定 | CodeMirror 6（LabKit 用，轻量库） |
| **构建打包** | ✅ 已定 | electron-vite + electron-builder |
| **存储** | ✅ 已定 | JSON（设置/配置）+ SQLite（进度/会话/笔记索引，better-sqlite3） |
| **包格式** | ✅ 已定 | `.labpkg`（ZIP），也支持目录导入 |
| **仓库结构** | ✅ 已定 | monorepo（内核+插件+LabKit 同仓，pnpm workspace） |
| **界面 i18n** | ✅ 已定 | MVP 不做，留好 i18n 结构，先中文 |
| **自动更新** | ✅ 已定 | 不上 |
| **插件加载机制** | ✅ 方向已定 | 独立插件宿主进程 + 白名单 API；具体消息格式随示例插件收敛 |
| **插件 API 清单** | ⏳ MVP 后稳定 | 先实现 MySQL/终端两个示例插件，再发布最小 SDK |
| **数据库 schema** | ⏳ MVP 前冻结 | 学习区 `workspace.db` + 实验包 `package.db`，其他数据库暂不增加 |

---

## ⚠️ 设计红线

- **本地优先**：核心离线可用，不依赖账号和服务器；GitHub/自定义源、依赖安装等网络能力只在用户主动使用时出现
- **不做容器**：用户本地环境直接跑，安全由用户自己负责
- **不做内容生产**：LearnLab 核心不生产实验包，但提供 LabKit 工具降低内容创作门槛
- **不强制自动判定**：是否自动判定由实验和领域插件决定；不适合自动判定的学科允许用户自判
- **插件与实验包分离**：运行时相互解耦；源码可以在同一 monorepo，发布和版本独立
- **插件作用域有限**：默认仅能访问 LearnLab API、插件自身目录和当前实验包目录
- **核心不提供云同步**：只提供配置 JSON 导入/导出；云服务接入由第三方插件自行实现
- **插件优先**：内核不原生支持任何实验环境；MySQL、Python 及其他专业环境全部通过插件提供，SQLite 仅用于 LearnLab 自身数据
