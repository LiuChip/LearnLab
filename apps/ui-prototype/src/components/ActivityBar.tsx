import type { ActivityId, WorkbenchAction, WorkbenchState } from '../model/workbench';
import { Icon } from './Icon';

const activities: Array<{ id: ActivityId; label: string; glyph: string }> = [
  { id: 'chapters', label: '章节', glyph: '▤' },
  { id: 'search', label: '搜索和替换', glyph: '⌕' },
  { id: 'experiments', label: '实验', glyph: '◇' },
  { id: 'plugins', label: '插件', glyph: '◈' },
  { id: 'dependencies', label: '依赖', glyph: '⬡' },
  { id: 'workspace', label: '学习区', glyph: '▦' },
  { id: 'explorer', label: '文件资源管理器', glyph: '☷' }
];

export function ActivityBar({ state, dispatch }: { state: WorkbenchState; dispatch: (action: WorkbenchAction) => void }) {
  return (
    <nav class="activity-bar" aria-label="功能栏">
      <div class="activity-stack">
        {activities.map((activity) => (
          <button class={`activity-button${state.activeActivity === activity.id ? ' is-active' : ''}`} type="button" key={activity.id} title={activity.label} aria-label={activity.label} onClick={() => dispatch({ type: 'setActivity', activity: activity.id })}>
            <Icon glyph={activity.glyph} active={state.activeActivity === activity.id} />
            {activity.id === 'experiments' ? <span class="activity-badge">3</span> : null}
          </button>
        ))}
      </div>
      <div class="activity-footer">
        <button class="activity-button" type="button" title="账户" aria-label="账户"><Icon glyph="◎" /></button>
        <button class="activity-button" type="button" title="设置" aria-label="设置"><Icon glyph="⚙" /></button>
      </div>
    </nav>
  );
}
