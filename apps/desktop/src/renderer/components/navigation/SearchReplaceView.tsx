import type { SearchMatch, SearchOptions, SearchResult } from '@learnlab/core';

interface SearchReplaceViewProps {
  query: string;
  options: Omit<SearchOptions, 'query'>;
  results: SearchResult | null;
  searching: boolean;
  onQueryChange: (value: string) => void;
  onToggleOption: (key: 'caseSensitive' | 'wholeWord' | 'isRegex') => void;
  onSearch: () => void;
  onClear: () => void;
  onSelectMatch: (match: SearchMatch) => void;
}

export function SearchReplaceView({
  query,
  options,
  results,
  searching,
  onQueryChange,
  onToggleOption,
  onSearch,
  onClear,
  onSelectMatch
}: SearchReplaceViewProps) {
  return (
    <div class="workbench-search-view">
      <div class="workbench-search-toolbar">
        <button type="button" class="workbench-icon-button" onClick={onSearch} disabled={!query.trim() || searching} title="刷新搜索结果">↻</button>
        <button type="button" class="workbench-icon-button" onClick={onClear} disabled={!query && !results} title="清空搜索结果">≡×</button>
      </div>
      <form
        class="workbench-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <div class="workbench-search-input-row">
          <input
            value={query}
            placeholder="搜索"
            aria-label="搜索文本"
            onInput={(event) => onQueryChange(event.currentTarget.value)}
          />
          <button type="button" class="workbench-input-toggle" aria-pressed={options.caseSensitive} onClick={() => onToggleOption('caseSensitive')} title="区分大小写">Aa</button>
          <button type="button" class="workbench-input-toggle" aria-pressed={options.wholeWord} onClick={() => onToggleOption('wholeWord')} title="全字匹配">ab</button>
          <button type="button" class="workbench-input-toggle" aria-pressed={options.isRegex} onClick={() => onToggleOption('isRegex')} title="使用正则表达式">.*</button>
        </div>
        <div class="workbench-replace-row" title="替换需要受控文件写入接口，当前尚未开放">
          <input value="" placeholder="替换（尚未接入）" aria-label="替换文本" disabled />
          <button type="button" class="workbench-input-toggle" disabled title="保留大小写">AB</button>
          <button type="button" class="workbench-input-toggle" disabled title="全部替换">⇆</button>
        </div>
      </form>
      <div class="workbench-search-summary">
        {searching
          ? '正在搜索当前学习区…'
          : results
            ? results.error ?? `找到 ${results.totalMatches} 处结果，已搜索 ${results.searchedPackages} 个实验包`
            : '输入关键词后搜索当前学习区'}
      </div>
      {results?.warnings.map((warning, index) => (
        <p class="workbench-sidebar-warning" key={`${warning}-${index}`}>{warning}</p>
      ))}
      {results && !results.error && results.matches.length === 0 && (
        <p class="workbench-empty-copy">没有匹配结果。</p>
      )}
      <div class="workbench-search-results">
        {results?.matches.map((match, index) => (
          <button
            type="button"
            class="workbench-search-result"
            key={`${match.packageId}:${match.chapterId}:${match.line}:${match.column}:${index}`}
            onClick={() => onSelectMatch(match)}
          >
            <span class="workbench-search-result-title">
              <strong>{match.chapterTitle}</strong>
              <small>{match.packageName}</small>
            </span>
            <span class="workbench-search-result-preview">{match.preview}</span>
            <small>第 {match.line} 行，第 {match.column} 列</small>
          </button>
        ))}
      </div>
    </div>
  );
}
