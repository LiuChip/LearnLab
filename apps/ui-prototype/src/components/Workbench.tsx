import { useEffect, useReducer } from 'preact/hooks';
import { createInitialState, workbenchReducer, type WorkbenchAction } from '../model/workbench';
import { Icon } from './Icon';
import { ActivityBar } from './ActivityBar';
import { PrimarySidebar } from './PrimarySidebar';
import { EditorArea } from './EditorArea';
import { AuxiliarySidebar } from './AuxiliarySidebar';
import { BottomPanel } from './BottomPanel';
import { NotificationHost } from './NotificationHost';

export function Workbench() {
  const [state, dispatch] = useReducer(workbenchReducer, undefined, createInitialState);
  const send = (action: WorkbenchAction) => dispatch(action);

  useEffect(() => {
    const running = Object.entries(state.experimentStatus).find(([, status]) => status === 'running');
    if (!running) return;
    const timer = window.setTimeout(() => {
      send({ type: 'markExperimentPassed', experimentId: running[0] });
      send({ type: 'addNotification', notification: { id: `run-${running[0]}`, level: 'info', title: '实验运行完成', message: '输出结果已写入实验历史。' } });
      send({ type: 'setBottomPanel', panel: 'history' });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [state.experimentStatus]);

  useEffect(() => {
    const timers = state.notifications.filter((notification) => notification.progress).map((notification) => window.setTimeout(() => send({ type: 'dismissNotification', notificationId: notification.id }), 8000));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [state.notifications]);

  return <main class={`prototype-window theme-${state.theme}`}>
    <div class="menubar"><div class="product-name"><span class="product-mark">L</span><strong>LearnLab</strong></div><div class="menu-items"><button type="button">文件</button><button type="button">编辑</button><button type="button">选择</button><button type="button">查看</button><button type="button">转到</button><button type="button">运行</button><button type="button">窗口</button><button type="button">帮助</button></div><div class="menubar-spacer" /><span class="window-context">SQL 基础 · LearnLab</span><button class="window-button" type="button" title="最小化" aria-label="最小化">—</button><button class="window-button" type="button" title="最大化" aria-label="最大化">□</button><button class="window-button close-button" type="button" title="关闭" aria-label="关闭">×</button></div>
    <header class="command-bar"><div class="navigation-buttons"><button type="button" title="后退" aria-label="后退">‹</button><button type="button" title="前进" aria-label="前进">›</button></div><button class="context-crumb" type="button"><span class="crumb-home">▰</span><span>SQL 基础</span><Icon glyph="›" /><span class="crumb-muted">sql-intro@1.2.0</span><Icon glyph="⌄" /></button><button class="command-center" type="button"><Icon glyph="⌕" /><span>搜索命令、文件或实验…</span><kbd>⌘ K</kbd></button><div class="command-actions"><button type="button" title={state.auxiliaryVisible ? '关闭辅助栏' : '打开辅助栏'} aria-label={state.auxiliaryVisible ? '关闭辅助栏' : '打开辅助栏'} onClick={() => send({ type: 'toggleAuxiliary' })}><Icon glyph="▯" /></button><button type="button" title="切换主题" aria-label="切换主题" onClick={() => send({ type: 'setTheme', theme: state.theme === 'dark' ? 'light' : 'dark' })}><Icon glyph={state.theme === 'dark' ? '☼' : '☾'} /></button><button type="button" title="布局" aria-label="布局"><Icon glyph="⊞" /></button></div></header>
    <div class="workbench-body"><ActivityBar state={state} dispatch={send} /><PrimarySidebar state={state} dispatch={send} /><div class="center-column"><EditorArea state={state} dispatch={send} />{state.bottomPanelVisible ? <BottomPanel state={state} dispatch={send} /> : null}</div>{state.auxiliaryVisible ? <AuxiliarySidebar state={state} dispatch={send} /> : null}</div>
    <footer class="status-bar"><div class="status-left"><button type="button" class="status-item" onClick={() => send({ type: 'setActivity', activity: 'chapters' })}><span class="status-dot status-dot-blue" />阅读进度 62%</button><span class="status-item"><Icon glyph="◈" />已加载插件 3</span></div><div class="status-center"><span class="status-item status-plugin-item">SQL Runner <span class="status-dot status-dot-green" /></span><span class="status-item status-plugin-item">实验环境就绪</span></div><div class="status-right"><button type="button" class="status-item status-message" onClick={() => send({ type: 'setBottomPanel', panel: 'output' })}><span class="status-dot status-dot-warning" />{state.unreadMessages} 条未预览消息</button><button type="button" class="status-item" onClick={() => send({ type: 'toggleBottomPanel' })}><Icon glyph="≡" /></button><span class="status-item">UTF-8</span></div></footer>
    <NotificationHost state={state} dispatch={send} />
  </main>;
}
