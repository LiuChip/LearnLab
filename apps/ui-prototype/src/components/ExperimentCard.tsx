import type { Experiment, WorkbenchAction } from '../model/workbench';

export function ExperimentCard({
  experiment,
  description,
  dispatch
}: {
  experiment: Experiment;
  description: string;
  dispatch: (action: WorkbenchAction) => void;
}) {
  return (
    <section class="experiment-card" aria-label={experiment.title}>
      <header>
        <small>实验 · SQL Runner</small>
        <h2>{experiment.title}</h2>
      </header>
      <div class="experiment-card-content">
        <h3>实验内容</h3>
        <p>{description}</p>
      </div>
      <footer>
        <span>{experiment.duration}</span>
        <button
          class="primary-button"
          type="button"
          onClick={() => dispatch({ type: 'openExperiment', experimentId: experiment.id })}
        >
          打开实验
        </button>
      </footer>
    </section>
  );
}
