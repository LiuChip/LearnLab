export interface FrontMatter {
  [key: string]: unknown;
}

export interface HeadingEntry {
  id: string;
  depth: number;
  text: string;
}

export interface MarkdownResult {
  html: string;
  plainText: string;
  headings: HeadingEntry[];
  frontmatter: FrontMatter;
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

export type FrontMatterResult =
  | { ok: true; value: { frontmatter: FrontMatter; content: string } }
  | { ok: false; error: ParseError };
