import { allChapters, type WorkbenchAction, type WorkbenchState } from '../model/workbench';

export function AuxiliarySidebar({
  state,
  dispatch
}: {
  state: WorkbenchState;
  dispatch: (action: WorkbenchAction) => void;
}) {
  const chapter = allChapters.find((item) => item.id === state.activeChapterId);
  return (
    <aside class="auxiliary-sidebar" aria-label="辅助视图">
      <header class="aux-heading">
        <strong>辅助视图</strong>
        <button
          class="ghost-button"
          title="关闭辅助栏"
          aria-label="关闭辅助栏"
          onClick={() => dispatch({ type: 'toggleAuxiliary' })}
        >
          ×
        </button>
      </header>
      <div class="aux-tabs" role="tablist" aria-label="辅助标签">
        {(
          [
            { id: 'assistant', label: 'AI 助手' },
            { id: 'context', label: '上下文' },
            { id: 'output', label: '输出' }
          ] as const
        ).map((tab) => (
          <button
            role="tab"
            key={tab.id}
            aria-selected={state.auxiliaryTab === tab.id}
            onClick={() => dispatch({ type: 'setAuxiliaryTab', tab: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {state.auxiliaryTab === 'assistant' && (
        <div class="aux-content assistant-view">
          <div class="assistant-context">
            <span class="file-type">M↓</span>
            <span>{chapter?.documentTitle ?? '未选择文档'}</span>
          </div>
          <div class="assistant-empty">
            <span class="assistant-placeholder">AI</span>
            <strong>AI 助手</strong>
            <p>尚未连接模型</p>
          </div>
          <div class="assistant-composer">
            <textarea
              aria-label="向 AI 助手提问"
              placeholder="输入问题…"
              value={state.assistantDraft}
              onInput={(event) =>
                dispatch({ type: 'setAssistantDraft', value: event.currentTarget.value })
              }
            />
            <div class="composer-footer">
              <span>未连接</span>
              <button class="send-button" title="尚未连接模型" aria-label="发送" disabled>
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
      {state.auxiliaryTab === 'context' && (
        <div class="aux-content">
          <h3>当前文档</h3>
          <p>{chapter?.documentTitle ?? '无'}</p>
          <dl class="context-list">
            <div>
              <dt>实验包</dt>
              <dd>SQL 基础</dd>
            </div>
            <div>
              <dt>版本</dt>
              <dd>1.2.0</dd>
            </div>
            <div>
              <dt>已加载插件</dt>
              <dd>3</dd>
            </div>
            <div>
              <dt>阅读进度</dt>
              <dd>{chapter ? `${Math.round(state.readingProgress[chapter.id] * 100)}%` : '—'}</dd>
            </div>
          </dl>
        </div>
      )}
      {state.auxiliaryTab === 'output' && (
        <div class="aux-content output-view">
          <p class="log-line">[INFO] 当前实验包：sql-intro@1.2.0</p>
          <p class="log-line">[INFO] 当前文档：{chapter?.id ?? '无'}</p>
          {state.experimentHistory.map((run) => (
            <p class="log-line" key={run.id}>
              [INFO] {run.experimentId}: {run.output}
            </p>
          ))}
        </div>
      )}
    </aside>
  );
}
