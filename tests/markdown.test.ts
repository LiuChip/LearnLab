import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseFrontMatter } from '../packages/markdown/src';

describe('Markdown Engine', () => {
  it('should parse frontmatter correctly', () => {
    const raw = `---\ntitle: "Hello"\n---\n# Content`;
    const result = parseFrontMatter(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.frontmatter.title).toBe('Hello');
      expect(result.value.content).toBe('# Content');
    }
  });

  it('should return empty frontmatter if none exists', () => {
    const raw = `# Just content`;
    const result = parseFrontMatter(raw);
    expect(result).toEqual({ ok: true, value: { frontmatter: {}, content: '# Just content' } });
  });

  it('should generate html and extract headings', async () => {
    const raw = `---\ntitle: "Hello"\n---\n# Chapter 1\n\nSome text.\n\n## Section 1\n\nMore text.`;
    const result = await parseMarkdown(raw);
    
    expect(result.frontmatter.title).toBe('Hello');
    expect(result.html).toContain('<h1');
    expect(result.html).toContain('Chapter 1');
    expect(result.html).toContain('<h2');
    expect(result.html).toContain('Section 1');
    
    expect(result.headings).toHaveLength(2);
    expect(result.headings[0].text).toBe('Chapter 1');
    expect(result.headings[0].depth).toBe(1);
    expect(result.headings[1].text).toBe('Section 1');
    expect(result.headings[1].depth).toBe(2);
  });

  it('should sanitize dangerous HTML', async () => {
    const raw = `# Hello\n\n<script>alert('xss')</script>`;
    const result = await parseMarkdown(raw);
    expect(result.html).not.toContain('<script>');
  });
});

it('returns a structured error for malformed frontmatter', () => {
  const result = parseFrontMatter('---\ntitle: [invalid\n---\n# Content');
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.message).toContain('YAML');
  }
});

it('extracts headings from prose but not fenced code and creates unique unicode ids', async () => {
  const result = await parseMarkdown(
    '# 基础查询\n\n```md\n# not a heading\n```\n\n# 基础查询'
  );

  expect(result.headings.map((heading) => heading.text)).toEqual(['基础查询', '基础查询']);
  expect(result.headings.map((heading) => heading.id)).toEqual(['基础查询', '基础查询-2']);
  expect(result.html).toContain('id="基础查询"');
  expect(result.html).toContain('id="基础查询-2"');
});
