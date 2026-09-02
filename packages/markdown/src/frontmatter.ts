import { parse as yamlParse } from 'yaml';
import type { FrontMatter, FrontMatterResult } from './types';

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

export function parseFrontMatter(raw: string): FrontMatterResult {
  const match = FRONTMATTER_REGEX.exec(raw);
  if (!match) return { ok: true, value: { frontmatter: {}, content: raw } };

  try {
    const parsed = yamlParse(match[1]);
    if (parsed !== undefined && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
      return { ok: false, error: { message: 'YAML frontmatter must be a mapping/object' } };
    }
    return { ok: true, value: { frontmatter: (parsed ?? {}) as FrontMatter, content: raw.slice(match[0].length) } };
  } catch (error) {
    const cause = error as Error & { linePos?: Array<{ line: number; col: number }> };
    const position = cause.linePos?.[0];
    return { ok: false, error: { message: `YAML frontmatter parse error: ${cause.message}`, line: position?.line, column: position?.col } };
  }
}
