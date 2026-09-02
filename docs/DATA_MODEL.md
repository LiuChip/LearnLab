# 数据模型

> 相关文档：[插件加载与 API 设计](superpowers/specs/2026-09-01-plugin-loading-and-scoped-permissions-design.md) · [架构设计](ARCHITECTURE.md) · [安全机制](SECURITY.md) · [路线图](ROADMAP.md)

## 目标

LearnLab 只保留两层数据库，避免把学习区组织关系和实验包运行状态混在一起：

1. 每个学习区一个 `workspace.db`；
2. 每个实验包一个 `package.db`；
3. 全局设置和插件设置使用 `~/.learnlab/config.json`；
4. 实验运行细节使用实验包内的 `experiment_history/` 文件。

## 学习区数据库：`workspace.db`

学习区数据库负责“有哪些包、包在哪里、如何展示，以及当前学习区依赖如何复用”，不保存实验运行细节。

建议实体：

| 实体 | 关键字段 | 用途 |
|:---|:---|:---|
| `packages` | `package_id`, `path`, `version`, `display_name` | 登记实验包目录或软连接 |
| `links` | `link_path`, `target_path` | 记录学习区中的软连接 |
| `workspace_settings` | `key`, `value` | 学习区级显示设置 |
| `dependency_records` | `kind`, `fingerprint`, `path`, `status` | 记录共享依赖的实际位置和安装状态 |
| `package_dependencies` | `package_id`, `dependency_fingerprint`, `requirement` | 记录包声明与共享依赖实例的对应关系 |

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
| `sessions` | `active_tab`, `scroll_state`, `language` | 会话恢复 |
| `note_index` | `note_id`, `path`, `chapter_id`, `tags` | 后续版本的笔记检索索引，可重建 |

## 正文搜索索引

全局搜索面向当前打开的学习区，可以搜索该学习区内所有已登记实验包的章节 Markdown 正文；不跨学习区搜索。索引在后台建立，是可删除、可重建的缓存，不作为学习进度或实验历史的事实来源，放在 `<workspace>/.learnlab/tmp/search-index/`，不纳入备份要求。

## 实验历史文件

每次实验写入：

```text
<package>/.learnlab/experiment_history/
└── <lab_id>/
    ├── attempt-20260901-001.json
    ├── attempt-20260901-001.input
    ├── attempt-20260901-001.output
    └── artifacts/
```

具体文件是否拆分由适配器决定，但必须能够阅读、复制和删除。数据库只保存历史索引或摘要，不以 SQLite 作为大日志和实验产物容器。

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
- 包升级不得覆盖 `.learnlab/` 动态区；
- 内容指纹变化时，只有对应章节阅读进度重置为 0%；新增且未改动的章节不影响原有章节进度；
- `experiment_count` 由作者声明，manifest 更新时若作者声明变更则更新展示和统计；
- 插件设置、插件启用/全局或包级激活状态及用户授权摘要属于 `config.json`，可以随配置 JSON 导入/导出；
- 实验包移动到未登记位置时，默认视为新安装位置，直接丢失原进度绑定，不做复杂迁移；
- 学习区 `dependencies/` 的实际文件不写入配置 JSON，备份时随整个学习区复制。
