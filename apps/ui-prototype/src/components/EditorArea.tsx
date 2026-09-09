import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { WorkbenchAction, WorkbenchState } from '../model/workbench';
import { experiments, findChapter, chapters } from '../model/workbench';

type Props = { state: WorkbenchState; dispatch: (action: WorkbenchAction) => void };

export function EditorArea({ state, dispatch }: Props) {
  const activeTab = state.editorTabs.find((tab) => tab.id === state.activeTabId);
  const activeDocument =
    activeTab?.kind === 'document' ? state.documents[activeTab.chapterId!] : undefined;
  const reader = useRef<HTMLElement>(null);
  const tabStrip = useRef<HTMLDivElement>(null);
  const restoring = useRef(false);
  const lastSearchRequest = useRef(0);
  useEffect(() => {
    if (activeTab?.kind !== 'document' || !reader.current) return;
    const element = reader.current;
    const measure = () => {
      if (element.clientHeight > 0 && element.scrollHeight <= element.clientHeight + 1)
        dispatch({ type: 'recordScroll', tabId: activeTab.id, top: 0, progress: 1 });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeTab?.id, state.documents, dispatch]);
  useLayoutEffect(() => {
    restoring.current = true;
    if (reader.current) reader.current.scrollTop = state.scrollPositions[state.activeTabId] ?? 0;
    const selected = tabStrip.current?.querySelector<HTMLElement>('.is-active');
    if (selected && tabStrip.current) {
      const strip = tabStrip.current;
      if (selected.offsetLeft < strip.scrollLeft) strip.scrollLeft = selected.offsetLeft;
      else if (selected.offsetLeft + selected.offsetWidth > strip.scrollLeft + strip.clientWidth)
        strip.scrollLeft = selected.offsetLeft + selected.offsetWidth - strip.clientWidth;
    }
    const frame = requestAnimationFrame(() => {
      restoring.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [state.activeTabId, activeDocument]);
  useLayoutEffect(() => {
    if (
      !state.searchTarget ||
      state.searchTarget.request === lastSearchRequest.current ||
      activeTab?.chapterId !== state.searchTarget.chapterId
    )
      return;
    lastSearchRequest.current = state.searchTarget.request;
    const target = reader.current?.querySelector<HTMLElement>(
      `[data-search-line="${state.searchTarget.line}"]`
    );
    if (target && reader.current) {
      reader.current.scrollTop +=
        target.getBoundingClientRect().top - reader.current.getBoundingClientRect().top - 20;
      dispatch({ type: 'recordScroll', tabId: activeTab.id, top: reader.current.scrollTop });
      target.classList.add('search-target');
      return () => target.classList.remove('search-target');
    }
  }, [state.searchTarget, state.activeTabId, activeDocument]);

  return (
    <section class="editor-column" aria-label="主工作区">
      <div class="editor-tabs" role="tablist" aria-label="打开的文档" ref={tabStrip}>
        {state.editorTabs.map((tab) => (
          <div
            key={tab.id}
            class={`editor-tab${tab.id === state.activeTabId ? ' is-active' : ''}`}
            onAuxClick={(event) => {
              if (event.button === 1) dispatch({ type: 'closeTab', tabId: tab.id });
            }}
          >
            <button
              class="tab-select"
              role="tab"
              aria-selected={tab.id === state.activeTabId}
              title={tab.label}
              onClick={() => dispatch({ type: 'activateTab', tabId: tab.id })}
            >
              <span class="file-type">
                {tab.kind === 'document' ? 'M↓' : tab.kind === 'experiment' ? 'SQL' : 'i'}
              </span>
              <span class="tab-label">{tab.label}</span>
            </button>
            <button
              class="tab-close"
              title="关闭标签"
              aria-label={`关闭 ${tab.label}`}
              onClick={() => dispatch({ type: 'closeTab', tabId: tab.id })}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {activeTab && (
        <div class="editor-toolbar">
          <div class="breadcrumbs">
            <span>SQL 基础</span>
            <span>›</span>
            <span>
              {activeTab.kind === 'experiment'
                ? '实验'
                : activeTab.kind === 'detail'
                  ? '详情'
                  : '章节'}
            </span>
            <span>›</span>
            <strong>{activeTab.label}</strong>
          </div>
        </div>
      )}
      <article
        class="editor-reader"
        ref={reader}
        onScroll={(event) => {
          if (restoring.current || !activeTab) return;
          const element = event.currentTarget;
          const scrollable = element.scrollHeight - element.clientHeight;
          dispatch({
            type: 'recordScroll',
            tabId: activeTab.id,
            top: element.scrollTop,
            progress:
              activeTab.kind === 'document'
                ? scrollable <= 1 || element.scrollTop >= scrollable - 2
                  ? 1
                  : element.scrollTop / scrollable
                : undefined
          });
        }}
      >
        {!activeTab ? (
          <div class="empty-editor">
            <span class="empty-brand">LearnLab</span>
            <p>SQL 基础</p>
            <button
              class="link-button"
              onClick={() => dispatch({ type: 'selectChapter', chapterId: 'basics' })}
            >
              打开查询基础
            </button>
          </div>
        ) : activeTab.kind === 'document' ? (
          <ChapterContent state={state} dispatch={dispatch} />
        ) : activeTab.kind === 'experiment' ? (
          <ExperimentContent
            state={state}
            dispatch={dispatch}
            experimentId={activeTab.experimentId!}
          />
        ) : (
          <div class="reader-content">
            <h1>{activeTab.detail?.title}</h1>
            <p class="reader-lead">{activeTab.detail?.description}</p>
            <dl class="detail-properties">
              {activeTab.detail?.properties.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </article>
    </section>
  );
}

function ChapterContent({ state, dispatch }: Props) {
  const content = state.documents[state.activeChapterId];
  const currentExperiments = experiments.filter((item) => item.chapterId === state.activeChapterId);
  return (
    <div class="reader-content">
      <h1 data-search-line="1">{content.title}</h1>
      <p class="reader-lead" data-search-line="2">
        {content.description}
      </p>
      <nav class="reader-outline" aria-label="文档目录">
        {content.sections.map((section, index) => (
          <a
            key={index}
            href={`#section-${index}`}
            onClick={(event) => {
              event.preventDefault();
              event.currentTarget
                .closest('.editor-reader')
                ?.querySelector(`#section-${index}`)
                ?.scrollIntoView({ block: 'start' });
            }}
          >
            {section.title}
          </a>
        ))}
      </nav>
      {content.sections.map((section, index) => (
        <section class="markdown-section" id={`section-${index}`} key={index}>
          <h2 data-search-line={3 + index * 2}>{section.title}</h2>
          <p data-search-line={4 + index * 2}>{section.copy}</p>
          {index === 0 && (
            <CodeBlock
              code={content.code}
              lineOffset={3 + content.sections.length * 2}
              dispatch={dispatch}
            />
          )}
        </section>
      ))}
      {currentExperiments.length > 0 && (
        <section class="chapter-experiments">
          <h2>本节实验</h2>
          {currentExperiments.map((experiment) => (
            <div class="experiment-link" key={experiment.id}>
              <div>
                <strong>{experiment.title}</strong>
                <small>{experiment.duration} · SQL Runner</small>
              </div>
              <button
                class="primary-button"
                onClick={() => dispatch({ type: 'openExperiment', experimentId: experiment.id })}
              >
                打开实验
              </button>
            </div>
          ))}
        </section>
      )}
      <footer class="reader-footer">
        {content.eyebrow}
        <span>SQL 基础</span>
      </footer>
    </div>
  );
}

const tasks: Record<string, string> = {
  'select-basics': '查询所有学生的姓名和成绩，并按照成绩从高到低排序。不要修改原始数据。',
  'where-filter': '筛选成绩不低于 60 分的学生，返回学生姓名和成绩。',
  'join-report': '连接学生与课程表，返回每位学生的姓名及其课程名称。'
};

function ExperimentContent({ state, dispatch, experimentId }: Props & { experimentId: string }) {
  const experiment = experiments.find((item) => item.id === experimentId)!;
  const status = state.experimentStatus[experimentId];
  const history = state.experimentHistory.filter((item) => item.experimentId === experimentId);
  return (
    <div class="reader-content experiment-content">
      <div class="view-metadata">
        <span>{findChapter(chapters, experiment.chapterId)?.label}</span>
        <span>模拟运行 · {experiment.duration}</span>
      </div>
      <h1>{experiment.title}</h1>
      <h2>任务</h2>
      <p>{tasks[experiment.id]}</p>
      <CodeBlock code={state.documents[experiment.chapterId].code} dispatch={dispatch} />
      <div class="run-actions">
        <span class={`run-state ${status === 'passed' ? 'is-passed' : ''}`}>
          {status === 'running' ? '运行中…' : status === 'passed' ? '已通过' : '尚未运行'}
        </span>
        <button
          class="primary-button"
          disabled={status === 'running'}
          onClick={() => dispatch({ type: 'runExperiment', experimentId })}
        >
          {status === 'running' ? '正在运行' : '运行实验'}
        </button>
      </div>
      <section class="history-preview">
        <div class="panel-subheading">
          <h2>实验历史</h2>
          <button
            class="link-button"
            onClick={() => dispatch({ type: 'setBottomPanel', panel: 'history' })}
          >
            查看全部
          </button>
        </div>
        {!history.length && <p class="empty-copy">暂无本次会话的运行记录</p>}
        {history.map((item) => (
          <div class="history-item" key={item.id}>
            <span class="status-dot status-dot-green" />
            <time>{new Date(item.completedAt).toLocaleTimeString()}</time>
            <strong>通过</strong>
            <span>{item.output}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function CodeBlock({
  code,
  dispatch,
  lineOffset
}: {
  code: string;
  dispatch: Props['dispatch'];
  lineOffset?: number;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      dispatch({
        type: 'addNotification',
        notification: {
          id: 'copy',
          level: 'info',
          title: '已复制代码',
          message: '代码已写入剪贴板。'
        }
      });
    } catch {
      dispatch({
        type: 'addNotification',
        notification: {
          id: 'copy-error',
          level: 'error',
          title: '复制失败',
          message: '无法访问剪贴板，请检查浏览器权限。'
        }
      });
    }
  };
  return (
    <div class="code-block">
      <div class="code-header">
        <span>query.sql</span>
        <button class="code-copy" title="复制代码" aria-label="复制代码" onClick={copy}>
          复制
        </button>
      </div>
      <pre>
        {code.split('\n').map((line, index) => (
          <code
            key={index}
            data-search-line={lineOffset === undefined ? undefined : lineOffset + index}
          >
            <span class="line-number">{index + 1}</span>
            <span class="code-text">
              {line
                .split(/(SELECT|FROM|WHERE|ORDER BY|GROUP BY|INNER JOIN|ON|AS|DESC|ASC)/g)
                .map((part, i) =>
                  /^(SELECT|FROM|WHERE|ORDER BY|GROUP BY|INNER JOIN|ON|AS|DESC|ASC)$/.test(part) ? (
                    <span class="syntax-keyword" key={i}>
                      {part}
                    </span>
                  ) : (
                    part
                  )
                )}
            </span>
          </code>
        ))}
      </pre>
    </div>
  );
}
