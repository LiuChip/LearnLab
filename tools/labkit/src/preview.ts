import { loadPackage, readChapter } from '@learnlab/core';
import { parseMarkdown } from '@learnlab/markdown';

export interface PackagePreview {
  id: string;
  name: string;
  version: string;
  chapters: Array<{ id: string; title: string; file: string; headings: string[] }>;
}

export async function previewPackage(packageDir: string) {
  const loaded = await loadPackage(packageDir);
  if (!loaded.ok) return loaded;
  const chapters: PackagePreview['chapters'] = [];
  for (const chapter of loaded.value.manifest.chapters) {
    const source = await readChapter(packageDir, chapter.file);
    if (!source.ok) return source;
    const parsed = await parseMarkdown(source.value);
    chapters.push({ id: chapter.id, title: chapter.title, file: chapter.file, headings: parsed.headings.map((heading) => heading.text) });
  }
  return { ok: true as const, value: { id: loaded.value.manifest.id, name: loaded.value.manifest.name, version: loaded.value.manifest.version, chapters } };
}
