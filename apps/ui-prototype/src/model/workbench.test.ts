import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  findSearchMatches,
  getSearchDocuments,
  replaceSearchText,
  workbenchReducer,
  type SearchDocument
} from './workbench';

describe('workbenchReducer', () => {
  it('opens an experiment once and activates its existing tab on repeated requests', () => {
    const initial = createInitialState();
    const opened = workbenchReducer(initial, {
      type: 'openExperiment',
      experimentId: 'select-basics'
    });
    const repeated = workbenchReducer(opened, {
      type: 'openExperiment',
      experimentId: 'select-basics'
    });

    expect(opened.editorTabs).toHaveLength(initial.editorTabs.length + 1);
    expect(repeated.editorTabs).toHaveLength(opened.editorTabs.length);
    expect(repeated.activeTabId).toBe('experiment:select-basics');
  });

  it('activates a chapter and opens its document tab without duplicating tabs', () => {
    const initial = createInitialState();
    const selected = workbenchReducer(initial, { type: 'selectChapter', chapterId: 'filtering' });
    const repeated = workbenchReducer(selected, { type: 'selectChapter', chapterId: 'filtering' });

    expect(selected.activeChapterId).toBe('filtering');
    expect(selected.activeTabId).toBe('chapter:filtering');
    expect(repeated.editorTabs.filter((tab) => tab.id === 'chapter:filtering')).toHaveLength(1);
  });

  it('toggles optional workbench regions independently', () => {
    const initial = createInitialState();
    const auxiliaryHidden = workbenchReducer(initial, { type: 'toggleAuxiliary' });
    const panelOpened = workbenchReducer(auxiliaryHidden, { type: 'toggleBottomPanel' });

    expect(auxiliaryHidden.auxiliaryVisible).toBe(false);
    expect(panelOpened.bottomPanelVisible).toBe(true);
    expect(panelOpened.auxiliaryVisible).toBe(false);
  });

  it('toggles replacement case preservation independently from search options', () => {
    const initial = createInitialState();
    const toggled = workbenchReducer(initial, { type: 'toggleReplacePreserveCase' });

    expect(initial.replacePreserveCase).toBe(false);
    expect(toggled.replacePreserveCase).toBe(true);
    expect(toggled.searchOptions).toEqual(initial.searchOptions);
  });

  it('opens the notification center without changing the bottom panel', () => {
    const initial = createInitialState();
    const opened = workbenchReducer(initial, { type: 'toggleNotificationCenter' });
    const closed = workbenchReducer(opened, { type: 'toggleNotificationCenter' });

    expect(opened.notificationCenterVisible).toBe(true);
    expect(opened.unreadMessages).toBe(0);
    expect(opened.bottomPanel).toBe(initial.bottomPanel);
    expect(opened.bottomPanelVisible).toBe(initial.bottomPanelVisible);
    expect(closed.notificationCenterVisible).toBe(false);
  });

  it('uses notification level to determine auto-dismiss behavior', () => {
    const initial = createInitialState();
    const info = { id: 'info', level: 'info' as const, title: '信息', message: '会自动消失' };
    const warning = {
      id: 'warning',
      level: 'warning' as const,
      title: '警告',
      message: '不会自动消失'
    };
    const withInfo = workbenchReducer(initial, { type: 'addNotification', notification: info });
    const withWarning = workbenchReducer(withInfo, {
      type: 'addNotification',
      notification: warning
    });

    expect(withInfo.notifications.at(-1)?.level).toBe('info');
    expect(withWarning.notifications.at(-1)?.level).toBe('warning');
  });

  it('dismisses notifications without mutating the previous state', () => {
    const initial = createInitialState();
    const dismissed = workbenchReducer(initial, {
      type: 'dismissNotification',
      notificationId: 'package-ready'
    });

    expect(initial.notifications.some((item) => item.id === 'package-ready')).toBe(true);
    expect(dismissed.notifications.some((item) => item.id === 'package-ready')).toBe(false);
  });
});

describe('workbench regressions', () => {
  it('synchronizes chapter context on tab activation and close, including an empty editor', () => {
    let state = createInitialState();
    state = workbenchReducer(state, { type: 'selectChapter', chapterId: 'filtering' });
    state = workbenchReducer(state, { type: 'activateTab', tabId: 'chapter:basics' });
    expect(state.activeChapterId).toBe('basics');
    state = workbenchReducer(state, { type: 'closeTab', tabId: 'chapter:basics' });
    expect(state.activeChapterId).toBe('filtering');
    state = workbenchReducer(state, { type: 'closeTab', tabId: 'chapter:filtering' });
    expect(state.editorTabs).toEqual([]);
    expect(state.activeTabId).toBe('');
    expect(state.activeChapterId).toBe('');
  });

  it('uses the experiment chapter and never changes reading progress when running', () => {
    let state = workbenchReducer(createInitialState(), {
      type: 'openExperiment',
      experimentId: 'join-report'
    });
    expect(state.activeChapterId).toBe('joins');
    const original = state.readingProgress;
    state = workbenchReducer(state, { type: 'runExperiment', experimentId: 'join-report' });
    state = workbenchReducer(state, {
      type: 'markExperimentPassed',
      experimentId: 'join-report',
      completedAt: 123
    });
    expect(state.readingProgress).toEqual(original);
    expect(state.experimentHistory).toMatchObject([
      { experimentId: 'join-report', completedAt: 123 }
    ]);
    const repeated = workbenchReducer(state, {
      type: 'markExperimentPassed',
      experimentId: 'join-report'
    });
    expect(repeated).toBe(state);
  });

  it('records independent scroll positions and monotonically increasing reading progress', () => {
    let state = createInitialState();
    state = workbenchReducer(state, {
      type: 'recordScroll',
      tabId: 'chapter:basics',
      top: 500,
      progress: 1
    });
    state = workbenchReducer(state, {
      type: 'recordScroll',
      tabId: 'chapter:basics',
      top: 0,
      progress: 0
    });
    expect(state.readingProgress.basics).toBe(1);
    expect(state.scrollPositions['chapter:basics']).toBe(0);
  });

  it('keeps expired info in the notification center and does not lose unread messages', () => {
    let state = createInitialState();
    state = workbenchReducer(state, {
      type: 'expireNotification',
      notificationId: 'package-ready'
    });
    expect(state.notifications[0].toastVisible).toBe(false);
    expect(state.unreadMessages).toBe(2);
    state = workbenchReducer(state, { type: 'toggleNotificationCenter' });
    expect(state.unreadMessages).toBe(0);
    expect(state.notifications.every((item) => item.read && !item.toastVisible)).toBe(true);
    state = workbenchReducer(state, { type: 'toggleNotificationCenter' });
    state = workbenchReducer(state, { type: 'refreshSearch' });
    expect(state.unreadMessages).toBe(1);
    state = workbenchReducer(state, {
      type: 'dismissNotification',
      notificationId: 'runtime-warning'
    });
    expect(state.unreadMessages).toBe(1);
    state = workbenchReducer(state, { type: 'dismissNotification', notificationId: 'absent' });
    expect(state.unreadMessages).toBe(1);
  });

  it('gives repeated notifications unique keys and keeps existing creation times', () => {
    const state = createInitialState();
    const refreshed = workbenchReducer(workbenchReducer(state, { type: 'refreshSearch' }), {
      type: 'refreshSearch'
    });
    expect(new Set(refreshed.notifications.map((item) => item.id)).size).toBe(
      refreshed.notifications.length
    );
    expect(refreshed.notifications[0].createdAt).toBe(state.notifications[0].createdAt);
    expect(refreshed.unreadMessages).toBe(4);
  });

  it('searches and replaces displayed text with a one-step undo', () => {
    const initial = createInitialState();
    let state = workbenchReducer(initial, { type: 'setSearchQuery', query: 'SELECT' });
    state = workbenchReducer(state, { type: 'openSearchMatch', chapterId: 'basics', line: 1 });
    state = workbenchReducer(state, { type: 'setReplaceQuery', query: 'FETCH' });
    const replaced = workbenchReducer(state, { type: 'replaceAll' });
    expect(replaced.documents.basics.code).toContain('FETCH');
    expect(replaced.documents.basics.title).toContain('FETCH');
    expect(initial.documents.basics.code).toContain('SELECT');
    expect(
      findSearchMatches(getSearchDocuments(replaced.documents), 'SELECT', state.searchOptions)
    ).toHaveLength(0);
    const undone = workbenchReducer(replaced, { type: 'undoReplace' });
    expect(undone.documents).toEqual(initial.documents);
    expect(undone.replacementUndo).toBeNull();
    const nextMatch = workbenchReducer(undone, {
      type: 'openSearchMatch',
      chapterId: 'basics',
      line: 3
    });
    expect(nextMatch.searchTarget!.request).toBeGreaterThan(state.searchTarget!.request);
  });

  it('blocks replacement of invalid patterns and counts occurrences, not matching lines', () => {
    const options = { caseSensitive: false, wholeWord: false, regularExpression: true };
    const matches = findSearchMatches(
      [{ id: 'a', label: 'a', lines: ['SELECT SELECT'] }],
      'SELECT',
      options
    );
    expect(matches[0].count).toBe(2);
    const initial = { ...createInitialState(), searchQuery: '[', searchOptions: options };
    expect(workbenchReducer(initial, { type: 'replaceAll' })).toBe(initial);
  });

  it('resets only changed documents and restores their reading state when undoing', () => {
    let state = createInitialState();
    state = workbenchReducer(state, {
      type: 'recordScroll',
      tabId: 'chapter:basics',
      top: 150,
      progress: 0.8
    });
    const before = state;
    state = workbenchReducer(state, {
      type: 'setSearchQuery',
      query: state.documents.basics.title
    });
    state = workbenchReducer(state, { type: 'setReplaceQuery', query: 'New title' });
    state = workbenchReducer(state, { type: 'replaceAll' });
    expect(state.readingProgress.basics).toBe(0);
    expect(state.scrollPositions['chapter:basics']).toBe(0);
    expect(state.documents.filtering).toBe(before.documents.filtering);
    expect(state.readingProgress.filtering).toBe(before.readingProgress.filtering);
    state = workbenchReducer(state, { type: 'selectChapter', chapterId: 'filtering' });
    state = workbenchReducer(state, {
      type: 'recordScroll',
      tabId: 'chapter:filtering',
      top: 80,
      progress: 0.9
    });
    state = workbenchReducer(state, { type: 'undoReplace' });
    expect(state.documents.basics).toEqual(before.documents.basics);
    expect(state.readingProgress.basics).toBe(0.8);
    expect(state.scrollPositions['chapter:basics']).toBe(150);
    expect(state.readingProgress.filtering).toBe(0.9);
    expect(state.scrollPositions['chapter:filtering']).toBe(80);
  });

  it('does not reset reading state or create undo history for an identical replacement', () => {
    let state = createInitialState();
    state = workbenchReducer(state, {
      type: 'setSearchQuery',
      query: state.documents.basics.title
    });
    state = workbenchReducer(state, {
      type: 'setReplaceQuery',
      query: state.documents.basics.title
    });
    expect(workbenchReducer(state, { type: 'replaceAll' })).toBe(state);
  });

  it('retains the assistant draft when switching and hiding auxiliary views', () => {
    let state = workbenchReducer(createInitialState(), {
      type: 'setAssistantDraft',
      value: 'SQL question'
    });
    state = workbenchReducer(state, { type: 'setAuxiliaryTab', tab: 'context' });
    state = workbenchReducer(state, { type: 'toggleAuxiliary' });
    state = workbenchReducer(state, { type: 'setAuxiliaryTab', tab: 'assistant' });
    expect(state.assistantDraft).toBe('SQL question');
  });

  it('supports unicode whole words together with regex and preserves replacement case', () => {
    const options = { caseSensitive: false, wholeWord: true, regularExpression: true };
    const matches = findSearchMatches(
      [{ id: 'a', label: 'a', lines: ['查询 查询条件', 'SELECT SELECTED'] }],
      '查询|SELECT',
      options
    );
    expect(matches.map((item) => item.count)).toEqual([1, 1]);
    expect(replaceSearchText('SELECT Select select', 'select', 'query', options, true)).toBe(
      'QUERY Query query'
    );
    expect(
      replaceSearchText(
        'name score',
        '(name) (score)',
        '$2 $1',
        { ...options, wholeWord: false },
        false
      )
    ).toBe('score name');
    expect(
      replaceSearchText('ABC def', '(abc) (def)', '$2 $1', { ...options, wholeWord: false }, true)
    ).toBe('def ABC');
    expect(
      replaceSearchText('abc', 'abc', '$&', { ...options, regularExpression: false }, false)
    ).toBe('$&');
  });
});

describe('findSearchMatches', () => {
  const documents: SearchDocument[] = [
    {
      id: 'doc-1',
      label: '1.1 基础查询.md',
      lines: [
        'SELECT name FROM students;',
        'select score from students;',
        'SELECTED is not SELECT.'
      ]
    }
  ];

  it('supports case-sensitive whole-word searching', () => {
    const matches = findSearchMatches(documents, 'SELECT', {
      caseSensitive: true,
      wholeWord: true,
      regularExpression: false
    });

    expect(matches.map((match) => match.line)).toEqual([1, 3]);
  });

  it('returns a validation error for an invalid regular expression', () => {
    const matches = findSearchMatches(documents, '[', {
      caseSensitive: false,
      wholeWord: false,
      regularExpression: true
    });

    expect(matches).toHaveLength(0);
    expect(matches.error).toContain('正则表达式');
  });
});
