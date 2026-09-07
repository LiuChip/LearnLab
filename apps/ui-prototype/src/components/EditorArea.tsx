import { useMemo } from 'preact/hooks';
import type { WorkbenchAction, WorkbenchState } from '../model/workbench';
import { chapters, experiments, findChapter } from '../model/workbench';
import { chapterContent } from '../data/viewData';
import { Icon } from './Icon';

interface EditorAreaProps {
  state: WorkbenchState;
  dispatch: (action: WorkbenchAction) => void;
}

export function EditorArea({ state, dispatch }: EditorAreaProps) {
  const activeTab = state.editorTabs.find((tab) => tab.id === state.activeTabId) ?? state.editorTabs[0];
  const activeChapter = findChapter(chapters, activeTab?.chapterId ?? state.activeChapterId) ?? chapters[0];
  const content = chapterContent[activeChapter.id] ?? chapterContent.basics;
  const activeExperiment = experiments.find((experiment) => experiment.id === activeTab?.experimentId);

  return <section class="editor-column">
    <div class="editor-tabs" role="tablist" aria-label="打开的文档">
      {state.editorTabs.map((tab) => <button type="button" role="tab" aria-selected={tab.id === state.activeTabId} class={`editor-tab${tab.id === state.activeTabId ? ' is-active' : ''}`} key={tab.id} onClick={() => dispatch({ type: 'activateTab', tabId: tab.id })}><Icon glyph={tab.kind === 'experiment' ? '◇' : '▤'} /><span>{tab.label}</span>{tab.dirty ? <span class="dirty-dot" /> : null}<span class="tab-close" onClick={(event) => { event.stopPropagation(); dispatch({ type: 'closeTab', tabId: tab.id }); }}>×</span></button>)}
      <button class="new-tab" type="button" title="新建标签" aria-label="新建标签">＋</button>
    </div>
    <div class="editor-toolbar"><div class="breadcrumbs"><span>SQL 基础</span><Icon glyph="›" /><span>{content.eyebrow.split('·')[1]?.trim() ?? '章节'}</span><Icon glyph="›" /><strong>{activeExperiment?.title ?? activeChapter.documentTitle}</strong></div><div class="editor-actions"><button class="toolbar-icon" type="button" title="分屏（当前未启用）" aria-label="分屏">▥</button><button class="toolbar-icon" type="button" title="更多编辑器操作" aria-label="更多编辑器操作">···</button></div></div>
    <article class="editor-reader">
      {activeExperiment ? <ExperimentContent experiment={activeExperiment} state={state} dispatch={dispatch} /> : <ChapterContent content={content} chapter={activeChapter} dispatch={dispatch} />}
    </article>
  </section>;
}

function ChapterContent({ content, chapter, dispatch }: { content: (typeof chapterContent)[string]; chapter: ReturnType<typeof findChapter>; dispatch: (action: WorkbenchAction) => void }) {
  const completion = Math.round((chapter?.progress ?? 0) * 100);
  return <div class="reader-content">
    <div class="reader-meta"><span class="meta-chip">MARKDOWN</span><span>最近阅读 · 今天 10:24</span><span class="meta-spacer" /><span>{completion}% 已完成</span></div>
    <div class="reader-heading"><p class="eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><p class="reader-lead">{content.description}</p></div>
    <div class="reader-outline"><span>本节内容</span>{content.sections.map((section, index) => <a href={`#section-${index + 1}`} key={section.title}>0{index + 1} {section.title}</a>)}</div>
    {content.sections.map((section, index) => <section class="markdown-section" id={`section-${index + 1}`} key={section.title}><h2><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</h2><p>{section.copy}</p>{index === 0 ? <CodeBlock code={content.code} /> : <div class="reader-callout"><span class="callout-mark">i</span><div><strong>学习提示</strong><p>把鼠标移到实验标题上可以快速打开一个独立标签，不会丢失当前的阅读位置。</p></div></div>}</section>)}
    <section class="lab-card"><div class="lab-card-head"><div><span class="lab-kicker">INTERACTIVE LAB</span><h3>动手完成一次查询</h3><p>将刚才的语句复制到实验环境中，观察结果集的列和排序。</p></div><span class="lab-status"><span class="status-dot status-dot-green" />可运行</span></div><div class="lab-actions"><button class="primary-button" type="button" onClick={() => dispatch({ type: 'openExperiment', experimentId: 'select-basics' })}><Icon glyph="▶" /> 打开实验</button><span>预计用时 4 分钟</span></div></section>
    <div class="reader-footer"><span>上次阅读到 {completion}%</span><span>滚动到底部即视为完成</span></div>
  </div>;
}

function ExperimentContent({ experiment, state, dispatch }: { experiment: (typeof experiments)[number]; state: WorkbenchState; dispatch: (action: WorkbenchAction) => void }) {
  const status = state.experimentStatus[experiment.id];
  return <div class="reader-content experiment-content"><div class="reader-meta"><span class="meta-chip meta-chip-purple">EXPERIMENT</span><span>实验历史 · 3 次运行</span><span class="meta-spacer" /><span>{experiment.duration}</span></div><div class="reader-heading"><p class="eyebrow">{experiment.chapterId === 'basics' ? '第 1 章 · 查询基础' : '第 2 章 · 条件过滤'}</p><h1>{experiment.title}</h1><p class="reader-lead">在隔离的实验环境中完成任务，系统会保留本次运行的输出、错误和通过结果。</p></div><div class="experiment-task"><div class="task-number">01</div><div><h2>任务说明</h2><p>查询所有学生的姓名和成绩，并按照成绩从高到低排序。不要修改原始数据。</p></div></div><CodeBlock code={experiment.id === 'select-basics' ? 'SELECT name, score\nFROM students\nORDER BY score DESC;' : 'SELECT name, score\nFROM students\nWHERE score >= 60;'} /><div class="run-card"><div><span class={`run-state ${status === 'passed' ? 'is-passed' : status === 'running' ? 'is-running' : ''}`}>{status === 'passed' ? '✓ 已通过' : status === 'running' ? '◌ 运行中' : '○ 尚未运行'}</span><p>{status === 'passed' ? '输出与预期结果一致。你可以继续阅读下一节。' : '运行代码后，实验结果会记录到当前实验历史。'}</p></div><button class="primary-button" type="button" disabled={status === 'running'} onClick={() => dispatch({ type: 'runExperiment', experimentId: experiment.id })}><Icon glyph="▶" />{status === 'running' ? '正在运行' : '运行实验'}</button></div><div class="history-preview"><div class="panel-subheading"><strong>实验历史</strong><button class="link-button" type="button" onClick={() => dispatch({ type: 'setBottomPanel', panel: 'history' })}>在底部面板中查看</button></div><div class="history-item"><span class="status-dot status-dot-green" /><span>今天 10:18</span><strong>通过</strong><span class="meta-spacer" />4.2s</div><div class="history-item"><span class="status-dot status-dot-red" /><span>昨天 18:40</span><strong class="muted-text">失败</strong><span class="meta-spacer" />3.8s</div></div></div>;
}

function CodeBlock({ code }: { code: string }) {
  const lines = code.split('\n');
  return <div class="code-block"><div class="code-header"><span><span class="code-dot red" /><span class="code-dot yellow" /><span class="code-dot green" /></span><span>query.sql</span><span class="meta-spacer" /><button class="code-copy" type="button" title="复制代码" aria-label="复制代码">□</button></div><pre>{lines.map((line, index) => <code key={`${line}-${index}`}><span class="line-number">{String(index + 1).padStart(2, '0')}</span><span class="code-text">{highlightSql(line)}</span>{'\n'}</code>)}</pre></div>;
}

function highlightSql(line: string) {
  const parts = line.split(/(SELECT|FROM|WHERE|ORDER BY|GROUP BY|INNER JOIN|ON|AS|DESC|ASC)/g);
  return parts.map((part, index) => /^(SELECT|FROM|WHERE|ORDER BY|GROUP BY|INNER JOIN|ON|AS|DESC|ASC)$/.test(part) ? <span class="syntax-keyword" key={`${part}-${index}`}>{part}</span> : part);
}
