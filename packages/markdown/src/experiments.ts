// Experiment markers are ordinary fenced code blocks tagged `lab`, so a generic
// Markdown editor still shows them as readable text. Parsing is Node-free and
// failure-isolated: a broken block yields one error and never blocks the chapter.
import { parse as parseYaml } from 'yaml';

export interface ExperimentHint {
  level: number;
  message: string;
}

export interface ExperimentMarker {
  id: string;
  title: string;
  type: 'auto' | 'manual';
  /** Plugin experiment type, e.g. "query", "io-match". Required for auto-judged experiments. */
  experimentType?: string;
  requestedRead?: string[];
  instruction: string;
  hints: ExperimentHint[];
  line: number;
}

export interface ExperimentParseError {
  line: number;
  message: string;
}

export interface ExperimentParseResult {
  experiments: ExperimentMarker[];
  errors: ExperimentParseError[];
}

const OPEN_FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)\s*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toMarker(raw: unknown, line: number): ExperimentMarker | string {
  if (!isRecord(raw)) return '实验块必须是 YAML 键值对';
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id || /[\\/\0]/.test(id) || id === '.' || id === '..') return '实验缺少合法的 id（不能含路径分隔符）';
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : id;
  const type = raw.type === undefined ? 'manual' : raw.type;
  if (type !== 'auto' && type !== 'manual') return `实验 ${id} 的 type 只能是 auto 或 manual`;
  const instruction = typeof raw.instruction === 'string' ? raw.instruction.trim() : '';
  const experimentType = typeof raw.experiment_type === 'string' && raw.experiment_type.trim()
    ? raw.experiment_type.trim()
    : undefined;
  const permissions = raw.permissions;
  if (permissions !== undefined && (
    !isRecord(permissions) ||
    (permissions.read !== undefined &&
      (!Array.isArray(permissions.read) || permissions.read.some((item) => typeof item !== 'string')))
  )) return `实验 ${id} 的 permissions.read 必须是字符串列表`;
  const requestedRead = isRecord(permissions) ? permissions.read as string[] | undefined : undefined;
  const hints: ExperimentHint[] = [];
  if (raw.hints !== undefined) {
    if (!Array.isArray(raw.hints)) return `实验 ${id} 的 hints 必须是列表`;
    raw.hints.forEach((hint, index) => {
      if (typeof hint === 'string') hints.push({ level: index + 1, message: hint });
      else if (isRecord(hint) && typeof hint.message === 'string') {
        hints.push({ level: typeof hint.level === 'number' ? hint.level : index + 1, message: hint.message });
      }
    });
  }
  return { id, title, type, experimentType, instruction, hints, line, ...(requestedRead && { requestedRead }) };
}

export function parseExperimentMarkers(markdown: string): ExperimentParseResult {
  const lines = markdown.split(/\r?\n/);
  const experiments: ExperimentMarker[] = [];
  const errors: ExperimentParseError[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    const open = OPEN_FENCE.exec(lines[i]);
    if (!open) continue;
    const [, , fence, info] = open;
    const body: string[] = [];
    let j = i + 1;
    let closed = false;
    for (; j < lines.length; j += 1) {
      const close = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).exec(lines[j]);
      if (close) { closed = true; break; }
      body.push(lines[j]);
    }
    // Skip the whole fenced block so a `lab` example inside another block is not parsed.
    const startLine = i + 1;
    i = closed ? j : lines.length;
    if (info !== 'lab') continue;
    if (!closed) {
      errors.push({ line: startLine, message: '实验块没有结束围栏' });
      continue;
    }
    let raw: unknown;
    try {
      raw = parseYaml(body.join('\n'));
    } catch (cause) {
      errors.push({ line: startLine, message: `实验块 YAML 无效：${cause instanceof Error ? cause.message : String(cause)}` });
      continue;
    }
    const marker = toMarker(raw, startLine);
    if (typeof marker === 'string') {
      errors.push({ line: startLine, message: marker });
    } else if (seen.has(marker.id)) {
      errors.push({ line: startLine, message: `实验 id 重复：${marker.id}（已忽略后一个）` });
    } else {
      seen.add(marker.id);
      experiments.push(marker);
    }
  }
  return { experiments, errors };
}
