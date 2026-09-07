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
- 完整模拟交互：章节树、标签、搜索选项、实验打开与运行、辅助栏、底部面板、主题和通知。
- 图标当前全部为自制字符/CSS 占位符，不包含 VS Code 图标或品牌资产。
