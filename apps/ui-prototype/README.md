# LearnLab UI Prototype

独立的 LearnLab Workbench UI 原型。它只使用模拟数据，不调用 Electron preload、数据库、插件宿主或实验运行时，因此可以独立迭代并在视觉方案确认后迁移到 `apps/desktop`。

## 运行

```bash
pnpm --filter @learnlab/ui-prototype dev
```

生产构建与检查：

```bash
pnpm --filter @learnlab/ui-prototype test
pnpm --filter @learnlab/ui-prototype typecheck
pnpm --filter @learnlab/ui-prototype build
```

## 原型范围

- VS Code Workbench 风格区域：Menubar、Command Bar、Activity Bar、Primary Sidebar、单一 Editor Group、Auxiliary Sidebar、Bottom Panel、Status Bar 与 Notification Host。
- 七个一级入口：章节、搜索和替换、实验、插件、依赖、学习区、文件资源管理器。
- 可验证交互：章节树、标签关闭与切换、滚动位置、阅读进度、快速打开章节、搜索定位、替换确认和一次撤销、模拟实验及历史、插件/依赖筛选与详情、文件树、侧栏拖拽、主题和通知中心。
- 图标当前全部为自制字符/CSS 占位符，不包含 VS Code 图标或品牌资产。

## 当前边界（2026-09-09）

- Menubar 与窗口控件保留视觉占位，不执行菜单或窗口排布操作；设置尚未接入。
- AI 侧栏显示未连接状态，可编辑并保留会话内草稿，不发送请求或伪造回答。
- 搜索与替换仅作用于内存中的示例教程，刷新页面即恢复；运行实验只模拟结果，不执行 SQL 或启动外部程序。
- 替换仅重置实际改动章节的阅读进度和位置；一次撤销同时恢复对应内容与阅读状态。
- 学习区条目可查看详情，尚未接入真实实验包切换、安装和持久化。
- INFO 气泡统一显示 7 秒进度条，走满后约 1 秒消失；每条独立计时。已消失的气泡保留在本次会话的通知中心，查看后清除未读标记。warning/error 在此原型中保留到手动关闭。
- 不恢复已关闭标签，不支持多个 Editor Group；关闭最后一个标签显示空工作区。
- 桌面窗口默认并列布局；窄窗口中的辅助栏以临时覆盖层展示，超窄窗口默认收起两侧栏，入口始终保留。

本轮优化和审查记录见 [UI 原型审查](../../docs/reviews/2026-09-09-ui-prototype-review.md)。
