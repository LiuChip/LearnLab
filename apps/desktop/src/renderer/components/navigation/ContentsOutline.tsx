import type { HeadingEntry } from '@learnlab/markdown';

interface ContentsOutlineProps {
  headings: HeadingEntry[];
  onJumpToHeading: (headingId: string) => void;
}

export function ContentsOutline({
  headings,
  onJumpToHeading
}: ContentsOutlineProps) {
  if (headings.length === 0) {
    return (
      <div class="contents-outline empty-outline">
        <h3>章节大纲</h3>
        <p class="empty-outline-text">本章暂无标题大纲</p>
      </div>
    );
  }

  return (
    <nav class="contents-outline" aria-label="本章大纲">
      <h3>本章大纲</h3>
      <ul class="outline-list" role="list">
        {headings.map((heading) => (
          <li
            key={heading.id}
            class={`outline-item depth-${heading.depth}`}
            style={{ paddingLeft: `${Math.max(0, (heading.depth - 1) * 12)}px` }}
          >
            <button
              type="button"
              class="outline-button"
              onClick={() => onJumpToHeading(heading.id)}
              title={heading.text}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
