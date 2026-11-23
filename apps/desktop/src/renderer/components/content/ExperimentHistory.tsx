import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ExperimentAttemptDetail } from '@learnlab/core';

type HistoryFilter = 'all' | 'success' | 'failed';

interface ExperimentHistoryProps {
  packageDir: string;
  labId: string;
}

export function ExperimentHistory({ packageDir, labId }: ExperimentHistoryProps) {
  const [attempts, setAttempts] = useState<ExperimentAttemptDetail[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void window.learnlab.database.getExperimentAttempts(packageDir, labId)
      .then((data) => {
        if (!cancelled) {
          setAttempts(data);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [packageDir, labId]);

  const filtered = attempts.filter((attempt) => {
    if (filter === 'all') return true;
    if (filter === 'success') return attempt.status === 'passed';
    if (filter === 'failed') return attempt.status === 'failed';
    return true;
  });

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((current) => current === id ? null : id);
  }, []);

  if (loading) return <div class="experiment-history"><p>加载历史记录中...</p></div>;

  if (error) return (
    <div class="experiment-history">
      <p class="reader-alert alert-warning">加载历史记录失败：{error}</p>
    </div>
  );

  if (attempts.length === 0) return (
    <div class="experiment-history">
      <p class="workbench-empty-copy">这个实验还没有执行记录。</p>
    </div>
  );

  return (
    <div class="experiment-history">
      <div class="experiment-history-filters">
        {(['all', 'success', 'failed'] as const).map((f) => (
          <button
            key={f}
            type="button"
            class={`workbench-text-button ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' && `查看全部 (${attempts.length})`}
            {f === 'success' && `只看成功 (${attempts.filter((a) => a.status === 'passed').length})`}
            {f === 'failed' && `只看失败 (${attempts.filter((a) => a.status === 'failed').length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p class="workbench-empty-copy">没有匹配的记录。</p>
      ) : (
        <div class="experiment-history-list">
          {filtered.map((attempt) => (
            <div key={attempt.attemptId} class="experiment-history-item">
              <div
                class="experiment-history-header"
                onClick={() => toggleExpanded(attempt.attemptId)}
                role="button"
                tabindex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    toggleExpanded(attempt.attemptId);
                  }
                }}
              >
                <span class={`attempt-status attempt-${attempt.status}`}>
                  {attempt.status === 'passed' ? '✓ 成功' : attempt.status === 'failed' ? '✗ 失败' : '⟳ 运行中'}
                </span>
                <span class="attempt-timestamp">{new Date(attempt.timestamp).toLocaleString('zh-CN')}</span>
                {attempt.durationMs && <span class="attempt-duration">{(attempt.durationMs / 1000).toFixed(1)}s</span>}
                <span class="attempt-toggle">{expandedId === attempt.attemptId ? '▼' : '▶'}</span>
              </div>

              {expandedId === attempt.attemptId && (
                <div class="experiment-history-details">
                  {attempt.error && (
                    <section>
                      <h5>错误</h5>
                      <pre><code>{attempt.error}</code></pre>
                    </section>
                  )}

                  {attempt.steps && attempt.steps.length > 0 && (
                    <section>
                      <h5>步骤</h5>
                      <ul class="attempt-steps">
                        {attempt.steps.map((step, idx) => (
                          <li key={idx} class={`step-${step.status}`}>
                            <span class="step-status">
                              {step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : '–'}
                            </span>
                            <span class="step-name">{step.name}</span>
                            {step.message && <span class="step-message">{step.message}</span>}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {attempt.output && (
                    <section>
                      <h5>输出</h5>
                      <pre><code>{attempt.output}</code></pre>
                    </section>
                  )}

                  {attempt.input && (
                    <section>
                      <h5>输入</h5>
                      <pre><code>{attempt.input}</code></pre>
                    </section>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
