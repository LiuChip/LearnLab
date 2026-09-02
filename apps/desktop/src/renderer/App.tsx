import { useEffect, useMemo, useState } from 'preact/hooks';
import { parseMarkdown, type MarkdownResult } from '@learnlab/markdown';
import './styles/base.css';
import './styles/theme.css';
import './styles/markdown.css';

export function App() {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [markdown, setMarkdown] = useState<MarkdownResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packageName, setPackageName] = useState('LearnLab');

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const examplePackage = await window.learnlab.getExamplePackageDir();
      const loaded = await window.learnlab.loadPackage(examplePackage);
      if (!loaded.ok) { if (!cancelled) setError(loaded.error.message); return; }
      if (!cancelled) setPackageName(loaded.value.manifest.name);
      const chapter = loaded.value.manifest.chapters[chapterIndex];
      if (!chapter) return;
      const source = await window.learnlab.readChapter(loaded.value.dir, chapter.file);
      if (!source.ok) { if (!cancelled) setError(source.error.message); return; }
      try { const parsed = await parseMarkdown(source.value); if (!cancelled) setMarkdown(parsed); }
      catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }
    }
    void load();
    return () => { cancelled = true; };
  }, [chapterIndex]);

  const heading = useMemo(() => markdown?.headings.find((item) => item.depth === 1)?.text ?? '欢迎使用 LearnLab', [markdown]);
  return (
    <main class="app-shell">
      <header class="app-header"><strong>{packageName}</strong><span>本地实验包阅读原型</span></header>
      {error ? <div class="error" role="alert">{error}</div> : null}
      <section class="reader-layout">
        <aside class="toc"><h2>章节</h2><button onClick={() => setChapterIndex(0)}>1. 基础查询</button><button onClick={() => setChapterIndex(1)}>2. 条件过滤</button></aside>
        <article class="reader"><h1>{heading}</h1><div dangerouslySetInnerHTML={{ __html: markdown?.html ?? '<p>正在加载示例实验包……</p>' }} /></article>
      </section>
    </main>
  );
}
