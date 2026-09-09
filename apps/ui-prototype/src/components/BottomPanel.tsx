import {
  experiments,
  type BottomPanelId,
  type WorkbenchAction,
  type WorkbenchState
} from '../model/workbench';

const panels: Array<{ id: BottomPanelId; label: string }> = [
  { id: 'terminal', label: '终端' },
  { id: 'output', label: '输出' },
  { id: 'history', label: '实验历史' },
  { id: 'problems', label: '问题' }
];

export function BottomPanel({
  state,
  dispatch
}: {
  state: WorkbenchState;
  dispatch: (action: WorkbenchAction) => void;
}) {
  return (
    <section class="bottom-panel" aria-label="底部面板">
      <div class="bottom-tabs" role="tablist" aria-label="底部标签">
        {panels.map((panel) => (
          <button
            role="tab"
            aria-selected={state.bottomPanel === panel.id}
            key={panel.id}
            onClick={() => dispatch({ type: 'setBottomPanel', panel: panel.id })}
          >
            {panel.label}
          </button>
        ))}
        <span class="toolbar-spacer" />
        <button
          class="ghost-button"
          title="关闭面板"
          aria-label="关闭面板"
          onClick={() => dispatch({ type: 'toggleBottomPanel' })}
        >
          ×
        </button>
      </div>
      <div class="bottom-content">
        {state.bottomPanel === 'terminal' && (
          <div class="terminal-view">
            <div class="terminal-header">SQL Runner · 模拟终端</div>
            {state.experimentHistory.length ? (
              [...state.experimentHistory].reverse().map((run) => (
                <div key={run.id}>
                  <p>
                    <span class="terminal-prompt">learnlab $ </span>run {run.experimentId}
                  </p>
                  <p>{run.output}</p>
                </div>
              ))
            ) : (
              <p>暂无运行输出</p>
            )}
          </div>
        )}
        {state.bottomPanel === 'output' && (
          <div class="terminal-view">
            <p>[INFO] sql-intro@1.2.0 已加载</p>
            <p>[INFO] SQLite 3 就绪</p>
            {state.experimentHistory.map((run) => (
              <p key={run.id}>
                [INFO] {run.experimentId}: {run.output}
              </p>
            ))}
          </div>
        )}
        {state.bottomPanel === 'history' &&
          (state.experimentHistory.length ? (
            <table class="history-table">
              <thead>
                <tr>
                  <th>实验</th>
                  <th>状态</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {state.experimentHistory.map((run) => (
                  <tr key={run.id}>
                    <td>{experiments.find((item) => item.id === run.experimentId)?.title}</td>
                    <td class="success-label">通过</td>
                    <td>{new Date(run.completedAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p class="empty-copy">暂无本次会话的运行记录</p>
          ))}
        {state.bottomPanel === 'problems' && <p class="empty-copy">当前没有诊断信息</p>}
      </div>
    </section>
  );
}
