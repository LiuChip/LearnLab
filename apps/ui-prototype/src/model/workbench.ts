export type ActivityId =
  | 'chapters'
  | 'search'
  | 'experiments'
  | 'plugins'
  | 'dependencies'
  | 'workspace'
  | 'explorer';

export type Theme = 'dark' | 'light';
export type BottomPanelId = 'terminal' | 'output' | 'history' | 'problems';
export type AuxiliaryTabId = 'assistant' | 'context' | 'output';

export interface ChapterNode {
  id: string;
  label: string;
  kind: 'chapter' | 'section';
  documentTitle: string;
  progress: number;
  children?: ChapterNode[];
}

export interface Experiment {
  id: string;
  title: string;
  chapterId: string;
  status: 'ready' | 'passed' | 'running';
  duration: string;
}

export interface EditorTab {
  id: string;
  label: string;
  kind: 'document' | 'experiment';
  chapterId?: string;
  experimentId?: string;
  dirty?: boolean;
}

export interface ToastNotification {
  id: string;
  level: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  progress?: boolean;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regularExpression: boolean;
}

export interface SearchDocument {
  id: string;
  label: string;
  lines: string[];
}

export interface SearchMatch {
  documentId: string;
  label: string;
  line: number;
  text: string;
}

export type SearchResults = SearchMatch[] & { error?: string };

export interface WorkbenchState {
  activeActivity: ActivityId;
  activeChapterId: string;
  expandedChapters: string[];
  editorTabs: EditorTab[];
  activeTabId: string;
  auxiliaryVisible: boolean;
  auxiliaryTab: AuxiliaryTabId;
  bottomPanelVisible: boolean;
  bottomPanel: BottomPanelId;
  theme: Theme;
  searchQuery: string;
  replaceQuery: string;
  replacePreserveCase: boolean;
  searchOptions: SearchOptions;
  experimentStatus: Record<string, Experiment['status']>;
  notifications: ToastNotification[];
  unreadMessages: number;
}

export type WorkbenchAction =
  | { type: 'setActivity'; activity: ActivityId }
  | { type: 'toggleChapter'; chapterId: string }
  | { type: 'selectChapter'; chapterId: string }
  | { type: 'openExperiment'; experimentId: string }
  | { type: 'activateTab'; tabId: string }
  | { type: 'closeTab'; tabId: string }
  | { type: 'toggleAuxiliary' }
  | { type: 'setAuxiliaryTab'; tab: AuxiliaryTabId }
  | { type: 'toggleBottomPanel' }
  | { type: 'setBottomPanel'; panel: BottomPanelId }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setSearchQuery'; query: string }
  | { type: 'setReplaceQuery'; query: string }
  | { type: 'toggleReplacePreserveCase' }
  | { type: 'refreshSearch' }
  | { type: 'toggleSearchOption'; option: keyof SearchOptions }
  | { type: 'runExperiment'; experimentId: string }
  | { type: 'markExperimentPassed'; experimentId: string }
  | { type: 'replaceAll'; matchCount: number }
  | { type: 'dismissNotification'; notificationId: string }
  | { type: 'addNotification'; notification: ToastNotification };

export const chapters: ChapterNode[] = [
  {
    id: 'basics',
    label: '1. 查询基础',
    kind: 'chapter',
    documentTitle: '1.1 基础查询',
    progress: 0.62,
    children: [
      {
        id: 'select',
        label: '1.1 SELECT 入门',
        kind: 'section',
        documentTitle: '1.1 SELECT 入门',
        progress: 0.8,
        children: [
          { id: 'select-columns', label: '1.1.1 选择列', kind: 'section', documentTitle: '1.1.1 选择列', progress: 1 },
          { id: 'select-alias', label: '1.1.2 别名与表达式', kind: 'section', documentTitle: '1.1.2 别名与表达式', progress: 0.48 }
        ]
      },
      { id: 'sorting', label: '1.2 排序与分页', kind: 'section', documentTitle: '1.2 排序与分页', progress: 0.36 }
    ]
  },
  {
    id: 'filtering',
    label: '2. 条件过滤',
    kind: 'chapter',
    documentTitle: '2. 条件过滤',
    progress: 0.24,
    children: [
      { id: 'where', label: '2.1 WHERE 条件', kind: 'section', documentTitle: '2.1 WHERE 条件', progress: 0.24 },
      { id: 'grouping', label: '2.2 分组与聚合', kind: 'section', documentTitle: '2.2 分组与聚合', progress: 0 }
    ]
  },
  {
    id: 'joins',
    label: '3. 连接与关系',
    kind: 'chapter',
    documentTitle: '3. 连接与关系',
    progress: 0,
    children: [
      { id: 'inner-join', label: '3.1 INNER JOIN', kind: 'section', documentTitle: '3.1 INNER JOIN', progress: 0 },
      { id: 'outer-join', label: '3.2 外连接', kind: 'section', documentTitle: '3.2 外连接', progress: 0 }
    ]
  },
  { id: 'project', label: '4. 综合实验', kind: 'chapter', documentTitle: '4. 综合实验', progress: 0 }
];

export const experiments: Experiment[] = [
  { id: 'select-basics', title: '实验 1：查询学生信息', chapterId: 'basics', status: 'passed', duration: '4 分钟' },
  { id: 'where-filter', title: '实验 2：筛选成绩记录', chapterId: 'filtering', status: 'ready', duration: '8 分钟' },
  { id: 'join-report', title: '实验 3：生成课程报表', chapterId: 'joins', status: 'ready', duration: '12 分钟' }
];

export const searchDocuments: SearchDocument[] = [
  { id: 'basics', label: '1.1 基础查询.md', lines: ['SELECT name, score FROM students;', '使用 SELECT 语句可以选择需要查看的列。', 'SELECT 负责读取，WHERE 负责过滤。'] },
  { id: 'filtering', label: '2. 条件过滤.md', lines: ['WHERE score >= 60;', 'WHERE 子句会筛选满足条件的行。', '在 SELECT 之后添加 WHERE。'] },
  { id: 'joins', label: '3. 连接与关系.md', lines: ['SELECT * FROM courses INNER JOIN students;', 'INNER JOIN 用于连接两张相关的表。'] }
];

export function createInitialState(): WorkbenchState {
  return {
    activeActivity: 'chapters',
    activeChapterId: 'basics',
    expandedChapters: [],
    editorTabs: [{ id: 'chapter:basics', label: '1.1 基础查询.md', kind: 'document', chapterId: 'basics' }],
    activeTabId: 'chapter:basics',
    auxiliaryVisible: true,
    auxiliaryTab: 'assistant',
    bottomPanelVisible: false,
    bottomPanel: 'history',
    theme: 'dark',
    searchQuery: '',
    replaceQuery: '',
    replacePreserveCase: false,
    searchOptions: { caseSensitive: false, wholeWord: false, regularExpression: false },
    experimentStatus: Object.fromEntries(experiments.map((experiment) => [experiment.id, experiment.status])),
    notifications: [
      { id: 'package-ready', level: 'info', title: '实验包已准备就绪', message: 'SQL 基础 · 3 个插件已加载', progress: true },
      { id: 'runtime-warning', level: 'warning', title: '运行时提醒', message: '检测到可选的 MySQL 客户端尚未配置' }
    ],
    unreadMessages: 2
  };
}

function ensureTab(state: WorkbenchState, tab: EditorTab): WorkbenchState {
  const exists = state.editorTabs.some((current) => current.id === tab.id);
  return {
    ...state,
    editorTabs: exists ? state.editorTabs : [...state.editorTabs, tab],
    activeTabId: tab.id
  };
}

export function workbenchReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case 'setActivity':
      return { ...state, activeActivity: action.activity };
    case 'toggleChapter':
      return {
        ...state,
        expandedChapters: state.expandedChapters.includes(action.chapterId)
          ? state.expandedChapters.filter((id) => id !== action.chapterId)
          : [...state.expandedChapters, action.chapterId]
      };
    case 'selectChapter': {
      const node = findChapter(chapters, action.chapterId);
      if (!node) return state;
      return ensureTab(
        { ...state, activeChapterId: action.chapterId },
        { id: `chapter:${action.chapterId}`, label: `${node.documentTitle}.md`, kind: 'document', chapterId: action.chapterId }
      );
    }
    case 'openExperiment': {
      const experiment = experiments.find((item) => item.id === action.experimentId);
      if (!experiment) return state;
      return ensureTab(state, {
        id: `experiment:${experiment.id}`,
        label: experiment.title.replace(/^实验 \d+：/, '实验 · '),
        kind: 'experiment',
        experimentId: experiment.id
      });
    }
    case 'activateTab':
      return state.editorTabs.some((tab) => tab.id === action.tabId) ? { ...state, activeTabId: action.tabId } : state;
    case 'closeTab': {
      const index = state.editorTabs.findIndex((tab) => tab.id === action.tabId);
      if (index < 0 || state.editorTabs.length === 1) return state;
      const editorTabs = state.editorTabs.filter((tab) => tab.id !== action.tabId);
      return {
        ...state,
        editorTabs,
        activeTabId: state.activeTabId === action.tabId ? editorTabs[Math.max(0, index - 1)].id : state.activeTabId
      };
    }
    case 'toggleAuxiliary':
      return { ...state, auxiliaryVisible: !state.auxiliaryVisible };
    case 'setAuxiliaryTab':
      return { ...state, auxiliaryVisible: true, auxiliaryTab: action.tab };
    case 'toggleBottomPanel':
      return { ...state, bottomPanelVisible: !state.bottomPanelVisible };
    case 'setBottomPanel':
      return { ...state, bottomPanel: action.panel, bottomPanelVisible: true };
    case 'setTheme':
      return { ...state, theme: action.theme };
    case 'setSearchQuery':
      return { ...state, searchQuery: action.query };
    case 'setReplaceQuery':
      return { ...state, replaceQuery: action.query };
    case 'toggleReplacePreserveCase':
      return { ...state, replacePreserveCase: !state.replacePreserveCase };
    case 'refreshSearch':
      return {
        ...state,
        notifications: [
          ...state.notifications,
          { id: `search-refresh-${state.notifications.length}`, level: 'info', title: '搜索结果已刷新', message: state.searchQuery ? '已重新扫描当前学习区中的文本。' : '当前没有活动的搜索条件。' }
        ]
      };
    case 'toggleSearchOption':
      return { ...state, searchOptions: { ...state.searchOptions, [action.option]: !state.searchOptions[action.option] } };
    case 'runExperiment':
      return { ...state, experimentStatus: { ...state.experimentStatus, [action.experimentId]: 'running' } };
    case 'markExperimentPassed':
      return { ...state, experimentStatus: { ...state.experimentStatus, [action.experimentId]: 'passed' } };
    case 'replaceAll':
      return {
        ...state,
        notifications: [
          ...state.notifications,
          { id: `replace-${state.notifications.length}`, level: 'info', title: '替换完成', message: `已在学习区中替换 ${action.matchCount} 处匹配。` }
        ]
      };
    case 'dismissNotification':
      return { ...state, notifications: state.notifications.filter((item) => item.id !== action.notificationId) };
    case 'addNotification':
      return { ...state, notifications: [...state.notifications, action.notification] };
    default:
      return state;
  }
}

export function findChapter(nodes: ChapterNode[], chapterId: string): ChapterNode | undefined {
  for (const node of nodes) {
    if (node.id === chapterId) return node;
    const child = node.children ? findChapter(node.children, chapterId) : undefined;
    if (child) return child;
  }
  return undefined;
}

export function findSearchMatches(
  documents: SearchDocument[],
  query: string,
  options: SearchOptions
): SearchResults {
  const results: SearchResults = [];
  if (!query) return results;
  let expression: RegExp;
  try {
    const source = options.regularExpression ? query : escapeRegExp(query);
    const boundary = options.wholeWord && !options.regularExpression ? '\\b' : '';
    expression = new RegExp(`${boundary}${source}${boundary}`, options.caseSensitive ? 'g' : 'gi');
  } catch {
    results.error = '正则表达式无效';
    return results;
  }

  for (const document of documents) {
    document.lines.forEach((line, index) => {
      if (expression.test(line)) {
        results.push({ documentId: document.id, label: document.label, line: index + 1, text: line });
      }
      expression.lastIndex = 0;
    });
  }
  return results;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
