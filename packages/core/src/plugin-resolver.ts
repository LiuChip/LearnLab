import type { PluginManifest, PluginRequirement, PluginResolution, PluginResolutionInput } from '@learnlab/core-types';

interface Version { major: number; minor: number; patch: number }

function parseVersion(value: string): Version | null {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/.exec(value.trim());
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0) } : null;
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left); const b = parseVersion(right);
  if (!a || !b) return left.localeCompare(right);
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function satisfies(version: string, range: string): boolean {
  if (!range || range.trim() === '*' || range.trim() === 'latest') return true;
  const actual = parseVersion(version);
  if (!actual) return version === range;
  const expression = range.trim();
  if (/^\d+\.\d+(?:\.\d+)?$/.test(expression)) {
    const requested = parseVersion(expression)!;
    return compare(actual, requested) === 0;
  }
  if (expression.startsWith('^') || expression.startsWith('~')) {
    const requested = parseVersion(expression.slice(1));
    if (!requested) return false;
    const upper = expression.startsWith('^')
      ? (requested.major > 0 ? { major: requested.major + 1, minor: 0, patch: 0 } : requested.minor > 0 ? { major: 0, minor: requested.minor + 1, patch: 0 } : { major: 0, minor: 0, patch: requested.patch + 1 })
      : { major: requested.major, minor: requested.minor + 1, patch: 0 };
    return compare(actual, requested) >= 0 && compare(actual, upper) < 0;
  }
  const clauses = expression.split(/\s+/).filter(Boolean);
  return clauses.every((clause) => {
    const match = /^(>=|<=|>|<|=)?\s*(\d+\.\d+(?:\.\d+)?)$/.exec(clause);
    if (!match) return false;
    const expected = parseVersion(match[2])!;
    const result = compare(actual, expected);
    switch (match[1] ?? '=') {
      case '>=': return result >= 0;
      case '<=': return result <= 0;
      case '>': return result > 0;
      case '<': return result < 0;
      default: return result === 0;
    }
  });
}

export function resolvePlugins(input: PluginResolutionInput): PluginResolution {
  const disabled = new Set(input.disabledPluginIds ?? []);
  const byId = new Map<string, PluginManifest[]>();
  for (const plugin of input.installedPlugins) {
    const list = byId.get(plugin.plugin_id) ?? [];
    list.push(plugin); byId.set(plugin.plugin_id, list);
  }
  for (const list of byId.values()) list.sort((a, b) => compareVersions(b.version, a.version));

  const requirements = new Map<string, PluginRequirement[]>();
  const issues: PluginResolution['issues'] = [];
  const cycles: string[][] = [];
  const loadOrder: string[] = [];
  const selected = new Map<string, PluginManifest>();
  const visiting: string[] = [];
  const visited = new Set<string>();
  const roots: PluginRequirement[] = [
    ...input.installedPlugins.filter((plugin) => plugin.activation?.mode === 'global').map((plugin) => ({ id: plugin.plugin_id, version: plugin.version })),
    ...(input.packageRequirements ?? [])
  ];

  function addRequirement(requirement: PluginRequirement): void {
    const list = requirements.get(requirement.id) ?? [];
    if (!list.some((item) => item.version === requirement.version)) list.push(requirement);
    requirements.set(requirement.id, list);
  }

  function choose(id: string): PluginManifest | undefined {
    const constraints = requirements.get(id) ?? [];
    return byId.get(id)?.find((plugin) => constraints.every((constraint) => satisfies(plugin.version, constraint.version)));
  }

  function visit(requirement: PluginRequirement): void {
    addRequirement(requirement);
    const cycleIndex = visiting.indexOf(requirement.id);
    if (cycleIndex >= 0) {
      cycles.push([...visiting.slice(cycleIndex), requirement.id]);
      return;
    }
    const pluginCandidates = byId.get(requirement.id) ?? [];
    if (disabled.has(requirement.id)) {
      issues.push({ requirement, availableVersions: pluginCandidates.map((plugin) => plugin.version), reason: 'disabled' });
      return;
    }
    const plugin = choose(requirement.id);
    if (!plugin) {
      issues.push({ requirement, availableVersions: pluginCandidates.map((item) => item.version), reason: pluginCandidates.length ? 'incompatible' : 'missing' });
      return;
    }
    selected.set(plugin.plugin_id, plugin);
    if (visited.has(plugin.plugin_id)) return;
    visiting.push(plugin.plugin_id);
    for (const dependency of plugin.requires_plugins ?? []) visit(dependency);
    visiting.pop();
    visited.add(plugin.plugin_id);
    if (!loadOrder.includes(plugin.plugin_id)) loadOrder.push(plugin.plugin_id);
  }

  for (const root of roots) visit(root);
  const active = loadOrder.map((id) => selected.get(id)).filter((plugin): plugin is PluginManifest => Boolean(plugin));
  return { loadOrder, active, issues, cycles, readOnly: issues.length > 0 || cycles.length > 0 };
}

export { satisfies as satisfiesPluginVersion };
