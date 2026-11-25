import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ExperimentMarker } from '@learnlab/markdown';
import type { PluginManifest } from '@learnlab/core-types';
import type { PluginReadonlyStatus } from '../../utils/navigation';
import { ExperimentHistory } from './ExperimentHistory';

interface ExperimentViewProps {
  experiment: ExperimentMarker;
  readonlyStatus: PluginReadonlyStatus;
  packageDir: string;
  activePlugins: PluginManifest[];
  chapterId: string;
  canStartExecution: () => boolean;
}

type ExperimentTab = 'instructions' | 'history';
type RunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'cancelled' | 'timeout';

function findPluginForExperiment(
  plugins: PluginManifest[],
  experimentType: string | undefined
): PluginManifest | undefined {
  if (!experimentType) return undefined;
  return plugins.find(
    (p) => Array.isArray(p.provides) && p.provides.includes(experimentType)
  );
}

export function ExperimentView({
  experiment,
  readonlyStatus,
  packageDir,
  activePlugins,
  chapterId,
  canStartExecution
}: ExperimentViewProps) {
  const [shownHints, setShownHints] = useState(0);
  const [activeTab, setActiveTab] = useState<ExperimentTab>('instructions');
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const executionIdRef = useRef<string | null>(null);

  const hints = experiment.hints.slice(0, shownHints);

  const plugin = findPluginForExperiment(activePlugins, experiment.experimentType);
  const canRun = !readonlyStatus.isReadOnly && !!plugin && experiment.type === 'auto';

  useLayoutEffect(() => {
    const removeOutput = window.learnlab.execution.onOutput((_evt, data) => {
      if (data.executionId !== executionIdRef.current) return;
      setOutputLines((prev) => [...prev, data.text]);
    });

    const removeComplete = window.learnlab.execution.onComplete((_evt, data) => {
      if (data.executionId !== executionIdRef.current) return;
      setRunStatus(data.status);
      setReason(data.reason ?? null);
      executionIdRef.current = null;
      // Bump history key to force ExperimentHistory to reload
      setHistoryKey((k) => k + 1);
    });

    return () => {
      removeOutput();
      removeComplete();
    };
  }, []);

  const handleRun = useCallback(async () => {
    if (!canRun || !plugin || executionIdRef.current || !canStartExecution()) return;
    const executionId = crypto.randomUUID();
    executionIdRef.current = executionId;
    setRunStatus('running');
    setOutputLines([]);
    setReason(null);

    let error: string;
    try {
      const result = await window.learnlab.execution.start({
        executionId,
        labId: experiment.id,
        chapterId,
        pluginId: plugin.plugin_id,
        packageDir,
        experimentType: experiment.experimentType ?? '',
        timeoutMs: 30_000
      });
      if (result.ok) return;
      error = result.error.message;
    } catch {
      error = '无法启动实验，请稍后重试。';
    }
    if (executionIdRef.current === executionId) {
      setRunStatus('failed');
      setReason(error);
      executionIdRef.current = null;
    }
  }, [canRun, plugin, experiment, chapterId, packageDir, canStartExecution]);

  const handleCancel = useCallback(async () => {
    const executionId = executionIdRef.current;
    if (!executionId) return;
    try {
      await window.learnlab.execution.cancel(executionId);
    } catch {
      if (executionIdRef.current === executionId) setReason('未能确认实验进程已退出，请重试。');
    }
  }, []);

  const statusLabel: Record<RunStatus, string> = {
    idle: '',
    running: '运行中…',
    passed: '✓ 通过',
    failed: '✗ 失败',
    cancelled: '已取消',
    timeout: '超时'
  };

  const statusClass: Record<RunStatus, string> = {
    idle: '',
    running: 'run-status-running',
    passed: 'run-status-passed',
    failed: 'run-status-failed',
    cancelled: 'run-status-cancelled',
    timeout: 'run-status-timeout'
  };

  return (
    <article class="experiment-view" aria-label={`实验：${experiment.title}`}>
      <header>
        <h2>{experiment.title}</h2>
        <small>{experiment.type === 'auto' ? '自动判定' : '手动判定'} · {experiment.id}</small>
      </header>

      <div class="experiment-view-tabs">
        <button
          type="button"
          class={`workbench-text-button ${activeTab === 'instructions' ? 'active' : ''}`}
          onClick={() => setActiveTab('instructions')}
        >
          实验说明
        </button>
        <button
          type="button"
          class={`workbench-text-button ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          执行历史
        </button>
      </div>

      <div class="experiment-view-content">
        {activeTab === 'instructions' && (
          <div>
            {readonlyStatus.isReadOnly && (
              <div class="reader-alert alert-warning" role="status">{readonlyStatus.reason}</div>
            )}
            <section>
              <h3>实验要求</h3>
              <p>{experiment.instruction || '作者没有填写实验要求。'}</p>
            </section>
            <section>
              <h3>提示</h3>
              {experiment.hints.length === 0 && <p>这个实验没有提示。</p>}
              {hints.map((hint) => <p key={hint.level}>提示 {hint.level}：{hint.message}</p>)}
              {shownHints < experiment.hints.length && (
                <button
                  type="button"
                  class="workbench-text-button"
                  onClick={() => setShownHints(shownHints + 1)}
                >
                  查看提示
                </button>
              )}
            </section>
            <section class="experiment-actions">
              <button
                type="button"
                class="workbench-text-button"
                disabled={!canRun || runStatus === 'running'}
                title={
                  !plugin
                    ? `需要支持 ${experiment.experimentType ?? '此类型'} 实验的插件`
                    : readonlyStatus.isReadOnly
                    ? (readonlyStatus.reason ?? '只读模式')
                    : experiment.type === 'manual'
                    ? '手动判定实验不支持自动运行'
                    : '运行实验'
                }
                onClick={() => { void handleRun(); }}
              >
                运行
              </button>
              <button
                type="button"
                class="workbench-text-button"
                disabled={runStatus !== 'running'}
                onClick={() => { void handleCancel(); }}
              >
                取消
              </button>
              {runStatus !== 'idle' && (
                <span class={`experiment-run-status ${statusClass[runStatus]}`}>
                  {statusLabel[runStatus]}
                  {reason && <span class="run-status-reason">：{reason}</span>}
                </span>
              )}
              {!canRun && !readonlyStatus.isReadOnly && experiment.type === 'auto' && (
                <small class="experiment-run-hint">
                  {!experiment.experimentType
                    ? '实验未声明 experiment_type，无法自动匹配插件。'
                    : `需要提供 ${experiment.experimentType} 类型的插件。`}
                </small>
              )}
              {experiment.type === 'manual' && (
                <small class="experiment-run-hint">手动判定：完成后请自行标记结果。</small>
              )}
            </section>

            {outputLines.length > 0 && (
              <section class="experiment-output">
                <h3>输出</h3>
                <pre><code>{outputLines.join('')}</code></pre>
              </section>
            )}
          </div>
        )}
        {activeTab === 'history' && (
          <ExperimentHistory key={historyKey} packageDir={packageDir} labId={experiment.id} />
        )}
      </div>
    </article>
  );
}
