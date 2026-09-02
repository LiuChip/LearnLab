import type { ChapterEntry, ExternalPrerequisite, PackageManifest, PluginRequirement, RuntimeDependency } from './manifest';

export interface ValidationError {
  path: string;
  message: string;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, path: string, errors: ValidationError[], required = true): string | undefined {
  if (value === undefined || value === null) {
    if (required) errors.push({ path, message: `Missing required field: ${path}` });
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push({ path, message: `${path} must be a non-empty string` });
    return undefined;
  }
  return value;
}

function readBoolean(value: unknown, path: string, errors: ValidationError[], required = true): boolean | undefined {
  if (value === undefined || value === null) {
    if (required) errors.push({ path, message: `Missing required field: ${path}` });
    return undefined;
  }
  if (typeof value !== 'boolean') errors.push({ path, message: `${path} must be a boolean` });
  return typeof value === 'boolean' ? value : undefined;
}

function validatePluginRequirement(value: unknown, path: string, errors: ValidationError[]): PluginRequirement | undefined {
  if (!isRecord(value)) {
    errors.push({ path, message: 'plugin requirement must be an object' });
    return undefined;
  }
  const id = readString(value.id, `${path}.id`, errors);
  const version = readString(value.version, `${path}.version`, errors);
  return id && version ? { id, version } : undefined;
}

function validateChapter(value: unknown, path: string, errors: ValidationError[]): ChapterEntry | undefined {
  if (!isRecord(value)) {
    errors.push({ path, message: 'chapter must be an object' });
    return undefined;
  }
  const id = readString(value.id, `${path}.id`, errors);
  const title = readString(value.title, `${path}.title`, errors);
  const file = readString(value.file, `${path}.file`, errors);
  return id && title && file ? { id, title, file } : undefined;
}

function validateRuntimeDependency(value: unknown, path: string, errors: ValidationError[]): RuntimeDependency | undefined {
  if (!isRecord(value)) {
    errors.push({ path, message: 'runtime dependency must be an object' });
    return undefined;
  }
  const id = readString(value.id, `${path}.id`, errors);
  const version = readString(value.version, `${path}.version`, errors);
  const provider = readString(value.provider, `${path}.provider`, errors);
  let source: RuntimeDependency['source'] = value.source as RuntimeDependency['source'] | undefined;
  if (source !== undefined && source !== 'repository' && source !== 'bundled' && source !== 'either') {
    errors.push({ path: `${path}.source`, message: 'source must be repository, bundled, or either' });
    source = undefined;
  }
  let bundled_artifact: RuntimeDependency['bundled_artifact'];
  if (value.bundled_artifact !== undefined) {
    if (!isRecord(value.bundled_artifact)) {
      errors.push({ path: `${path}.bundled_artifact`, message: 'bundled_artifact must be an object' });
    } else {
      const artifactPath = readString(value.bundled_artifact.path, `${path}.bundled_artifact.path`, errors);
      const sha256 = readString(value.bundled_artifact.sha256, `${path}.bundled_artifact.sha256`, errors);
      if (artifactPath && sha256) bundled_artifact = { path: artifactPath, sha256 };
    }
  }
  if (!id || !version || !provider) return undefined;
  return { id, version, provider, ...(source ? { source } : {}), ...(bundled_artifact ? { bundled_artifact } : {}) };
}

function validateExternalPrerequisite(value: unknown, path: string, errors: ValidationError[]): ExternalPrerequisite | undefined {
  if (!isRecord(value)) {
    errors.push({ path, message: 'external prerequisite must be an object' });
    return undefined;
  }
  const id = readString(value.id, `${path}.id`, errors);
  const version = readString(value.version, `${path}.version`, errors);
  const required = readBoolean(value.required, `${path}.required`, errors);
  let detect: ExternalPrerequisite['detect'] = value.detect as ExternalPrerequisite['detect'] | undefined;
  if (detect !== undefined && detect !== 'plugin' && detect !== 'manual') {
    errors.push({ path: `${path}.detect`, message: 'detect must be plugin or manual' });
    detect = undefined;
  }
  const reason = value.reason === undefined ? undefined : readString(value.reason, `${path}.reason`, errors, false);
  return id && version && required !== undefined ? { id, version, required, ...(reason ? { reason } : {}), ...(detect ? { detect } : {}) } : undefined;
}

export function validateManifest(raw: unknown): Result<PackageManifest, ValidationError[]> {
  const errors: ValidationError[] = [];
  if (!isRecord(raw)) return { ok: false, error: [{ path: '', message: 'Manifest must be an object' }] };

  const id = readString(raw.id, 'id', errors);
  const version = readString(raw.version, 'version', errors);
  const name = readString(raw.name, 'name', errors);
  const author = readString(raw.author, 'author', errors);
  const description = raw.description === undefined ? undefined : readString(raw.description, 'description', errors, false);
  const license = raw.license === undefined ? undefined : readString(raw.license, 'license', errors, false);

  const chapters: ChapterEntry[] = [];
  if (!Array.isArray(raw.chapters)) {
    errors.push({ path: 'chapters', message: 'chapters must be an array' });
  } else {
    raw.chapters.forEach((chapter, index) => {
      const parsed = validateChapter(chapter, `chapters[${index}]`, errors);
      if (parsed) chapters.push(parsed);
    });
  }

  const required_plugins: PluginRequirement[] = [];
  if (raw.required_plugins !== undefined) {
    if (!Array.isArray(raw.required_plugins)) errors.push({ path: 'required_plugins', message: 'required_plugins must be an array' });
    else raw.required_plugins.forEach((item, index) => {
      const parsed = validatePluginRequirement(item, `required_plugins[${index}]`, errors);
      if (parsed) required_plugins.push(parsed);
    });
  }

  const runtime_dependencies: RuntimeDependency[] = [];
  if (raw.runtime_dependencies !== undefined) {
    if (!Array.isArray(raw.runtime_dependencies)) errors.push({ path: 'runtime_dependencies', message: 'runtime_dependencies must be an array' });
    else raw.runtime_dependencies.forEach((item, index) => {
      const parsed = validateRuntimeDependency(item, `runtime_dependencies[${index}]`, errors);
      if (parsed) runtime_dependencies.push(parsed);
    });
  }

  const external_prerequisites: ExternalPrerequisite[] = [];
  if (raw.external_prerequisites !== undefined) {
    if (!Array.isArray(raw.external_prerequisites)) errors.push({ path: 'external_prerequisites', message: 'external_prerequisites must be an array' });
    else raw.external_prerequisites.forEach((item, index) => {
      const parsed = validateExternalPrerequisite(item, `external_prerequisites[${index}]`, errors);
      if (parsed) external_prerequisites.push(parsed);
    });
  }

  if (errors.length || !id || !version || !name || !author) return { ok: false, error: errors };
  return {
    ok: true,
    value: {
      id, version, name, author, chapters,
      ...(description ? { description } : {}),
      ...(license ? { license } : {}),
      ...(required_plugins.length ? { required_plugins } : {}),
      ...(runtime_dependencies.length ? { runtime_dependencies } : {}),
      ...(external_prerequisites.length ? { external_prerequisites } : {})
    }
  };
}
