import { useState } from 'preact/hooks';
import type { ExperimentMarker } from '@learnlab/markdown';
import type { PluginReadonlyStatus } from '../../utils/navigation';
import { ExperimentHistory } from './ExperimentHistory';

interface ExperimentViewProps {
  experiment: ExperimentMarker;
  readonlyStatus: PluginReadonlyStatus;
  packageDir: string;
}

type ExperimentTab = 'instructions' | 'history';

// Opening an experiment only shows it. Running and resetting are provided by the
// plugin host milestone, so those controls stay disabled and say why.
export function ExperimentView({ experiment, readonlyStatus, packageDir }: ExperimentViewProps) {
  const [shownHints, setShownHints] = useState(0);
  const [activeTab, setActiveTab] = useState<ExperimentTab>('instructions');
  const hints = experiment.hints.slice(0, shownHints);

  return (
    <article class="experiment-view" aria-label={`実験：${experiment.title}`}>
      <header>
        <h2>{experiment.title}</h2>
        <small>{experiment.type === 'auto' ? '自動判定' : '手動判定'} · {experiment.id}</small>
      </header>

      <div class="experiment-view-tabs">
        <button
          type="button"
          class={`workbench-text-button ${activeTab === 'instructions' ? 'active' : ''}`}
          onClick={() => setActiveTab('instructions')}
        >
          実験説明
        </button>
        <button
          type="button"
          class={`workbench-text-button ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          実行履歴
        </button>
      </div>

      <div class="experiment-view-content">
        {activeTab === 'instructions' && (
          <div>
            {readonlyStatus.isReadOnly && (
              <div class="reader-alert alert-warning" role="status">{readonlyStatus.reason}</div>
            )}
            <section>
              <h3>実験要件</h3>
              <p>{experiment.instruction || '作者は実験要件を記入していません。'}</p>
            </section>
            <section>
              <h3>ヒント</h3>
              {experiment.hints.length === 0 && <p>この実験にはヒントがありません。</p>}
              {hints.map((hint) => <p key={hint.level}>ヒント {hint.level}：{hint.message}</p>)}
              {shownHints < experiment.hints.length && (
                <button type="button" class="workbench-text-button" onClick={() => setShownHints(shownHints + 1)}>
                  ヒントを表示
                </button>
              )}
            </section>
            <section class="experiment-actions">
              <button type="button" class="workbench-text-button" disabled title="実験実行はプラグインホストによって提供され、まだ利用できません">実行</button>
              <button type="button" class="workbench-text-button" disabled title="実験実行はプラグインホストによって提供され、まだ利用できません">リセット</button>
              <small>実行とリセットにはプラグインホストが必要で、まだ利用できません。セクションは通常通り読むことができます。</small>
            </section>
          </div>
        )}
        {activeTab === 'history' && (
          <ExperimentHistory packageDir={packageDir} labId={experiment.id} />
        )}
      </div>
    </article>
  );
}
