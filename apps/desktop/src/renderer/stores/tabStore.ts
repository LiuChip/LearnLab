import type { ExperimentMarker } from '@learnlab/markdown';

interface EditorTabBase {
	id: string;
	title: string;
	packageId: string;
}

export interface ChapterEditorTab extends EditorTabBase {
	kind: 'chapter';
	chapterId: string;
}

// An experiment tab is keyed by package + experiment, so the same experiment
// focuses its existing tab and identical ids in different packages never collide.
export interface ExperimentEditorTab extends EditorTabBase {
	kind: 'experiment';
	chapterId: string;
	experimentId: string;
	// Snapshot taken when the tab opens, so the tab survives chapter switches.
	experiment: ExperimentMarker;
}

export type EditorTab = ChapterEditorTab | ExperimentEditorTab;

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

export function createExperimentTabId(packageId: string, experimentId: string): string {
	return `experiment:${encodeURIComponent(packageId)}:${encodeURIComponent(experimentId)}`;
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
