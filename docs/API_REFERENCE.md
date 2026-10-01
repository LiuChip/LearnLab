# LearnLab API Reference

> 本文档是 LearnLab 当前代码中可被外部代码看到的 API 和接口唯一登记表。
> “外部”包括 renderer、workspace 内其他包、LabKit 使用者和 manifest 消费者；
> 不代表这些接口已经是第三方插件 SDK。
>
> 接口审计日期：2026-09-26；2026-10-01 重新核对文档状态与文件格式边界，未在本轮新增公开接口
> 当前实现版本：0.1.0
> 状态：实验性，随代码审查同步维护

## 稳定性标签

| 标签                | 含义                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `renderer-host`     | 通过 `window.learnlab` 给受信任 renderer 的宿主接口，不是插件接口。 |
| `workspace-export`  | workspace 包的导出；包当前为 private，只供仓库内部集成。            |
| `format-contract`   | manifest、数据库记录或设置 JSON 等数据格式接口。                    |
| `experimental-core` | 已实现但字段、语义或安全边界仍可能变化的纯逻辑/类型。               |
| `internal`          | 进程间实现细节或应用内部模块，不得由插件直接调用。                  |
| `not-available`     | 设计中提到但当前没有实现的能力。                                    |

本表只登记已存在于代码或已被运行时消费的接口。计划能力必须写在“未开放
能力”中，不能提前写成调用示例。

## 外部表面总览

| 表面                    | 入口                                             | 状态                                     | 面向插件       |
| ----------------------- | ------------------------------------------------ | ---------------------------------------- | -------------- |
| Desktop renderer bridge | `window.learnlab`                                | `renderer-host`                          | 否             |
| Electron IPC            | `ipcMain.handle` channel                         | `internal`                               | 否             |
| Core type package       | `@learnlab/core-types`                           | `workspace-export` / `experimental-core` | 否             |
| Core package            | `@learnlab/core`                                 | `workspace-export` / `experimental-core` | 否             |
| Markdown package        | `@learnlab/markdown`                             | `workspace-export`                       | 否             |
| LabKit package          | `@learnlab/labkit`                               | `workspace-export`                       | 实验包作者工具 |
| Package manifest        | `<package>/manifest.yaml`                        | `format-contract`                        | 声明接口       |
| Plugin manifest         | `<plugin>/manifest.yaml`                         | `format-contract` / experimental         | 声明接口       |
| UI source               | `apps/desktop/src/renderer`、`apps/ui-prototype` | `internal`                               | 否             |

### Renderer 内部标签页状态

`apps/desktop/src/renderer/stores/tabStore.ts` 提供 renderer 内部使用的实验性纯状态函数：

```ts
interface EditorTab {
  id: string
  title: string
  kind: 'chapter'
  packageId: string
  chapterId: string
}

interface EditorTabsState {
  tabs: EditorTab[]
  activeTabId: string | null
}

createEditorTabsState(): EditorTabsState
createChapterTabId(packageId: string, chapterId: string): string
openEditorTab(state: EditorTabsState, tab: EditorTab): EditorTabsState
activateEditorTab(state: EditorTabsState, tabId: string): EditorTabsState
closeEditorTab(state: EditorTabsState, tabId: string): EditorTabsState
```

稳定性标签为 `internal`：当前仅支持章节标签，不是插件注册接口，也不支持预览/固定/脏状态、多编辑组或会话持久化。章节标签 ID 由包 ID 和章节 ID编码生成，避免不同实验包的同名章节碰撞。重复打开已有 ID 只改变活动标签；未知 ID 操作返回原状态；关闭活动标签优先激活右侧相邻标签，其次激活左侧标签，关闭最后一个标签返回空状态。该状态不持有文件路径、Node/Electron 对象、IPC 句柄或权限信息。

### Renderer 内部 Workbench 状态

以下接口均为 `internal`，只服务正式 renderer，不是插件 UI 注册协议：

```ts
// stores/workbenchStore.ts
createWorkbenchState(): WorkbenchState
selectActivity(state, activity): WorkbenchState
setBottomPanel(state, panel): WorkbenchState
addNotification(state, input): WorkbenchState
expireNotification(state, notificationId): WorkbenchState
dismissNotification(state, notificationId): WorkbenchState
clearNotifications(state): WorkbenchState
toggleNotificationCenter(state): WorkbenchState
getUnreadNotificationCount(state): number

// stores/notificationTimer.ts
INFO_NOTIFICATION_DURATION_MS // 8000
INFO_NOTIFICATION_PROGRESS_MS // 7000
scheduleNotificationExpiry(notification, onExpire): () => void

// stores/catalogStore.ts
loadWorkbenchCatalog(loaders): Promise<WorkbenchCatalog>
```

`WorkbenchState` 当前包含 Activity Bar、主/辅助侧栏、底部面板、主题和会话通知
状态。每条 `info` 通知从自身 `createdAt` 起独立计时，7 秒进度条结束后保留约
1 秒再隐藏气泡；`warning`/`error` 不由该计时器自动隐藏。通知隐藏不等于从会话
历史删除，打开通知中心也不会切换底部面板。

`loadWorkbenchCatalog` 并行读取插件、学习区依赖和外部前置软件，使用独立失败
边界保留已成功的数据，并在 `WorkbenchCatalog.errors` 中按来源返回错误。目录
读取失败不得阻止学习区或章节正文加载。

`stores/readingStore.ts` 还导出内部判断函数
`shouldPreserveWorkspaceSearch(workspaceDir: string | null): boolean`。其 hook 返回的
搜索入口为：

```ts
runSearch(
  query: string,
  options?: Partial<SearchOptions>,
  workspaceDir?: string | null
): Promise<void>
```

搜索输入由 `components/navigation/SearchReplaceView.tsx` 以约 250ms 防抖驱动：非空
查询调用 `runSearch`，空查询清除当前结果；大小写、全字和正则选项变化会使当前请求
失效并重新搜索。顶部刷新按钮仍调用同一个入口，以便文件被外部修改后强制重扫。
`stores/searchInput.ts` 的 `getSearchInputEffect` 和 `scheduleLiveSearch` 是 renderer
内部辅助函数，不是插件或第三方 SDK API。

传入 `workspaceDir` 时调用学习区搜索，切换实验包后保留已有结果；不传时调用当前
实验包搜索，加载其他包会清除结果。这是当前 renderer 行为，不是公共搜索 SDK。

## 1. Desktop renderer bridge

实现和声明分别位于 `apps/desktop/src/preload/index.ts` 与
`apps/desktop/src/preload/index.d.ts`，通过
`contextBridge.exposeInMainWorld('learnlab', api)` 暴露。

### 根方法

```ts
window.learnlab.getExamplePackageDir(): Promise<string>
window.learnlab.loadPackage(packageDir: string): Promise<Result<LoadedPackage, LoadError>>
window.learnlab.readChapter(
  packageDir: string,
  chapterFile: string
): Promise<Result<{ content: string; contentHash: string }, LoadError>>
```

### `package`

```ts
search(packageDir: string, options: SearchOptions): Promise<SearchResult>
searchWorkspace(workspaceDir: string, options: SearchOptions): Promise<SearchResult>
listChapters(packageDir: string): Promise<ChapterNavigationItem[]>
```

### `workspace`

```ts
getDefaultDir(): Promise<string>
init(workspaceDir: string): Promise<WorkspacePaths>
registerPackage(workspaceDir: string, packageDir: string): Promise<RegisterPackageResult>
unregisterPackage(workspaceDir: string, packageId: string): Promise<boolean>
listPackages(workspaceDir: string): Promise<RegisteredPackage[]>
getPackage(workspaceDir: string, packageId: string): Promise<RegisteredPackage | undefined>
```

### `database`

```ts
getReadingProgress(packageDir: string, chapterId: string): Promise<ReadingProgressRecord | undefined>
saveReadingProgress(packageDir: string, chapterId: string, contentHash: string, update?: ChapterProgressUpdate): Promise<ReadingProgressRecord>
getAllProgress(packageDir: string): Promise<ReadingProgressRecord[]>
recordExperimentAttempt(packageDir: string, attempt: ExperimentAttemptDetail): Promise<string>
getExperimentAttempts(packageDir: string, labId: string): Promise<ExperimentAttemptDetail[]>
```

### `config`

```ts
read(): Promise<Result<AppConfig, ConfigStoreError>>
write(config: AppConfig): Promise<Result<void, ConfigStoreError>>
exportJson(config: AppConfig): Promise<string>
importJson(rawJson: string, currentConfig: AppConfig): Promise<Result<AppConfig, SettingsTransferError>>
backupInstructions(): Promise<string>
```

### `dependencies`

```ts
importBundled(workspaceDir: string, packageId: string, dependencyId: string): Promise<ImportDependencyResult>
list(workspaceDir: string): Promise<WorkspaceDependencyRecord[]>
prerequisites(workspaceDir: string): Promise<WorkspacePrerequisiteRecord[]>
```

### `plugins`

```ts
list(): Promise<PluginManifest[]>
resolveForPackage(packageDir: string): Promise<PluginResolution>
```

`plugins` 只读取 manifest、注册表和解析结果，不启动插件进程；`database`、
`config`、`dependencies` 以及返回绝对路径的接口不得直接交给不受信任插件。
参数形状不合法或路径未被当前窗口信任时，IPC 可能抛出异常；业务失败通常
通过 `Result` 或结果中的 warning 返回。

## 2. Electron IPC（内部）

以下 channel 当前存在，但不是公共 API。插件不得调用 `ipcRenderer`，也不得依赖
channel 名称。每个 handler 会验证 renderer、主 frame，并按 `WebContents` 检查
已经初始化的 workspace/package 信任状态。

| 领域       | channels                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| package    | `package:example-dir`, `package:load`, `package:read-chapter`, `package:search`, `package:search-workspace`, `package:list-chapters`                                     |
| workspace  | `workspace:default-dir`, `workspace:init`, `workspace:register-package`, `workspace:unregister-package`, `workspace:list-packages`, `workspace:get-package`              |
| database   | `database:get-reading-progress`, `database:save-reading-progress`, `database:get-all-progress`, `database:record-experiment-attempt`, `database:get-experiment-attempts` |
| config     | `config:read`, `config:write`, `config:export-json`, `config:import-json`, `config:backup-instructions`                                                                  |
| dependency | `dependency:import-bundled`, `dependency:list`, `dependency:prerequisites`                                                                                               |
| plugin     | `plugin:list`, `plugin:resolve-for-package`                                                                                                                              |

窗口启用 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true` 和
`webSecurity: true`，拒绝未授权导航和窗口打开。单实例锁及重复启动时聚焦已有
窗口也是应用行为，不是插件 API。

## 3. `@learnlab/core-types`

入口为 `packages/core-types/src/index.ts`，当前是 private workspace 导出。

### Manifest

导出：`DependencySource`、`PluginRequirement`、`RuntimeDependency`、
`ExternalPrerequisite`、`ChapterEntry`、`PackageManifest`、`ValidationError`、
`Result<T, E>`、`validateManifest(raw)`。

`PackageManifest` 的必填字段是 `id`、`version`、`name`、`author`、`chapters`；
可选字段是 `description`、`license`、`experiment_count`、`required_plugins`、
`runtime_dependencies`、`external_prerequisites`。校验器拒绝重复章节、插件、
运行时依赖和外部前置软件 ID，并检查 bundled/repository 声明约束。

### Plugin、permission、context

导出：`PluginStatus`、`ActivationMode`、`PluginManifest`、`PluginResolutionInput`、
`PluginResolutionIssue`、`PluginResolution`、`PermissionScope`、`ReadResource`、
`WriteResource`、`ExecuteResource`、`Permission`、`PluginPermissions`、
`AppContext`、`WorkspaceContext`、`PackageContext`。

当前 `PluginManifest` 必须有 `plugin_id`、`version`，还可带 `author`、`signature`、
`api_version`、`activation`、`provides`、`requires_plugins`、`permissions` 和
`breaking_change`。`signature` 目前不是信任验证；`breaking_change` 只是更新标记。
context 只有只读的版本、workspace ID、名称和 package ID 类型，不存在运行时注入。

### Config、dependency、workspace

导出：`AppConfig`、`DependencyMetadata`、`dependencyFingerprint(metadata)`、
`DependencyImportOptions`、`DependencyImportError`、`DependencyImportResult`、
`ImportDependencyResult`、`WorkspacePaths`、`RegisteredPackage`、
`PackageRegisterError`、`RegisterPackageResult`、`WorkspaceDependencyRecord`、
`PackageDependencyLink`、`WorkspacePrerequisiteRecord`、`WorkspaceState`。

`AppConfig` 的插件设置在 `plugins`，可选变量在 `variables`；依赖最终存放于学习区
的 `dependencies` 目录。workspace 状态包含包、依赖、依赖链接和前置软件记录。

## 4. `@learnlab/core`

入口为 `packages/core/src/index.ts`。以下是全部 re-export 的符号类别；它们都是
内部集成 API，不是稳定插件 SDK。

### 包、插件、依赖和工作区

- 路径：`normalizeSafePath`、`isValidChapterPath`、`resolveSafeExistingPath`。
- 加载：`LoadError`、`LoadedPackage`、`loadPackage`、`loadPackageManifest`、`readChapter`。
- 插件：`PluginManifestError`、`parsePluginManifest`、`loadPluginManifest`、
  `resolvePlugins`、`satisfiesPluginVersion`。
- 依赖：`DependencyMetadata`、`dependencyFingerprint`、`getDependencyInstallPath`、
  `getWorkspacePaths`、`calculateBufferSha256`、`calculateFileSha256`、
  `calculateFileStats`、`importBundledDependency`。
- 注册表：`PackageRegisterError`、`createEmptyWorkspaceState`、`registerPackage`、
  `unregisterPackage`、`listRegisteredPackages`、`getRegisteredPackage`。
- 状态文件：`loadWorkspaceState`、`saveWorkspaceState`。
- `WorkspaceManager`：`initWorkspace`、`registerPackage`、`unregisterPackage`、
  `listPackages`、`getPackage`、`importBundledDependency`、
  `getWorkspaceDependencies`、`getWorkspacePrerequisites` 静态方法。

### Tar、配置和设置

- 类型：`TarEntry`、`TarParseOptions`、`TarInputEntry`、`ConfigStoreError`、
  `ExportedSettingsEnvelope`、`SettingsTransferError`。
- Tar：`parseTar`、`createTar`、`createTarGz`。
- 配置：`validateConfig`、`readConfig`、`writeConfig`。
- 设置：`CURRENT_SETTINGS_SCHEMA_VERSION`、`redactSecrets`、`exportSettings`、
  `importSettings`、`getManualBackupInstructions`。

### Database

- driver：`RunResult`、`PreparedStatement`、`DatabaseConnection`、
  `createDatabaseConnection`。
- migration：`Migration`、`AppliedMigration`、`initMigrationTable`、
  `getAppliedMigrations`、`getCurrentSchemaVersion`、`runMigrations`。
- package：`PACKAGE_DB_MIGRATIONS`、`ChapterIndexRecord`、`ReadingProgressRecord`、
  `LabSummaryRecord`、`PackageDatabase`。
- workspace：`WORKSPACE_DB_MIGRATIONS`、`WorkspaceDatabase`。

`PackageDatabase` 管理章节索引、阅读进度、实验摘要和 session。除 `open`、构造函数、
`getConnection`、`close` 外，它提供 `saveChapters`、`getChapters`、
`saveReadingProgress`、`getReadingProgress`、`getAllReadingProgress`、
`saveLabSummary`、`getLabSummary`、`getAllLabSummaries`、`setMetadata`、
`getMetadata`、`setSession`、`getSession`。

`WorkspaceDatabase` 管理包、依赖、链接、前置软件和设置。除 `open`、构造函数、
`getConnection`、`close` 外，它提供 `registerPackage`、`unregisterPackage`、
`getPackage`、`listPackages`、`recordLink`、`removeLink`、`getLink`、
`recordDependency`、`getDependencies`、`linkPackageDependency`、
`getPackageDependencies`、`getAllPackageDependencies`、`recordPrerequisite`、
`getPrerequisites`、`getAllPrerequisites`、`setSetting`、`getSetting`。

这些是宿主的高权限 Node/database 组件，不能作为插件 allowlist。

`createDatabaseConnection(dbPath, { forcePortable? })` 的当前选择规则属于
`experimental-core`：新建的持久数据库默认写入 LearnLab 便携 JSON 格式；已有
空文件占位也按新便携数据库初始化；已有便携数据库继续使用便携 driver；内存数据库在可用时使用 `node:sqlite`；已有
SQLite 文件只在运行时支持 `node:sqlite` 时打开，否则抛出
`SQLite database requires a runtime with node:sqlite support`。该错误不会再把 SQLite
文件误报为损坏的便携 JSON。便携 driver 只实现核心当前使用的 SQL 子集，不应被
当作通用 SQLite 兼容层。

### 内容、阅读、实验历史、搜索、导航和权限

- 内容：`calculateContentFingerprint`、`calculateChapterFileFingerprint`。
- 阅读：`ChapterProgressUpdate`、`syncChapterProgress`、`markChapterCompleted`、
  `markChapterUnread`。
- 历史：`ExperimentStepRecord`、`ExperimentAttemptDetail`、`SaveAttemptOptions`、
  `getExperimentHistoryDir`、`recordExperimentAttempt`、`getExperimentAttempts`、
  `clearExperimentHistory`。
- 搜索：`SearchOptions`、`SearchTargetInfo`、`SearchMatch`、`SearchResult`、
  `ReplaceOptions`、`ReplaceResult`、`compileSearchPattern`、`searchInText`、
  `replaceInText`、`searchPackage`、`searchWorkspace`。
- 导航：`ChapterNavigationItem`、`ScrollProgressResult`、`PluginReadonlyStatus`、
  `buildChapterNavigationList`、`getNextChapter`、`getPreviousChapter`、
  `calculateScrollProgress`、`evaluatePluginReadonlyStatus`。
- 权限纯逻辑：`PermissionResolutionInput`、`ResolvedPermissions`、`resolvePermissions`。

搜索正则有 MVP 启发式限制，不是完整 regex sandbox。权限 resolver 只计算声明、
包请求、用户授权和宿主能力的交集；`ReadonlySet` 只是 TypeScript 类型层只读视图，
没有连接插件进程、IPC 或操作系统沙箱。

## 5. `@learnlab/markdown`

导出 `FrontMatter`、`HeadingEntry`、`MarkdownResult`、`ParseError`、
`FrontMatterResult`，以及 `parseFrontMatter`、`parseMarkdown`、`extractHeadings`、
`extractPlainText`。HTML 经过 `rehype-sanitize`，heading ID 使用 `user-content-`
前缀；front matter 解析失败时 `parseMarkdown` 抛出名为 `MarkdownParseError` 的错误。

## 6. `@learnlab/labkit`

当前没有 `bin` 字段，没有可执行的 `labkit` CLI。入口导出：
`validateManifest`、`PackageManifest`、`ValidationError`、`Result`、
`DependencyValidationCheck`、`PackageValidationReport`、
`validatePackageDirectory`、`PackagePreview`、`previewPackage`。
`packNotImplemented` 位于内部 `pack.ts`，没有 re-export。

## 7. 文件格式接口

- 实验包 `manifest.yaml`：必填 `id`、`version`、`name`、`author`、`chapters`；
  章节必填 `id`、`title`、`file`。
- 插件 `manifest.yaml`：必填 `plugin_id`、`version`；其余字段见第 3 节。
- 学习区：`workspace.db`、`dependencies/`、已登记实验包目录。
- 实验包：`package.db`、章节、实验目录、`experiment_history/`。
- 设置：应用 JSON，插件设置归于 `AppConfig.plugins`。

## 8. 未开放能力

当前没有公共插件 API：真实插件宿主进程、代码执行、生命周期回调、插件 IPC、
稳定 `@learnlab/plugin-sdk`、网络/剪贴板/外部文件/进程/环境变量 API、完整冻结
capability ID、授权弹窗/撤销/持久化、运行时 context 注入、`registerPanel`、
`registerCommand`、`registerAction`、菜单/状态栏/图标 descriptor、实验监督、
崩溃隔离、开发者模式、包市场或依赖仓库网络下载协议。

## 9. 安全和维护门禁

- `window.learnlab` 只给受信 renderer，不是插件隔离层；桥接和 core 返回的绝对
  路径不得传给不受信任插件。
- manifest 的 `permissions`、`signature`、`api_version` 当前不产生运行时授权或信任结论。
- 每轮实现前读取[路线图](ROADMAP.md)、[公开决策索引](DECISIONS.md)、相关设计文档和本表；本地迭代可补读被 Git 忽略的 `Plan.md`、`UNFREEZE.md`。
- 每轮写代码后扫描 diff 中新增/改变的 `export`、package `exports`、
  `contextBridge`、`ipcMain.handle`、manifest 字段、文件格式和 CLI 入口。
- 本轮新增或改变的接口必须与代码在同一轮登记本文，并说明稳定性、安全边界和
  错误行为；内部实现若改变参数、返回值、路径或授权边界，也必须更新本文。
- 插件作者文档只保留面向插件的摘要，完整清单以本文为准；不得把规划 API 写成已实现。
- 完成后运行 `pnpm test:run`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 和
  `git diff --check`。

### 变更记录

| 日期       | 变更                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-15 | 登记正式 renderer 的 Workbench、通知计时、目录聚合和学习区搜索内部接口；记录新持久数据库默认便携格式及已有 SQLite 的兼容行为。               |
| 2026-09-15 | 首次全仓扫描；登记 renderer bridge、内部 IPC、workspace 包导出、manifest/存储格式和未开放能力；修正 preload 配置 API 的 `unknown` 类型漂移。 |
