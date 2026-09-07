# LearnLab 独立 UI 原型设计

**日期：** 2026-09-07

## 目标

在不接入 Electron IPC、数据库、实验运行时、插件系统和真实实验包的前提下，实现一套可单独构建和运行的 LearnLab Workbench UI，用来反复确认布局、视觉密度与交互逻辑。原型必须覆盖已冻结的 UI 需求，代码边界允许未来将 Workbench 组件迁入正式 desktop renderer，并删除模拟数据层。

## 边界

- 新建独立 workspace 应用 `apps/ui-prototype`，使用 Preact、TypeScript 和 Vite。
- 不修改当前 `apps/desktop` renderer，不共享运行时状态，不调用 preload API。
- 图标全部采用字符与 CSS 占位符，不引入 VS Code 图标或品牌资产。
- 使用模拟章节、实验、插件、依赖、实验包、文件与通知数据。
- 完整实现可验证的 UI 行为，不实现真实文件写入、命令执行和依赖安装。

## 布局

从上至下为窗口内 Menubar、应用标题/命令区、Workbench 主体和 Status Bar。Workbench 主体从左至右为 Activity Bar、Primary Sidebar、单一 Editor Group 与可选 Auxiliary Sidebar；Bottom Panel 位于 Editor Group 下方。Notification Host 固定在右下角、Status Bar 上方。

Activity Bar 固定包含章节、搜索和替换、实验、插件、依赖、学习区与文件资源管理器。中央区域支持教程和实验标签；实验标签可从章节中的实验卡或实验侧栏打开。右侧辅助栏默认提供 AI 助手与上下文标签。底部面板提供终端、输出、问题和实验历史。

## 状态与交互

纯 reducer 管理活动侧栏、章节树展开状态、活动章节、编辑器标签、辅助栏、底部面板、主题、搜索选项、实验状态和通知。章节选择加载对应模拟正文；搜索支持区分大小写、全字匹配和正则选项；实验可打开为主标签并模拟运行结果；通知支持关闭和按等级展示。

## 验收

- 原型可通过独立 `dev`、`build`、`typecheck`、`test` 脚本运行。
- 七个 Activity Bar 入口均可切换并显示对应完整侧栏。
- 章节树、标签、辅助栏、底部面板、搜索选项、实验打开/运行、主题和通知均可交互。
- 1440×900 和 1280×720 下不产生页面级滚动条；正文与各面板内部独立滚动。
- 实际截图后与 VS Code Workbench 对照，至少检查区域比例、密度、层级、留白和操作反馈。
