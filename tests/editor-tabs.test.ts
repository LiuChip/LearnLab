import { describe, expect, it } from 'vitest';
import {
	activateEditorTab,
	closeEditorTab,
	createEditorTabsState,
	createChapterTabId,
	openEditorTab,
	type EditorTab
} from '../apps/desktop/src/renderer/stores/tabStore';

const chapterOne: EditorTab = { id: 'chapter:package-a:one', title: '第一章', kind: 'chapter', packageId: 'package-a', chapterId: 'one' };
const chapterTwo: EditorTab = { id: 'chapter:package-a:two', title: '第二章', kind: 'chapter', packageId: 'package-a', chapterId: 'two' };

describe('editor tabs state', () => {
	it('scopes chapter tab IDs by package', () => {
		expect(createChapterTabId('package-a', 'intro')).not.toBe(createChapterTabId('package-b', 'intro'));
	});

	it('scopes chapter tab IDs by package', () => {
		expect(createChapterTabId('package-a', 'intro')).not.toBe(createChapterTabId('package-b', 'intro'));
	});

	it('focuses an existing tab instead of opening a duplicate', () => {
		const opened = openEditorTab(openEditorTab(createEditorTabsState(), chapterOne), chapterTwo);

		const focused = openEditorTab(opened, chapterOne);

		expect(focused.tabs).toEqual([chapterOne, chapterTwo]);
		expect(focused.activeTabId).toBe(chapterOne.id);
	});

	it('activates an adjacent tab when the active tab is closed', () => {
		const opened = openEditorTab(openEditorTab(createEditorTabsState(), chapterOne), chapterTwo);
		const activeSecond = activateEditorTab(opened, chapterTwo.id);

		expect(closeEditorTab(activeSecond, chapterTwo.id)).toEqual({
			tabs: [chapterOne],
			activeTabId: chapterOne.id
		});
	});

	it('allows closing the last tab and exposes the empty state', () => {
		const opened = openEditorTab(createEditorTabsState(), chapterOne);

		expect(closeEditorTab(opened, chapterOne.id)).toEqual({ tabs: [], activeTabId: null });
	});
});