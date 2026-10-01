# 数据模型

> 相关文档：[插件加载与 API 设计](superpowers/specs/2026-09-01-plugin-loading-and-scoped-permissions-design.md) · [依赖仓库与独立运行时](superpowers/specs/2026-09-02-dependency-repository-and-managed-runtimes-design.md) · [架构设计](ARCHITECTURE.md) · [安全机制](SECURITY.md) · [路线图](ROADMAP.md) · [公开决策索引](DECISIONS.md)

## 目标

LearnLab 只保留两层数据库，避免把学习区组织关系和实验包运行状态混在一起：

1. 每个学习区一个 `workspace.db`；
2. 每个实验包一个 `package.db`；
3. 全局设置和插件设置使用 `~/.learnlab/config.json`；
4. 实验运行细节使用实验包内的 `experiment_history/` 文件。

### 数据决策的冻结边界

存储归属已经确定：学习区数据库负责包登记、软连接和共享依赖；实验包数据库负责章节、阅读进度和轻量实验摘要；详细运行数据放在 `experiment_history/`；插件设置随配置 JSON 导入/导出。完整表结构、迁移版本、跨路径重连、搜索索引、历史清理和 UI 会话持久化仍未冻结，见[公开决策索引](DECISIONS.md)的 `DATA-*` 条目。

当前代码使用 `<workspace>/workspace.db`、`<package>/package.db` 和 `<package>/experiment_history/`。早期示意图中的 `.learnlab/` 子目录不是现行持久化路径；如果未来迁移，必须设计兼容、备份与回滚，见[路线图 M2](ROADMAP.md)。

## 学习区数据库：`workspace.db`

学习区数据库负责“有哪些包、包在哪里、如何展示，以及当前学习区依赖如何复用”，不保存实验运行细节。

### 当前文件格式和运行时兼容

`workspace.db` 与 `package.db` 是逻辑数据库名称，不保证文件内容一定是 SQLite。
为兼容当前 Node 开发工具和 Electron 29 两种运行时，新建的持久数据库默认使用
LearnLab 的便携 JSON driver；现有便携文件继续按该格式打开。内存数据库可在运行时
支持时使用 `node:sqlite`。预先存在的 0 字节数据库占位文件按新便携数据库初始化。
已有 SQLite 文件会在支持 `node:sqlite` 的运行时中继续
使用原生 driver；不支持时明确拒绝打开并提示运行时不兼容，不把文件当作 JSON
解析或覆盖。

便携 driver 只支持 LearnLab migration 和 repository 当前使用的 SQL 子集，不是
通用 SQLite 实现，也不承诺可由任意 SQLite 工具直接打开。未来若统一 Electron/Node
运行时或引入正式 SQLite 依赖，需要先设计格式迁移和回滚，不能静默改写已有文件。

建议实体：

| 实体 | 关键字段 | 用途 |
|:---|:---|:---|
| `packages` | `package_id`, `path`, `version`, `display_name` | 登记实验包目录或软连接 |
| `links` | `link_path`, `target_path` | 记录学习区中的软连接 |
| `workspace_settings` | `key`, `value` | 学习区级显示设置 |
| `dependency_records` | `dependency_id`, `version`, `platform`, `arch`, `sha256`, `path`, `source_type`, `source_package_id`, `status` | 记录共享独立运行时的实际位置、来源和准备状态 |
| `package_dependencies` | `package_id`, `dependency_id`, `required_version`, `resolved_version`, `resolved_sha256`, `source_type`, `status` | 记录包声明与实际共享依赖实例的对应关系 |

`path` 是本地位置，不作为跨设备稳定身份。实验包移动到未登记的位置时，可以被视为新安装位置，原进度不承诺保留。

## 实验包数据库：`package.db`

实验包数据库负责“这个包有哪些章节、用户读到哪里、实验当前是什么状态”。章节可以由 LearnLab 扫描 Markdown 文件建立索引；实验总数以作者在 manifest 声明的 `experiment_count` 为准，扫描结果用于校验和定位，而不是替换作者的统计口径。

建议实体：

| 实体 | 关键字段 | 用途 |
|:---|:---|:---|
| `chapters` | `chapter_id`, `relative_path`, `content_hash`, `order_index` | 从 Markdown 发现的章节索引和内容指纹 |
| `reading_progress` | `chapter_id`, `scroll_y`, `completed_at`, `content_hash` | 断点续读和已读状态 |
| `labs` | `lab_id`, `chapter_id`, `status`, `attempt_count` | 实验摘要，不保存完整日志 |
| `package_metadata` | `declared_experiment_count`, `manifest_hash` | 作者声明的实验数和当前 manifest 指纹 |
| `sessions` | `key`, `value` | 已有内部表；完整 UI 会话恢复尚未接线 |
| `note_index` | `note_id`, `path`, `chapter_id`, `tags` | 后续候选，当前未建表 |

## 正文搜索

当前核心的 `searchWorkspace` 遍历当前学习区内已登记实验包的章节 Markdown 正文；**没有后台搜索索引文件**。现行 MVP 界面设计先开放当前文件查找，正式 renderer 尚需从现有学习区搜索入口改成这一交互。未来若开放跨文件搜索并引入索引，索引只能是可删除、可重建缓存，不能成为进度或历史的事实来源；具体路径和更新策略届时再定。

## 实验历史文件

当前历史模块每次写入一个 JSON 记录；真实实验执行和历史界面尚未接入：

```text
<package>/experiment_history/
└── <lab_id>/
    └── attempt-<timestamp>-<attempt-id>.json
```

未来若拆分输入、输出或产物文件，需要先确定清理与隐私规则。数据库只保存历史摘要，不把 `.db` 当作大日志和实验产物容器。

## 配置 JSON

`~/.learnlab/config.json` 至少包含：

```json
{
  "storage": {
    "workspacesDir": "~/.learnlab/workspaces",
    "notesDir": "~/.learnlab/notes",
    "pluginsDir": "~/.learnlab/plugins"
  },
  "plugins": {
    "org.learnlab.mysql": {
      "enabled": true,
      "activation": "package",
      "settings": {},
      "grants": []
    },
    "org.learnlab.vim-mode": {
      "enabled": true,
      "activation": "global",
      "settings": {},
      "grants": []
    }
  },
  "sources": [],
  "shortcuts": {}
}
```

设置导出/导入只处理这个 JSON。学习区、实验包、笔记和运行历史需要用户自行复制。

## 一致性规则

- 数据库 schema 版本属于 LearnLab 软件本体版本管理，不由实验包或插件自行升级；
- migration 由核心代码中硬编码的、有序 migration 函数执行，每个 migration 有唯一版本号并记录在数据库中；
- 软件升级时先备份/复制数据库文件，再在事务中执行适用 migration；失败则保留原文件并进入只读或恢复提示；
- 数据库损坏时优先进入只读模式；
- 笔记索引可以从 Markdown 文件重建；
- 清理 `tmp/` 不得删除数据库和 `experiment_history/`；
- 删除软连接不得删除目标目录；
- 包升级不得覆盖当前根目录的 `package.db` 和 `experiment_history/`；未来若增加独立运行临时目录，也不得覆盖用户数据；
- 内容指纹变化时，只有对应章节阅读进度重置为 0%；新增且未改动的章节不影响原有章节进度；
- `experiment_count` 由作者声明，manifest 更新时若作者声明变更则更新展示和统计；
- `runtime_dependencies` 记录 LearnLab 管理的独立运行时需求；`external_prerequisites` 记录系统级前置软件，二者不能混为一谈；
- 依赖仓库下载或实验包 `bundled-dependencies/` 导入后的实际文件统一写入当前学习区 `dependencies/`；
- 依赖导入成功前不得更新为可用状态；失败不得留下半成品目录；
- 相同依赖内容按 SHA-256 复用，不同哈希可以并存；
- 插件设置、插件启用/全局或包级激活状态及用户授权摘要属于 `config.json`，可以随配置 JSON 导入/导出；
- 实验包移动到未登记位置时，默认视为新安装位置，直接丢失原进度绑定，不做复杂迁移；
- 学习区 `dependencies/` 的实际文件不写入配置 JSON，备份时随整个学习区复制。
