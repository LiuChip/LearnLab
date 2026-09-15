export interface EditorTab {
	id: string;
	title: string;
	kind: 'chapter';
	packageId: string;
	chapterId: string;
}

export interface EditorTabsState {
	tabs: EditorTab[];
	activeTabId: string | null;
}

export function createEditorTabsState(): EditorTabsState {
	return { tabs: [], activeTabId: null };
}

export function createChapterTabId(packageId: string, chapterId: string): string {
	return `chapter:${encodeURIComponent(packageId)}:${encodeURIComponent(chapterId)}`;
}

export function openEditorTab(state: EditorTabsState, tab: EditorTab): EditorTabsState {
	if (state.tabs.some((existingTab) => existingTab.id === tab.id)) {
		return { tabs: state.tabs, activeTabId: tab.id };
	}

	return { tabs: [...state.tabs, tab], activeTabId: tab.id };
}

export function activateEditorTab(state: EditorTabsState, tabId: string): EditorTabsState {
	if (!state.tabs.some((tab) => tab.id === tabId)) {
		return state;
	}

	return { tabs: state.tabs, activeTabId: tabId };
}

export function closeEditorTab(state: EditorTabsState, tabId: string): EditorTabsState {
	const closedIndex = state.tabs.findIndex((tab) => tab.id === tabId);
	if (closedIndex === -1) {
		return state;
	}

	const tabs = state.tabs.filter((tab) => tab.id !== tabId);
	if (state.activeTabId !== tabId) {
		return { tabs, activeTabId: state.activeTabId };
	}

	const nextTab = tabs[closedIndex] ?? tabs[closedIndex - 1];
	return { tabs, activeTabId: nextTab?.id ?? null };
}
