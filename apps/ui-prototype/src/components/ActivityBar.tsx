import type { ActivityId, WorkbenchAction, WorkbenchState } from '../model/workbench';
import { Icon } from './Icon';

const activities: Array<{ id: ActivityId; label: string; glyph: string }> = [
  { id: 'chapters', label: '章节', glyph: '章' },
  { id: 'search', label: '搜索和替换', glyph: '搜' },
  { id: 'experiments', label: '实验', glyph: '验' },
  { id: 'plugins', label: '插件', glyph: '插' },
  { id: 'dependencies', label: '依赖', glyph: '依' },
  { id: 'workspace', label: '学习区', glyph: '包' },
  { id: 'explorer', label: '文件资源管理器', glyph: '文' }
];

export function ActivityBar({
  state,
  dispatch
}: {
  state: WorkbenchState;
  dispatch: (action: WorkbenchAction) => void;
}) {
  return (
    <nav class="activity-bar" aria-label="功能栏">
      <div class="activity-stack">
        {activities.map((activity) => (
          <button
            class={`activity-button${state.primaryVisible && state.activeActivity === activity.id ? ' is-active' : ''}`}
            type="button"
            key={activity.id}
            title={activity.label}
            aria-label={activity.label}
            aria-pressed={state.primaryVisible && state.activeActivity === activity.id}
            onClick={() => {
              if (window.innerWidth < 600 && state.auxiliaryVisible)
                dispatch({ type: 'toggleAuxiliary' });
              dispatch({ type: 'setActivity', activity: activity.id });
            }}
          >
            <Icon glyph={activity.glyph} active={state.activeActivity === activity.id} />
          </button>
        ))}
      </div>
      <div class="activity-footer">
        <button
          class="activity-button"
          type="button"
          title="设置（尚未接入）"
          aria-label="设置"
          disabled
        >
          <Icon glyph="设" />
        </button>
      </div>
    </nav>
  );
}
