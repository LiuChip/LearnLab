# Workbench 对接后的外观反馈与 VSCode 源码研究

日期：2026-09-15。LearnLab 检查基线：`bf9d0b3`。本轮仅记录问题、研究参考实现并调整验收要求，暂不修改 UI 代码。

## 结论与执行边界

正式 renderer 已连接真实业务数据，但没有完整保留独立原型的视觉组织和入口。用户尚未认可本轮对接后的外观；不能把“组件已接入”“119 项测试通过”或“未发现明显区域重叠”等同于视觉验收通过。

用户本轮明确要求：记录章节侧栏、搜索选中态、平台菜单/窗口控件、重复标题、快速打开圆角、设置入口等问题；外观修复暂缓；先详细参考 VSCode 的实际界面和源码。正式图标继续后置，使用统一的文字或几何占位即可。之前暂缓菜单点击、窗口排布功能的决策仍有效，不能由本次研究推导出实现整套菜单或窗口管理的授权。

## 证据与体验范围

- 用户提供的图 1：VSCode 完整工作场景；图 2：LearnLab 章节空状态；图 3/4：两者的搜索控件；图 5：Electron 默认 macOS 菜单；图 6：LearnLab 快速打开；图 7：LearnLab 整体窗口。
- 本轮通过 ComputerUse 读取了本机 VSCode、Antigravity IDE 和已运行 LearnLab 的窗口截图。VSCode 是浅色工作场景，Antigravity 是深色空文件夹场景，LearnLab 是空学习内容场景；这三个截图不能被当作同主题、同内容的像素对照。
- 实际展开并读取了 VSCode 的“查看”“Code → 首选项”原生菜单及 Antigravity 的“查看”菜单。VSCode 的首选项中包括设置、快捷键、颜色主题、文件图标主题、产品图标主题；这些是参考入口，不表示 LearnLab 全部需要实现。
- ComputerUse 对内容区的坐标点击重复返回 `noWindowsAvailable`；快捷键和原生菜单中的搜索操作未产生可验证的内容区变化。因而本轮没有完成树展开/收起、搜索选项逐项点击、快速打开键盘导航和通知中心的完整操作验收，后续必须补做，不能记为已经体验通过。
- 本机 VSCode 元数据为 `1.137.0`，commit 为 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`。GitHub 源码研究固定在当次查询得到的 `a143e724186cb064580228cac1248811322b4127`，两者不是同一 commit；下文数字和行为以注明的源码为准，不将 main 的所有新样式当成本机经典界面的规范。
- 另读取了本机 VSCode 编译后的 Workbench CSS，确认其快速打开使用圆角/阴影变量，搜索 toggle 使用独立尺寸、内边距和间隔，与 GitHub 研究方向一致。本轮没有复制 VSCode 的品牌或图标资源。

## 待修问题清单

所有条目均为“已记录，待后续修复”，不是已修复列表。阶段 G 处理入口、结构和平台接线；阶段 H 处理最终外观。两者均遵守当前暂缓外观修改的要求。

| ID | 问题与证据 | 当前代码根因 | 后续修订与验收要求 | 阶段 |
| --- | --- | --- | --- | --- |
| `UIR-01` | 章节栏标题重复，空状态突兀（图 2） | `PrimarySidebar` 已显示“章节”，`ChapterTree` 又渲染“章节目录 / 共 0 节”；`.empty-tree-message` 没有自己的排版规则，外层也没有统一工作台基础字号 | 只保留必要标题层级；空提示使用一致的侧栏字号、弱化颜色和内边距；区分“尚未打开包”“包没有章节”“加载失败” | G/H |
| `UIR-02` | 章节目录没有体现已约定的树形层级，选中状态缺乏层次 | 正式版沿用扁平 `ChapterTree`，未迁入原型的树行/缩进/展开位；只有一种 active 背景 | 依据实际章节模型实现父子层级和默认折叠，展开命中区与打开内容的命中区明确；长标题省略，进度不挤压标题；区分悬停、焦点、选中和失焦选中 | G/H |
| `UIR-03` | 搜索 `Aa / ab / .*` 全开时形成连续的强蓝边框块（图 3/4） | `.workbench-input-toggle[aria-pressed='true']` 直接复用 `--workbench-focus` 作常驻 outline；按钮几乎填满输入框高度 | 将“选项开启”和“键盘焦点”分开；使用主题可调整的开启底色/前景/边框，与输入框焦点相协调，保留按钮间隙和内边距；全开仍是三个独立控件 | H |
| `UIR-04` | 搜索顶部空隙、工具栏和输入框的组织不如参考界面紧凑 | 正式版独立标题行下又加搜索 toolbar；替换折叠入口从原型中遗漏，替换框永久展开并包含开发说明文案 | 统一标题操作区；仍只保留已约定的刷新/清空顶部动作；替换显示方式恢复可调整设计，禁用原因用简短提示表达；搜索结果分组、定位属于 `UI-04` 待完善内容 | G/H |
| `UIR-05` | macOS 顶部仍为 Electron 默认菜单；窗口内另有一排不能操作的菜单（图 5/7） | 主进程没有 LearnLab 应用菜单注册；`AppShell` 无平台分支而始终绘制模拟菜单 | 按平台完成应用菜单与窗口外壳；macOS 正式菜单进入系统 Menubar；开发运行和打包后的产品名称分别验证，不能仅靠 renderer 标题推断系统菜单已正确命名 | G |
| `UIR-06` | Windows 风格的右上角三按钮缺失，右侧出现多余 LearnLab；顶部还有多处重复包名（图 7） | 原型的 `window-button` 未迁入正式 `AppShell`，只保留 `workbench-window-context`；原生标题、模拟菜单、命令区并存 | 删除右上角冗余产品文字；Windows 风格预览保留最小化/最大化或还原/关闭三按钮占位并统一尺寸；正式 macOS 保留左上交通灯，避免再叠一套 Windows 控件。真实窗口命令另行接线，最大化状态必须与系统一致 | G/H |
| `UIR-07` | 顶部搜索弹层无圆角，像普通矩形页面块（图 6） | 原型 `.quick-open` 有 `border-radius: 5px`，正式 `.workbench-quick-open` 未保留；弹层位于 `.workbench-shell` 外，不能继承其主题变量，部分颜色写死 | 恢复与主题一致的弹层圆角、边框、阴影和输入内边距；弹层放在统一主题作用域或明确传递 token；明确空结果样式、焦点归属、Escape 和确认行为 | H/G |
| `UIR-08` | Activity Bar 底部设置入口消失（图 2/7） | 正式 `ActivityBar` 仅渲染七个内容入口，原型 `activity-footer` 中的设置入口被删掉 | 恢复独立底部设置入口，暂可用“设”占位并明确未接入状态；设置入口与账号入口分离，不能因核心没有账号/云同步而删除设置 | G/H |
| `UIR-09` | 整体比原型更松散、重复信息多；局部字号、空状态和按钮风格不一致 | 新 Workbench CSS 叠加旧阅读器全局样式，采用多个局部覆盖；快速打开又处于主题根之外 | 统一最小的字号、间距、圆角、状态颜色及按钮尺寸变量；逐区迁移原型时比较空/加载/有内容/错误状态；先恢复一致性，再制作图标 | H |

截图是 Retina 像素且部分被缩放，不能直接把图上的物理像素当 CSS 像素。本轮未冻结精确字号、行高、圆角值和响应式断点。

## VSCode 源码研究与可采用的做法

以下 GitHub 链接固定到同一 commit，便于后续复核。阅读重点是小组件的职责、状态及宿主边界，不直接把整个 Workbench 框架移植进 Preact。

| 研究对象 | 固定源码入口 | 观察与 LearnLab 的对应动作 |
| --- | --- | --- |
| 树行与展开箭头 | [tree.css](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/base/browser/ui/tree/media/tree.css)、[list.css](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/base/browser/ui/list/list.css) | 树行使用统一高度、独立的展开位和可收缩内容区；展开箭头旋转，不让不同文字宽度改变缩进。LearnLab 应先稳定树行组成和命中区，不必提前引入整套虚拟列表 |
| 列表状态颜色 | [listColors.ts](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/platform/theme/common/colors/listColors.ts) | `list.activeSelectionBackground`、`list.inactiveSelectionBackground`、`list.hoverBackground`、`list.focusOutline` 独立；焦点移到正文后，左侧仍可保留选中但降低强调 |
| 搜索选项 | [toggle.ts](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/base/browser/ui/toggle/toggle.ts)、[toggle.css](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/base/browser/ui/toggle/toggle.css) | `Toggle.applyStyles()` 分别使用开启状态的边框/前景/背景；CSS 单独处理 hover、focus-visible 和 disabled。此版本有 20px 控件、2px 间隔、3px 圆角等基线，具体尺寸在 LearnLab 中仍需视觉验收，不能照搬截图比例 |
| 搜索/替换布局 | [searchWidget.ts](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/workbench/contrib/search/browser/searchWidget.ts)、[searchview.css](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/workbench/contrib/search/browser/media/searchview.css) | 搜索框、替换框、替换折叠按钮、全部替换 Action 分开；折叠按钮有独立预留宽度，输入 options 内嵌但不吞掉输入空间。开启选项还涉及焦点返回，不能只复制 CSS |
| 通用输入框 | [inputBox.css](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/base/browser/ui/inputbox/inputBox.css)、[inputBox.ts](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/base/browser/ui/inputbox/inputBox.ts) | 输入框自身管理边界、内边距、焦点和消息；LearnLab 应避免 input 与包裹层同时形成冲突的焦点边框 |
| 快速打开弹层 | [quickInput.css](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/platform/quickinput/browser/media/quickInput.css) | `quick-input-widget` 使用统一圆角/阴影 token，并将标题、输入和结果分区；浮层声明 `no-drag`。新版本动画不是本轮必须实现项，LearnLab 当前“仅搜索章节”的范围也不应扩大为整个命令系统 |
| 平台标题区 | [browser/titlebarPart.ts](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/workbench/browser/parts/titlebar/titlebarPart.ts)、[electron-browser/titlebarPart.ts](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/workbench/electron-browser/parts/titlebar/titlebarPart.ts) | 浏览器布局和 Native 宿主操作分开；根据平台、原生标题栏和 Window Controls Overlay 决定谁绘制菜单与按钮；按钮通过 native host 调用最小化、最大化/还原和关闭，并订阅最大化状态变化 |
| 原生菜单 | [electron-main/menubar.ts](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/platform/menubar/electron-main/menubar.ts) | 主进程构造 `Menu` / `MenuItem` 并调用 `Menu.setApplicationMenu()`，处理 macOS 应用菜单、窗口菜单和原生 role；renderer 的 HTML 菜单不能替代系统菜单注册 |
| 设置与账户分离 | [globalCompositeBar.ts](https://github.com/microsoft/vscode/blob/a143e724186cb064580228cac1248811322b4127/src/vs/workbench/browser/parts/globalCompositeBar.ts) | Accounts 和 Manage 是不同的 Action；账户有独立显示偏好。LearnLab 只需要保持已约定的设置入口，不随之引入账户、认证或同步服务 |

本机 Antigravity 的深色空文件夹截图提供了另一个有用对照：标题区集中在一行，主侧栏在内容区内组织任务入口，右侧 Agent 作为独立辅助区域。其原生“查看 → 外观”菜单也有主/辅助侧栏和面板入口。但空场景与 VSCode 有文件的工作场景不能直接评价谁更紧凑；本轮没有研究或声称取得 Antigravity 专有改动源码，也没有向其 Agent 派发开发任务。

## 下一轮修订的实现顺序

1. 修复结构遗漏：恢复底部设置占位、明确平台标题区分工、去除右上重复产品文字；Windows 风格预览恢复三按钮占位。菜单及真实窗口行为的完整方案仍受 `UI-08` / `PROD-04` 约束。
2. 建立小范围共用视觉规则：树行、输入框、toggle、工具栏按钮、空状态、快速打开浮层。优先让原型和正式 renderer 遵守相同规则；是否抽出共享包仍由 `UI-09` 决定，不为统一几个样式提前重构整个项目。
3. 修复章节层级、搜索选中态、替换折叠、弹层圆角和主题作用域。章节层级需要真实数据映射；替换写入、搜索精确定位等不能用模拟成功掩盖未接入。
4. 逐区做人工对照和用户验收，再推进正式图标。业务接线通过后必须再核对“原型入口/结构有没有被删掉”，不能只检查 API 返回值。

## 待补人工验收

| 场景 | 需要验证的行为与外观 | 本轮状态 |
| --- | --- | --- |
| 章节树 | 空学习区、加载中、错误、有多级章节；折叠/展开、行 hover、点击标题、正文获焦后选中、长标题、进度数值宽度 | 用户截图及代码已核对；完整操作待补 |
| 搜索 | 关闭全部选项、分别开启、全部开启、hover、Tab 焦点、鼠标点击后的焦点、失焦、替换折叠/展开、搜索中、非法正则、空结果 | 用户截图及源码已核对；完整操作待补 |
| 快速打开 | 圆角及阴影、主题一致性、零/多结果、长标题、方向键、确认、Escape、返回原焦点；区分当前仅有的章节搜索范围 | 原型/正式代码已核对；VSCode 交互待补 |
| 设置 | 底部始终可找到设置；内容列表滚动或侧栏收起不隐藏该入口；不出现账号入口 | 遗漏已确认，待修 |
| 平台窗口 | macOS 系统菜单/交通灯、Windows 三按钮/最大化还原、拖动与输入命中区、开发与打包名称、关闭与单实例激活 | 原生菜单和截图已核对；平台实现与操作待补 |
| 相邻区域 | 通知中心不切换底部面板；底部、左右侧栏不互相挤压；窄窗恢复到宽窗后入口可达 | 保留上一轮行为测试结果；本轮未重新验收 |

后续截图按相同窗口尺寸、应用缩放、主题和内容状态比较，并注明系统缩放；至少覆盖 1024×768 与较宽窗口、空状态与真实包、聚焦与失焦。不得拿大屏浅色 VSCode 的完整工程与小窗深色 LearnLab 的空学习区做唯一验收依据。

本轮没有新增或修改 renderer bridge、IPC、导出、manifest、存储格式或 CLI，因而 `docs/API_REFERENCE.md` 无接口增量。后续若实现窗口命令或设置接线，应与实现同轮登记其参数、权限边界、错误和生命周期。
