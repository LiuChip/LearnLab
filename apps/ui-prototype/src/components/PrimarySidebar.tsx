import { useMemo, useState } from 'preact/hooks';
import {
  allChapters,
  chapters,
  experiments,
  findSearchMatches,
  getSearchDocuments,
  type ActivityId,
  type ChapterNode,
  type WorkbenchAction,
  type WorkbenchState
} from '../model/workbench';
import { dependencyItems, pluginItems, workspaceItems } from '../data/viewData';

type Props = { state: WorkbenchState; dispatch: (action: WorkbenchAction) => void };
const titles: Record<ActivityId, string> = {
  chapters: '章节',
  search: '搜索',
  experiments: '实验',
  plugins: '插件',
  dependencies: '依赖',
  workspace: '学习区',
  explorer: '资源管理器'
};

export function PrimarySidebar({ state, dispatch }: Props) {
  return (
    <aside class="primary-sidebar" aria-label={titles[state.activeActivity]}>
      <header class="sidebar-heading">
        <span>{titles[state.activeActivity]}</span>
        <button
          class="ghost-button"
          title="隐藏主侧栏"
          aria-label="隐藏主侧栏"
          onClick={() => dispatch({ type: 'togglePrimary' })}
        >
          ×
        </button>
      </header>
      <div class="sidebar-content">
        {state.activeActivity === 'chapters' && (
          <>
            <div class="tree-caption">
              <strong>SQL 基础</strong>
              <span>{chapters.length} 章</span>
            </div>
            <div class="chapter-tree">
              {chapters.map((node) => (
                <ChapterTreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  state={state}
                  dispatch={dispatch}
                />
              ))}
            </div>
          </>
        )}
        {state.activeActivity === 'search' && <SearchView state={state} dispatch={dispatch} />}
        {state.activeActivity === 'experiments' && (
          <>
            <div class="sidebar-context">
              {allChapters.find((node) => node.id === state.activeChapterId)?.documentTitle ??
                '当前文档'}
            </div>
            {experiments
              .filter((item) => item.chapterId === state.activeChapterId)
              .map((experiment) => (
                <button
                  class="experiment-row"
                  key={experiment.id}
                  onClick={() => dispatch({ type: 'openExperiment', experimentId: experiment.id })}
                >
                  <span class="file-type">SQL</span>
                  <span class="detail-copy">
                    <strong>{experiment.title}</strong>
                    <small>
                      {experiment.duration} ·{' '}
                      {state.experimentStatus[experiment.id] === 'running'
                        ? '运行中'
                        : state.experimentStatus[experiment.id] === 'passed'
                          ? '已通过'
                          : '待开始'}
                    </small>
                  </span>
                </button>
              ))}
            {!experiments.some((item) => item.chapterId === state.activeChapterId) && (
              <p class="empty-copy">当前文档没有实验</p>
            )}
          </>
        )}
        {(state.activeActivity === 'plugins' || state.activeActivity === 'dependencies') && (
          <Catalog key={state.activeActivity} state={state} dispatch={dispatch} />
        )}
        {state.activeActivity === 'workspace' && (
          <>
            <div class="tree-caption">
              <strong>我的学习区</strong>
              <span>3 个实验包</span>
            </div>
            {workspaceItems.map((item) => (
              <button
                class="workspace-row"
                key={item.name}
                onClick={() =>
                  dispatch({
                    type: 'openDetail',
                    id: `package:${item.name}`,
                    detail: {
                      title: item.name,
                      description: '实验包信息',
                      properties: [
                        ['作者', item.author],
                        ['最近更新', item.updated],
                        [
                          '状态',
                          item.name === 'SQL 基础' ? '当前实验包' : '示例条目，未接入实验包切换'
                        ]
                      ]
                    }
                  })
                }
              >
                <span class="workspace-top">
                  <strong>{item.name}</strong>
                  {item.name === 'SQL 基础' && <small>当前</small>}
                </span>
                <small>{item.author}</small>
              </button>
            ))}
          </>
        )}
        {state.activeActivity === 'explorer' && <Explorer state={state} dispatch={dispatch} />}
      </div>
    </aside>
  );
}

function ChapterTreeNode({
  node,
  level,
  state,
  dispatch
}: Props & { node: ChapterNode; level: number }) {
  const expanded = state.expandedChapters.includes(node.id);
  return (
    <div class="tree-node-group">
      <div
        class={`tree-node${state.activeChapterId === node.id ? ' is-selected' : ''}`}
        style={{ paddingLeft: `${8 + level * 14}px` }}
      >
        {node.children?.length ? (
          <button
            class="tree-chevron"
            aria-label={`${expanded ? '折叠' : '展开'} ${node.label}`}
            aria-expanded={expanded}
            onClick={() => dispatch({ type: 'toggleChapter', chapterId: node.id })}
          >
            {expanded ? '⌄' : '›'}
          </button>
        ) : (
          <span class="tree-indent" />
        )}
        <button
          class="tree-label"
          title={node.label}
          onClick={() => dispatch({ type: 'selectChapter', chapterId: node.id })}
        >
          {node.label}
        </button>
        <span class="tree-progress">
          {Math.round((state.readingProgress[node.id] ?? 0) * 100)}%
        </span>
      </div>
      {expanded &&
        node.children?.map((child) => (
          <ChapterTreeNode
            key={child.id}
            node={child}
            level={level + 1}
            state={state}
            dispatch={dispatch}
          />
        ))}
    </div>
  );
}

function SearchView({ state, dispatch }: Props) {
  const [replaceVisible, setReplaceVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const results = useMemo(
    () =>
      findSearchMatches(
        getSearchDocuments(state.documents),
        state.searchQuery,
        state.searchOptions
      ),
    [state.documents, state.searchQuery, state.searchOptions]
  );
  const groups = [...new Set(results.map((item) => item.documentId))];
  const count = results.reduce((sum, item) => sum + item.count, 0);
  const send = (action: WorkbenchAction) => {
    setConfirming(false);
    dispatch(action);
  };
  return (
    <div class="search-view">
      <div class="search-toolbar">
        <button
          class="icon-button"
          title="刷新结果"
          aria-label="刷新结果"
          onClick={() => send({ type: 'refreshSearch' })}
        >
          ↻
        </button>
        <button
          class="icon-button"
          title="清空搜索结果"
          aria-label="清空搜索结果"
          disabled={!state.searchQuery}
          onClick={() => send({ type: 'setSearchQuery', query: '' })}
        >
          ≡×
        </button>
        <span class="toolbar-spacer" />
        <button
          class="icon-button"
          title="折叠 / 展开全部结果"
          aria-label="折叠或展开全部结果"
          disabled={!results.length}
          onClick={() => setCollapsed(collapsed.length ? [] : groups)}
        >
          ≡
        </button>
        <button
          class="icon-button"
          title="撤销上次替换"
          aria-label="撤销上次替换"
          disabled={!state.replacementUndo}
          onClick={() => send({ type: 'undoReplace' })}
        >
          ↶
        </button>
      </div>
      <div class="search-fields">
        <button
          class="replace-toggle"
          title="切换替换"
          aria-label="切换替换"
          aria-expanded={replaceVisible}
          onClick={() => {
            setReplaceVisible(!replaceVisible);
            setConfirming(false);
          }}
        >
          {replaceVisible ? '⌄' : '›'}
        </button>
        <div class="search-inputs">
          <div class="search-input-wrap">
            <input
              autoFocus
              value={state.searchQuery}
              placeholder="搜索"
              aria-label="搜索文本"
              onInput={(event) =>
                send({ type: 'setSearchQuery', query: event.currentTarget.value })
              }
            />
            {(
              [
                { option: 'caseSensitive', label: '区分大小写', text: 'Aa' },
                { option: 'wholeWord', label: '全字匹配', text: 'ab' },
                { option: 'regularExpression', label: '使用正则表达式', text: '.*' }
              ] as const
            ).map((item) => (
              <button
                key={item.option}
                class="input-toggle"
                title={item.label}
                aria-label={item.label}
                aria-pressed={state.searchOptions[item.option]}
                onClick={() => send({ type: 'toggleSearchOption', option: item.option })}
              >
                {item.text}
              </button>
            ))}
          </div>
          {replaceVisible && (
            <div class="replace-input-wrap">
              <input
                value={state.replaceQuery}
                aria-label="替换文本"
                placeholder="替换"
                onInput={(event) =>
                  send({ type: 'setReplaceQuery', query: event.currentTarget.value })
                }
              />
              <button
                class="input-toggle"
                title="保留大小写"
                aria-label="保留大小写"
                aria-pressed={state.replacePreserveCase}
                onClick={() => send({ type: 'toggleReplacePreserveCase' })}
              >
                AB
              </button>
              <button
                class="input-toggle"
                title="全部替换"
                aria-label="全部替换"
                disabled={!count || Boolean(results.error)}
                onClick={() => setConfirming(true)}
              >
                ⇄
              </button>
            </div>
          )}
        </div>
      </div>
      <div class="search-scope">SQL 基础</div>
      {confirming && (
        <div class="replace-confirm" role="alertdialog" aria-label="确认替换">
          <p>
            替换 {groups.length} 个文档中的 {count} 处匹配？
          </p>
          <div>
            <button onClick={() => setConfirming(false)}>取消</button>
            <button class="primary-button" onClick={() => send({ type: 'replaceAll' })}>
              确认替换
            </button>
          </div>
        </div>
      )}
      {results.error ? (
        <p class="inline-error" role="alert">
          {results.error}
        </p>
      ) : state.searchQuery ? (
        <div class="search-results">
          <div class="results-count">
            {count ? `${groups.length} 个文档，${count} 处匹配` : '没有找到结果'}
          </div>
          {groups.map((id) => (
            <div key={id}>
              <button
                class="result-file"
                aria-expanded={!collapsed.includes(id)}
                onClick={() =>
                  setCollapsed(
                    collapsed.includes(id)
                      ? collapsed.filter((item) => item !== id)
                      : [...collapsed, id]
                  )
                }
              >
                <span>{collapsed.includes(id) ? '›' : '⌄'}</span>
                <span>{results.find((item) => item.documentId === id)!.label}</span>
                <small>
                  {results
                    .filter((item) => item.documentId === id)
                    .reduce((sum, item) => sum + item.count, 0)}
                </small>
              </button>
              {!collapsed.includes(id) &&
                results
                  .filter((item) => item.documentId === id)
                  .map((result) => (
                    <button
                      class="search-result"
                      key={result.line}
                      title={result.text}
                      onClick={() =>
                        dispatch({ type: 'openSearchMatch', chapterId: id, line: result.line })
                      }
                    >
                      <span class="result-line-number">{result.line}</span>
                      <span>{result.text}</span>
                    </button>
                  ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Catalog({ state, dispatch }: Props) {
  const [query, setQuery] = useState('');
  const plugins = state.activeActivity === 'plugins';
  const items = plugins
    ? pluginItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        state: item.state,
        version: item.version,
        properties: [
          ['版本', item.version],
          ['状态', item.state],
          ['作用域', '当前实验包']
        ] as Array<[string, string]>
      }))
    : dependencyItems.map((item) => ({
        id: item.name,
        name: item.name,
        description: item.kind,
        state: item.status,
        version: item.version,
        properties: [
          ['版本', item.version],
          ['类型', item.kind],
          ['状态', item.status],
          ['大小', item.size]
        ] as Array<[string, string]>
      }));
  const filtered = items.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <>
      <div class="catalog-search">
        <input
          value={query}
          aria-label={plugins ? '搜索插件' : '搜索依赖'}
          placeholder={plugins ? '搜索已安装插件' : '搜索依赖'}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <div class="tree-caption">
        {plugins ? '已安装' : '学习区依赖'}
        <span>{filtered.length}</span>
      </div>
      {filtered.map((item) => (
        <button
          class="catalog-row"
          key={item.id}
          onClick={() =>
            dispatch({
              type: 'openDetail',
              id: `${state.activeActivity}:${item.id}`,
              detail: {
                title: item.name,
                description: item.description,
                properties: item.properties
              }
            })
          }
        >
          <span class="catalog-mark">{plugins ? 'P' : 'D'}</span>
          <span class="detail-copy">
            <strong>{item.name}</strong>
            <small>{item.description}</small>
            <small>
              {item.version} · {item.state}
            </small>
          </span>
        </button>
      ))}
      {!filtered.length && <p class="empty-copy">没有找到结果</p>}
    </>
  );
}

function Explorer({ dispatch }: Props) {
  return (
    <div class="explorer-list">
      <div class="tree-caption">
        <strong>SQL 基础</strong>
      </div>
      <details open>
        <summary>chapters</summary>
        {allChapters.map((node) => (
          <button
            class="explorer-row"
            key={node.id}
            onClick={() => dispatch({ type: 'selectChapter', chapterId: node.id })}
          >
            <span class="file-type">M↓</span>
            {node.documentTitle}.md
          </button>
        ))}
      </details>
      <details>
        <summary>experiments</summary>
        {experiments.map((item) => (
          <button
            class="explorer-row"
            key={item.id}
            onClick={() => dispatch({ type: 'openExperiment', experimentId: item.id })}
          >
            {item.id}.sql
          </button>
        ))}
      </details>
      <button
        class="explorer-row"
        onClick={() =>
          dispatch({
            type: 'openDetail',
            id: 'manifest',
            detail: {
              title: 'manifest.json',
              description: '实验包清单',
              properties: [
                ['id', 'sql-intro'],
                ['version', '1.2.0'],
                ['author', 'LearnLab Team'],
                ['runtime', 'SQLite 3']
              ]
            }
          })
        }
      >
        manifest.json
      </button>
    </div>
  );
}
