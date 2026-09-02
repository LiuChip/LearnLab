import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { parseFrontMatter } from './frontmatter';
import type { HeadingEntry, MarkdownResult } from './types';

interface MdastNode { type: string; depth?: number; value?: string; children?: MdastNode[]; data?: Record<string, unknown> }

function walk(node: MdastNode, callback: (node: MdastNode) => void): void {
  callback(node);
  for (const child of node.children ?? []) walk(child, callback);
}

function textFromNode(node: MdastNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(textFromNode).join('');
}

function createSlugger() {
  const used = new Map<string, number>();
  return (text: string): string => {
    const base = text.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/[\s-]+/g, '-').replace(/^-+|-+$/g, '') || 'heading';
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

function collectHeadings(tree: MdastNode): HeadingEntry[] {
  const slug = createSlugger();
  const headings: HeadingEntry[] = [];
  walk(tree, (node) => {
    if (node.type !== 'heading' || !node.depth) return;
    const text = textFromNode(node).trim();
    const id = slug(text);
    node.data ??= {};
    const hProperties = (node.data.hProperties as Record<string, unknown> | undefined) ?? {};
    node.data.hProperties = { ...hProperties, id };
    headings.push({ id, depth: node.depth, text });
  });
  return headings;
}

export async function parseMarkdown(source: string): Promise<MarkdownResult> {
  const frontMatterResult = parseFrontMatter(source);
  if (!frontMatterResult.ok) {
    const error = new Error(frontMatterResult.error.message);
    error.name = 'MarkdownParseError';
    throw error;
  }
  const { frontmatter, content } = frontMatterResult.value;
  const parser = unified().use(remarkParse).use(remarkGfm);
  const tree = parser.parse(content) as unknown as MdastNode;
  const headings = collectHeadings(tree);
  const htmlProcessor = unified().use(remarkRehype).use(rehypeSanitize, {
    clobberPrefix: ''
  }).use(rehypeStringify);
  const transformed = await htmlProcessor.run(tree as never);
  const html = String(htmlProcessor.stringify(transformed));
  return { html, plainText: extractPlainText(content), headings, frontmatter };
}

export function extractHeadings(content: string): HeadingEntry[] {
  const processor = unified().use(remarkParse).use(remarkGfm);
  const tree = processor.parse(content) as unknown as MdastNode;
  return collectHeadings(tree);
}

export function extractPlainText(content: string): string {
  return content
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^(?:\1)\s*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .trim();
}
