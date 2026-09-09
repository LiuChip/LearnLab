import { chapterContent, type TutorialContent } from '../data/viewData';

export type ActivityId =
  'chapters' | 'search' | 'experiments' | 'plugins' | 'dependencies' | 'workspace' | 'explorer';

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
  kind: 'document' | 'experiment' | 'detail';
  detail?: { title: string; description: string; properties: Array<[string, string]> };
  chapterId?: string;
  experimentId?: string;
  dirty?: boolean;
}

export interface ToastNotification {
  id: string;
  level: 'info' | 'warning' | 'error';
  title: string;
  message: string;
}

export interface NotificationEntry extends ToastNotification {
  createdAt: number;
  read: boolean;
  toastVisible: boolean;
}

export interface ExperimentRun {
  id: number;
  experimentId: string;
  completedAt: number;
  output: string;
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
  count: number;
}

export type SearchResults = SearchMatch[] & { error?: string };

export interface WorkbenchState {
  activeActivity: ActivityId;
  activeChapterId: string;
  primaryVisible: boolean;
  expandedChapters: string[];
  editorTabs: EditorTab[];
  activeTabId: string;
  auxiliaryVisible: boolean;
  auxiliaryTab: AuxiliaryTabId;
  assistantDraft: string;
  bottomPanelVisible: boolean;
  bottomPanel: BottomPanelId;
  theme: Theme;
  searchQuery: string;
  replaceQuery: string;
  replacePreserveCase: boolean;
  searchOptions: SearchOptions;
  experimentStatus: Record<string, Experiment['status']>;
  experimentHistory: ExperimentRun[];
  documents: Record<string, TutorialContent>;
  replacementUndo: {
    documents: Record<string, TutorialContent>;
    readingProgress: Record<string, number>;
    scrollPositions: Record<string, number>;
  } | null;
  readingProgress: Record<string, number>;
  scrollPositions: Record<string, number>;
  searchTarget?: { chapterId: string; line: number; request: number };
  notifications: NotificationEntry[];
  notificationSequence: number;
  unreadMessages: number;
  notificationCenterVisible: boolean;
}

export type WorkbenchAction =
  | { type: 'setActivity'; activity: ActivityId }
  | { type: 'togglePrimary' }
  | { type: 'toggleChapter'; chapterId: string }
  | { type: 'selectChapter'; chapterId: string }
  | { type: 'openExperiment'; experimentId: string }
  | { type: 'openDetail'; id: string; detail: NonNullable<EditorTab['detail']> }
  | { type: 'openSearchMatch'; chapterId: string; line: number }
  | { type: 'recordScroll'; tabId: string; top: number; progress?: number }
  | { type: 'activateTab'; tabId: string }
  | { type: 'closeTab'; tabId: string }
  | { type: 'toggleAuxiliary' }
  | { type: 'setAuxiliaryTab'; tab: AuxiliaryTabId }
  | { type: 'setAssistantDraft'; value: string }
  | { type: 'toggleBottomPanel' }
  | { type: 'setBottomPanel'; panel: BottomPanelId }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setSearchQuery'; query: string }
  | { type: 'setReplaceQuery'; query: string }
  | { type: 'toggleReplacePreserveCase' }
  | { type: 'refreshSearch' }
  | { type: 'toggleSearchOption'; option: keyof SearchOptions }
  | { type: 'runExperiment'; experimentId: string }
  | { type: 'markExperimentPassed'; experimentId: string; completedAt?: number }
  | { type: 'replaceAll' }
  | { type: 'undoReplace' }
  | { type: 'expireNotification'; notificationId: string }
  | { type: 'clearNotifications' }
  | { type: 'dismissNotification'; notificationId: string }
  | { type: 'addNotification'; notification: ToastNotification }
  | { type: 'toggleNotificationCenter' };

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
          {
            id: 'select-columns',
            label: '1.1.1 选择列',
            kind: 'section',
            documentTitle: '1.1.1 选择列',
            progress: 1
          },
          {
            id: 'select-alias',
            label: '1.1.2 别名与表达式',
            kind: 'section',
            documentTitle: '1.1.2 别名与表达式',
            progress: 0.48
          }
        ]
      },
      {
        id: 'sorting',
        label: '1.2 排序与分页',
        kind: 'section',
        documentTitle: '1.2 排序与分页',
        progress: 0.36
      }
    ]
  },
  {
    id: 'filtering',
    label: '2. 条件过滤',
    kind: 'chapter',
    documentTitle: '2. 条件过滤',
    progress: 0.24,
    children: [
      {
        id: 'where',
        label: '2.1 WHERE 条件',
        kind: 'section',
        documentTitle: '2.1 WHERE 条件',
        progress: 0.24
      },
      {
        id: 'grouping',
        label: '2.2 分组与聚合',
        kind: 'section',
        documentTitle: '2.2 分组与聚合',
        progress: 0
      }
    ]
  },
  {
    id: 'joins',
    label: '3. 连接与关系',
    kind: 'chapter',
    documentTitle: '3. 连接与关系',
    progress: 0,
    children: [
      {
        id: 'inner-join',
        label: '3.1 INNER JOIN',
        kind: 'section',
        documentTitle: '3.1 INNER JOIN',
        progress: 0
      },
      {
        id: 'outer-join',
        label: '3.2 外连接',
        kind: 'section',
        documentTitle: '3.2 外连接',
        progress: 0
      }
    ]
  },
  {
    id: 'project',
    label: '4. 综合实验',
    kind: 'chapter',
    documentTitle: '4. 综合实验',
    progress: 0
  }
];

export const experiments: Experiment[] = [
  {
    id: 'select-basics',
    title: '实验 1：查询学生信息',
    chapterId: 'basics',
    status: 'passed',
    duration: '4 分钟'
  },
  {
    id: 'where-filter',
    title: '实验 2：筛选成绩记录',
    chapterId: 'filtering',
    status: 'ready',
    duration: '8 分钟'
  },
  {
    id: 'join-report',
    title: '实验 3：生成课程报表',
    chapterId: 'joins',
    status: 'ready',
    duration: '12 分钟'
  }
];

export const allChapters = chapters.flatMap(function flatten(node): ChapterNode[] {
  return [node, ...(node.children ?? []).flatMap(flatten)];
});

function createDocuments(): Record<string, TutorialContent> {
  return Object.fromEntries(
    allChapters.map((node) => [
      node.id,
      chapterContent[node.id] ?? {
        eyebrow: node.label,
        title: node.documentTitle,
        description: `本节学习 ${node.documentTitle.replace(/^[\d.]+\s*/, '')}。`,
        sections: [{ title: '学习目标', copy: '理解语句的含义，观察查询结果，并尝试不同的输入。' }],
        code: 'SELECT name, score FROM students;'
      }
    ])
  );
}

export function getSearchDocuments(documents: Record<string, TutorialContent>): SearchDocument[] {
  return allChapters.map((node) => {
    const content = documents[node.id];
    return {
      id: node.id,
      label: `${node.documentTitle}.md`,
      lines: [
        content.title,
        content.description,
        ...content.sections.flatMap((section) => [section.title, section.copy]),
        ...content.code.split('\n')
      ]
    };
  });
}

export const searchDocuments = getSearchDocuments(createDocuments());

export function createInitialState(): WorkbenchState {
  return {
    activeActivity: 'chapters',
    activeChapterId: 'basics',
    primaryVisible: true,
    expandedChapters: [],
    editorTabs: [
      { id: 'chapter:basics', label: '1.1 基础查询.md', kind: 'document', chapterId: 'basics' }
    ],
    activeTabId: 'chapter:basics',
    auxiliaryVisible: true,
    auxiliaryTab: 'assistant',
    assistantDraft: '',
    bottomPanelVisible: false,
    bottomPanel: 'history',
    theme: 'dark',
    searchQuery: '',
    replaceQuery: '',
    replacePreserveCase: false,
    searchOptions: { caseSensitive: false, wholeWord: false, regularExpression: false },
    experimentStatus: Object.fromEntries(
      experiments.map((experiment) => [experiment.id, experiment.status])
    ),
    experimentHistory: [],
    documents: createDocuments(),
    replacementUndo: null,
    readingProgress: Object.fromEntries(allChapters.map((node) => [node.id, node.progress])),
    scrollPositions: {},
    notifications: [
      {
        id: 'package-ready',
        level: 'info',
        title: '实验包已准备就绪',
        message: 'SQL 基础 · 3 个插件已加载',
        createdAt: Date.now(),
        read: false,
        toastVisible: true
      },
      {
        id: 'runtime-warning',
        level: 'warning',
        title: '运行时提醒',
        message: '可选的 MySQL 客户端尚未配置。当前 SQLite 实验可正常使用。',
        createdAt: Date.now(),
        read: false,
        toastVisible: true
      }
    ],
    notificationSequence: 0,
    unreadMessages: 2,
    notificationCenterVisible: false
  };
}

function ensureTab(state: WorkbenchState, tab: EditorTab): WorkbenchState {
  const exists = state.editorTabs.some((current) => current.id === tab.id);
  return {
    ...state,
    editorTabs: exists ? state.editorTabs : [...state.editorTabs, tab],
    activeTabId: tab.id,
    activeChapterId: tab.chapterId ?? ''
  };
}

function notify(state: WorkbenchState, notification: ToastNotification): WorkbenchState {
  const sequence = state.notificationSequence + 1;
  const entry = {
    ...notification,
    id: `${notification.id}:${sequence}`,
    createdAt: Date.now(),
    read: state.notificationCenterVisible,
    toastVisible: !state.notificationCenterVisible
  };
  const notifications = [...state.notifications, entry];
  return {
    ...state,
    notifications,
    notificationSequence: sequence,
    unreadMessages: notifications.filter((item) => !item.read).length
  };
}

function updateNotifications(
  state: WorkbenchState,
  notifications: NotificationEntry[]
): WorkbenchState {
  return {
    ...state,
    notifications,
    unreadMessages: notifications.filter((item) => !item.read).length
  };
}

function activateTab(state: WorkbenchState, tabId: string): WorkbenchState {
  const tab = state.editorTabs.find((item) => item.id === tabId);
  return { ...state, activeTabId: tab?.id ?? '', activeChapterId: tab?.chapterId ?? '' };
}

export function workbenchReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case 'setActivity':
      return {
        ...state,
        activeActivity: action.activity,
        primaryVisible: state.activeActivity === action.activity ? !state.primaryVisible : true
      };
    case 'togglePrimary':
      return { ...state, primaryVisible: !state.primaryVisible };
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
        {
          id: `chapter:${action.chapterId}`,
          label: `${node.documentTitle}.md`,
          kind: 'document',
          chapterId: action.chapterId
        }
      );
    }
    case 'openExperiment': {
      const experiment = experiments.find((item) => item.id === action.experimentId);
      if (!experiment) return state;
      return ensureTab(state, {
        id: `experiment:${experiment.id}`,
        label: experiment.title.replace(/^实验 \d+：/, '实验 · '),
        kind: 'experiment',
        chapterId: experiment.chapterId,
        experimentId: experiment.id
      });
    }
    case 'openDetail':
      return ensureTab(state, {
        id: `detail:${action.id}`,
        kind: 'detail',
        label: action.detail.title,
        detail: action.detail
      });
    case 'openSearchMatch': {
      const next = workbenchReducer(state, { type: 'selectChapter', chapterId: action.chapterId });
      return {
        ...next,
        searchTarget: {
          chapterId: action.chapterId,
          line: action.line,
          request: (state.searchTarget?.request ?? 0) + 1
        }
      };
    }
    case 'recordScroll': {
      const tab = state.editorTabs.find((item) => item.id === action.tabId);
      if (!tab || !Number.isFinite(action.top)) return state;
      const readingProgress =
        tab.kind === 'document' &&
        tab.chapterId &&
        action.progress !== undefined &&
        Number.isFinite(action.progress)
          ? {
              ...state.readingProgress,
              [tab.chapterId]: Math.max(
                state.readingProgress[tab.chapterId] ?? 0,
                Math.min(1, Math.max(0, action.progress))
              )
            }
          : state.readingProgress;
      return {
        ...state,
        readingProgress,
        scrollPositions: { ...state.scrollPositions, [action.tabId]: action.top }
      };
    }
    case 'activateTab':
      return state.editorTabs.some((tab) => tab.id === action.tabId)
        ? activateTab(state, action.tabId)
        : state;
    case 'closeTab': {
      const index = state.editorTabs.findIndex((tab) => tab.id === action.tabId);
      if (index < 0) return state;
      const editorTabs = state.editorTabs.filter((tab) => tab.id !== action.tabId);
      return activateTab(
        { ...state, editorTabs },
        state.activeTabId === action.tabId
          ? (editorTabs[Math.max(0, index - 1)]?.id ?? '')
          : state.activeTabId
      );
    }
    case 'toggleAuxiliary':
      return { ...state, auxiliaryVisible: !state.auxiliaryVisible };
    case 'setAuxiliaryTab':
      return { ...state, auxiliaryVisible: true, auxiliaryTab: action.tab };
    case 'setAssistantDraft':
      return { ...state, assistantDraft: action.value };
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
      return notify(state, {
        id: 'search-refresh',
        level: 'info',
        title: '搜索结果已刷新',
        message: '已重新扫描当前实验包。'
      });
    case 'toggleSearchOption':
      return {
        ...state,
        searchOptions: {
          ...state.searchOptions,
          [action.option]: !state.searchOptions[action.option]
        }
      };
    case 'runExperiment':
      return !experiments.some((item) => item.id === action.experimentId) ||
        state.experimentStatus[action.experimentId] === 'running'
        ? state
        : {
            ...state,
            experimentStatus: { ...state.experimentStatus, [action.experimentId]: 'running' }
          };
    case 'markExperimentPassed': {
      if (state.experimentStatus[action.experimentId] !== 'running') return state;
      const experiment = experiments.find((item) => item.id === action.experimentId)!;
      return notify(
        {
          ...state,
          experimentStatus: { ...state.experimentStatus, [action.experimentId]: 'passed' },
          experimentHistory: [
            {
              id: state.experimentHistory.length + 1,
              experimentId: action.experimentId,
              completedAt: action.completedAt ?? Date.now(),
              output: '模拟执行完成，输出与预期一致。'
            },
            ...state.experimentHistory
          ]
        },
        {
          id: 'run',
          level: 'info',
          title: '实验运行完成',
          message: `${experiment.title}，结果已记录。`
        }
      );
    }
    case 'replaceAll': {
      const matches = findSearchMatches(
        getSearchDocuments(state.documents),
        state.searchQuery,
        state.searchOptions
      );
      if (matches.error || !matches.length) return state;
      const replace = (text: string) =>
        replaceSearchText(
          text,
          state.searchQuery,
          state.replaceQuery,
          state.searchOptions,
          state.replacePreserveCase
        );
      const documents = { ...state.documents };
      const readingProgress = { ...state.readingProgress };
      const scrollPositions = { ...state.scrollPositions };
      const replacementUndo: NonNullable<WorkbenchState['replacementUndo']> = {
        documents: {},
        readingProgress: {},
        scrollPositions: {}
      };
      for (const id of new Set(matches.map((match) => match.documentId))) {
        const doc = documents[id];
        let changed = false;
        const replaceField = (text: string) => {
          const next = replace(text);
          changed ||= next !== text;
          return next;
        };
        const next = {
          ...doc,
          title: replaceField(doc.title),
          description: replaceField(doc.description),
          sections: doc.sections.map((section) => ({
            title: replaceField(section.title),
            copy: replaceField(section.copy)
          })),
          code: doc.code.split('\n').map(replaceField).join('\n')
        };
        if (!changed) continue;
        documents[id] = next;
        replacementUndo.documents[id] = doc;
        replacementUndo.readingProgress[id] = readingProgress[id] ?? 0;
        replacementUndo.scrollPositions[`chapter:${id}`] = scrollPositions[`chapter:${id}`] ?? 0;
        readingProgress[id] = 0;
        scrollPositions[`chapter:${id}`] = 0;
      }
      if (!Object.keys(replacementUndo.documents).length) return state;
      return notify(
        {
          ...state,
          documents,
          readingProgress,
          scrollPositions,
          replacementUndo
        },
        {
          id: 'replace',
          level: 'info',
          title: '替换完成',
          message: `已替换 ${matches.reduce((total, item) => total + item.count, 0)} 处匹配。`
        }
      );
    }
    case 'undoReplace':
      return state.replacementUndo
        ? notify(
            {
              ...state,
              documents: { ...state.documents, ...state.replacementUndo.documents },
              readingProgress: {
                ...state.readingProgress,
                ...state.replacementUndo.readingProgress
              },
              scrollPositions: {
                ...state.scrollPositions,
                ...state.replacementUndo.scrollPositions
              },
              replacementUndo: null
            },
            { id: 'undo', level: 'info', title: '已撤销替换', message: '正文已恢复。' }
          )
        : state;
    case 'expireNotification':
      return updateNotifications(
        state,
        state.notifications.map((item) =>
          item.id === action.notificationId ? { ...item, toastVisible: false } : item
        )
      );
    case 'clearNotifications':
      return updateNotifications(state, []);
    case 'dismissNotification':
      return updateNotifications(
        state,
        state.notifications.filter((item) => item.id !== action.notificationId)
      );
    case 'addNotification':
      return notify(state, action.notification);
    case 'toggleNotificationCenter':
      return updateNotifications(
        { ...state, notificationCenterVisible: !state.notificationCenterVisible },
        state.notificationCenterVisible
          ? state.notifications
          : state.notifications.map((item) => ({ ...item, read: true, toastVisible: false }))
      );
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
    expression = searchExpression(query, options);
  } catch {
    results.error = '正则表达式无效';
    return results;
  }

  for (const document of documents) {
    document.lines.forEach((line, index) => {
      const count = [...line.matchAll(expression)].length;
      if (count) {
        results.push({
          documentId: document.id,
          label: document.label,
          line: index + 1,
          text: line,
          count
        });
      }
      expression.lastIndex = 0;
    });
  }
  return results;
}

function searchExpression(query: string, options: SearchOptions): RegExp {
  const source = options.regularExpression ? query : escapeRegExp(query);
  const bounded = options.wholeWord
    ? `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
    : source;
  return new RegExp(bounded, options.caseSensitive ? 'gu' : 'giu');
}

export function replaceSearchText(
  text: string,
  query: string,
  replacement: string,
  options: SearchOptions,
  preserveCase: boolean
): string {
  const expression = searchExpression(query, options);
  if (!preserveCase)
    return options.regularExpression
      ? text.replace(expression, replacement)
      : text.replace(expression, () => replacement);
  // Let the native replacement engine expand captures in their original context.
  const matches = [...text.matchAll(expression)];
  let result = text;
  for (const match of matches.reverse()) {
    const index = match.index!;
    const single = new RegExp(expression.source, expression.flags.replace('g', 'y'));
    single.lastIndex = index;
    const replaced = text.replace(single, replacement);
    const expanded = options.regularExpression
      ? replaced.slice(index, replaced.length - (text.length - index - match[0].length))
      : replacement;
    const sample = match[0];
    const value =
      sample && sample === sample.toUpperCase()
        ? expanded.toUpperCase()
        : sample && sample === sample.toLowerCase()
          ? expanded.toLowerCase()
          : /^[\p{Lu}][\p{Ll}]+$/u.test(sample)
            ? expanded.charAt(0).toUpperCase() + expanded.slice(1).toLowerCase()
            : expanded;
    result = result.slice(0, index) + value + result.slice(index + sample.length);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
