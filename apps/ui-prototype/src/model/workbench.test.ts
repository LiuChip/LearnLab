import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  findSearchMatches,
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

describe('findSearchMatches', () => {
  const documents: SearchDocument[] = [
    {
      id: 'doc-1',
      label: '1.1 基础查询.md',
      lines: ['SELECT name FROM students;', 'select score from students;', 'SELECTED is not SELECT.']
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
