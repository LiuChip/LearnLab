import { findInText } from '@learnlab/markdown';

interface SearchReplaceViewProps {
  query: string;
  options: { caseSensitive: boolean; wholeWord: boolean; isRegex: boolean };
  hasDocument: boolean;
  findIndex: number;
  findTotal: number;
  onQueryChange: (value: string) => void;
  onToggleOption: (key: 'caseSensitive' | 'wholeWord' | 'isRegex') => void;
  onStep: (direction: 'next' | 'previous') => void;
}

export function SearchReplaceView({
  query,
  options,
  hasDocument,
  findIndex,
  findTotal,
  onQueryChange,
  onToggleOption,
  onStep
}: SearchReplaceViewProps) {
  const trimmed = query.trim();
  // Pre-check only to surface a readable error (invalid or risky regex).
  const error = trimmed ? findInText('', { query, ...options }).error : undefined;

  let summary: string;
  if (!hasDocument) summary = '请先打开一个章节，再在当前文件中查找。';
  else if (!trimmed) summary = '输入关键词，在当前章节中查找。';
  else if (error) summary = error;
  else if (findTotal === 0) summary = '当前文件中没有匹配结果。';
  else summary = `第 ${findIndex >= 0 ? findIndex + 1 : 0} / 共 ${findTotal} 处`;

  const canStep = hasDocument && !error && findTotal > 0;

  return (
    <div class="workbench-search-view">
      <div class="workbench-search-scopes" role="radiogroup" aria-label="查找范围">
        <button type="button" role="radio" aria-checked="true" class="workbench-scope is-active">当前文件</button>
        <button type="button" role="radio" aria-checked="false" class="workbench-scope" disabled title="实验包范围暂未开放">当前实验包</button>
        <button type="button" role="radio" aria-checked="false" class="workbench-scope" disabled title="学习区范围暂未开放">当前学习区</button>
      </div>
      <form
        class="workbench-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canStep) onStep('next');
        }}
      >
        <div class="workbench-search-input-row">
          <input
            value={query}
            placeholder="在当前文件中查找"
            aria-label="查找文本"
            disabled={!hasDocument}
            onInput={(event) => onQueryChange(event.currentTarget.value)}
          />
          <button type="button" class="workbench-input-toggle" aria-pressed={options.caseSensitive} onClick={() => onToggleOption('caseSensitive')} title="区分大小写">Aa</button>
          <button type="button" class="workbench-input-toggle" aria-pressed={options.wholeWord} onClick={() => onToggleOption('wholeWord')} title="全字匹配">ab</button>
          <button type="button" class="workbench-input-toggle" aria-pressed={options.isRegex} onClick={() => onToggleOption('isRegex')} title="使用正则表达式">.*</button>
        </div>
        <div class="workbench-replace-row" title="替换需要受控文件写入接口，当前尚未开放">
          <input value="" placeholder="替换（尚未开放）" aria-label="替换文本" disabled />
        </div>
      </form>
      <div class="workbench-find-nav">
        <span class={`workbench-search-summary${error ? ' is-error' : ''}`}>{summary}</span>
        <span class="workbench-find-buttons">
          <button type="button" class="workbench-text-button" disabled={!canStep} onClick={() => onStep('previous')} title="上一个匹配">上一个</button>
          <button type="button" class="workbench-text-button" disabled={!canStep} onClick={() => onStep('next')} title="下一个匹配">下一个</button>
        </span>
      </div>
    </div>
  );
}
