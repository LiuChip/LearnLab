import { useMemo, useState } from 'preact/hooks';
import type { ActivityId, ChapterNode, WorkbenchAction, WorkbenchState } from '../model/workbench';
import { chapters, experiments, findSearchMatches, searchDocuments } from '../model/workbench';
import { dependencyItems, explorerItems, pluginItems, workspaceItems } from '../data/viewData';
import { Icon } from './Icon';

interface SidebarProps {
  state: WorkbenchState;
  dispatch: (action: WorkbenchAction) => void;
}

const activityTitles: Record<ActivityId, string> = {
  chapters: '章节', search: '搜索', experiments: '实验', plugins: '插件', dependencies: '依赖', workspace: '学习区', explorer: '资源管理器'
};

export function PrimarySidebar({ state, dispatch }: SidebarProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const results = useMemo(() => findSearchMatches(searchDocuments, state.searchQuery, state.searchOptions), [state.searchQuery, state.searchOptions]);
  return (
    <aside class="primary-sidebar">
      <div class="sidebar-heading">
        <span>{activityTitles[state.activeActivity]}</span>
        <button class="ghost-button" type="button" aria-label="更多操作" title="更多操作">···</button>
      </div>
      <div class="sidebar-content">
        {state.activeActivity === 'chapters' ? <ChapterView state={state} dispatch={dispatch} /> : null}
        {state.activeActivity === 'search' ? <SearchView state={state} dispatch={dispatch} focused={searchFocused} setFocused={setSearchFocused} results={results} /> : null}
        {state.activeActivity === 'experiments' ? <ExperimentView state={state} dispatch={dispatch} /> : null}
        {state.activeActivity === 'plugins' ? <PluginView /> : null}
        {state.activeActivity === 'dependencies' ? <DependencyView /> : null}
        {state.activeActivity === 'workspace' ? <WorkspaceView /> : null}
        {state.activeActivity === 'explorer' ? <ExplorerView /> : null}
      </div>
    </aside>
  );
}

function ChapterView({ state, dispatch }: SidebarProps) {
  return <>
    <div class="sidebar-context"><span class="status-dot" /> SQL 基础 <span class="context-muted">· 学习区</span></div>
    <div class="tree-caption">课程目录 <span>4 章 · 11 节</span></div>
    <div class="chapter-tree">
      {chapters.map((node) => <ChapterTreeNode node={node} level={0} state={state} dispatch={dispatch} key={node.id} />)}
    </div>
  </>;
}

function ChapterTreeNode({ node, level, state, dispatch }: { node: ChapterNode; level: number; state: WorkbenchState; dispatch: (action: WorkbenchAction) => void }) {
  const hasChildren = Boolean(node.children?.length);
  const expanded = state.expandedChapters.includes(node.id);
  const selected = state.activeChapterId === node.id;
  return <div class="tree-node-group">
    <div class={`tree-node${selected ? ' is-selected' : ''}`} style={{ paddingLeft: `${12 + level * 16}px` }}>
      {hasChildren ? <button class="tree-chevron" type="button" aria-label={expanded ? `折叠 ${node.label}` : `展开 ${node.label}`} onClick={() => dispatch({ type: 'toggleChapter', chapterId: node.id })}><Icon glyph={expanded ? '⌄' : '›'} /></button> : <span class="tree-indent" />}
      <button class="tree-label" type="button" onClick={() => dispatch({ type: 'selectChapter', chapterId: node.id })}>
        <span class="tree-kind">{node.kind === 'chapter' ? '▥' : '·'}</span><span>{node.label}</span>
      </button>
      <span class="tree-progress">{Math.round(node.progress * 100)}%</span>
    </div>
    {expanded && node.children?.map((child) => <ChapterTreeNode node={child} level={level + 1} state={state} dispatch={dispatch} key={child.id} />)}
  </div>;
}

function SearchView({ state, dispatch, focused, setFocused, results }: SidebarProps & { focused: boolean; setFocused: (value: boolean) => void; results: ReturnType<typeof findSearchMatches> }) {
  return <div class="search-view">
    <div class="search-toolbar"><button class="icon-button" type="button" title="刷新结果" aria-label="刷新结果" onClick={() => dispatch({ type: 'refreshSearch' })}>↻</button><button class="icon-button" type="button" title="清空搜索结果" aria-label="清空搜索结果" onClick={() => dispatch({ type: 'setSearchQuery', query: '' })}>≡×</button><span class="toolbar-spacer" /><button class="icon-button" type="button" title="在文件中搜索" aria-label="在文件中搜索">▧</button><button class="icon-button" type="button" title="收起全部" aria-label="收起全部">≡</button></div>
    <div class={`search-input-wrap${focused ? ' is-focused' : ''}`}><input value={state.searchQuery} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onInput={(event) => dispatch({ type: 'setSearchQuery', query: (event.currentTarget as HTMLInputElement).value })} placeholder="搜索" aria-label="搜索" /><button class="input-toggle" type="button" title="区分大小写" aria-label="区分大小写" onClick={() => dispatch({ type: 'toggleSearchOption', option: 'caseSensitive' })} data-active={state.searchOptions.caseSensitive}>Aa</button><button class="input-toggle" type="button" title="全字匹配" aria-label="全字匹配" onClick={() => dispatch({ type: 'toggleSearchOption', option: 'wholeWord' })} data-active={state.searchOptions.wholeWord}>ab</button><button class="input-toggle" type="button" title="使用正则表达式" aria-label="使用正则表达式" onClick={() => dispatch({ type: 'toggleSearchOption', option: 'regularExpression' })} data-active={state.searchOptions.regularExpression}>.*</button></div>
    <div class="replace-input-wrap"><input value={state.replaceQuery} onInput={(event) => dispatch({ type: 'setReplaceQuery', query: (event.currentTarget as HTMLInputElement).value })} placeholder="替换" aria-label="替换" /><button class="input-toggle" type="button" title="保留大小写" aria-label="保留大小写" data-active={state.replacePreserveCase} onClick={() => dispatch({ type: 'toggleReplacePreserveCase' })}>Aa</button><button class="input-toggle" type="button" title="全部替换" aria-label="全部替换" disabled={!state.searchQuery || results.length === 0} onClick={() => dispatch({ type: 'replaceAll', matchCount: results.length })}>⇄</button></div>
    <div class="search-options"><span class={state.searchOptions.caseSensitive ? 'is-on' : ''}>Aa</span><span class={state.searchOptions.wholeWord ? 'is-on' : ''}>全字</span><span class={state.searchOptions.regularExpression ? 'is-on' : ''}>正则</span><span class="toolbar-spacer" />···</div>
    {results.error ? <div class="inline-error">{results.error}</div> : null}
    {state.searchQuery && !results.error ? <div class="search-results"><div class="results-count">{results.length} 个结果</div>{results.map((result) => <button class="search-result" type="button" key={`${result.documentId}:${result.line}`} onClick={() => dispatch({ type: 'selectChapter', chapterId: result.documentId })}><span class="result-file">{result.label}</span><span class="result-line">第 {result.line} 行 · {result.text}</span></button>)}</div> : <div class="search-empty"><span class="empty-symbol">⌕</span><strong>在学习区中搜索</strong><span>输入内容后查找教程中的文本</span></div>}
  </div>;
}

function ExperimentView({ state, dispatch }: SidebarProps) {
  const current = experiments.filter((experiment) => experiment.chapterId === state.activeChapterId || experiment.chapterId === 'basics');
  return <div class="experiment-list"><div class="sidebar-context"><span class="status-dot status-dot-blue" /> 当前文档 · 可运行实验</div>{current.map((experiment) => <button class="experiment-row" type="button" key={experiment.id} onClick={() => dispatch({ type: 'openExperiment', experimentId: experiment.id })}><span class={`experiment-glyph ${state.experimentStatus[experiment.id] === 'passed' ? 'is-passed' : ''}`}>{state.experimentStatus[experiment.id] === 'passed' ? '✓' : '◇'}</span><span class="experiment-copy"><strong>{experiment.title}</strong><small>{experiment.duration} · {state.experimentStatus[experiment.id] === 'passed' ? '已通过' : '待开始'}</small></span><span class="row-arrow">›</span></button>)}</div>;
}

function PluginView() { return <div class="detail-list">{pluginItems.map((plugin) => <div class="detail-card" key={plugin.id}><span class={`plugin-mark mark-${plugin.color}`}>{plugin.glyph}</span><span class="detail-copy"><strong>{plugin.name}</strong><small>{plugin.description}</small><em>{plugin.version} · {plugin.state}</em></span><span class="row-arrow">›</span></div>)}</div>; }
function DependencyView() { return <div class="detail-list">{dependencyItems.map((dependency) => <div class="dependency-row" key={dependency.name}><span class="dependency-mark">⬡</span><span class="detail-copy"><strong>{dependency.name}</strong><small>{dependency.kind} · {dependency.size}</small></span><span class={`state-pill ${dependency.status === '就绪' ? 'is-ready' : 'is-warning'}`}>{dependency.status}</span></div>)}</div>; }
function WorkspaceView() { return <div class="detail-list">{workspaceItems.map((workspace) => <div class="workspace-row" key={workspace.name}><div class="workspace-top"><span class="folder-mark">▰</span><strong>{workspace.name}</strong><span class="row-arrow">›</span></div><small>{workspace.author} · 更新于{workspace.updated}</small><div class="mini-progress"><span style={{ width: `${workspace.progress}%` }} /></div><em>{workspace.progress}% 已学习</em></div>)}</div>; }
function ExplorerView() { return <div class="explorer-list">{explorerItems.map((item) => <button type="button" class="explorer-row" key={item.name}><span>{item.type === 'folder' ? '›' : '·'}</span><Icon glyph={item.type === 'folder' ? '▰' : '▤'} /><span>{item.name}</span></button>)}</div>; }
