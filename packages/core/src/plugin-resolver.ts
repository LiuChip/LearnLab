import type {
  PluginManifest,
  PluginRequirement,
  PluginResolution,
  PluginResolutionInput
} from '@learnlab/core-types';

interface Version {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(value: string): Version | null {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/.exec(value.trim());
  return match
    ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0) }
    : null;
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
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
      ? requested.major > 0
        ? { major: requested.major + 1, minor: 0, patch: 0 }
        : requested.minor > 0
          ? { major: 0, minor: requested.minor + 1, patch: 0 }
          : { major: 0, minor: 0, patch: requested.patch + 1 }
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
      case '>=':
        return result >= 0;
      case '<=':
        return result <= 0;
      case '>':
        return result > 0;
      case '<':
        return result < 0;
      default:
        return result === 0;
    }
  });
}

export function resolvePlugins(input: PluginResolutionInput): PluginResolution {
  const disabled = new Set(input.disabledPluginIds ?? []);
  const byId = new Map<string, PluginManifest[]>();
  for (const plugin of input.installedPlugins) {
    const list = byId.get(plugin.plugin_id) ?? [];
    list.push(plugin);
    byId.set(plugin.plugin_id, list);
  }
  for (const list of byId.values()) list.sort((a, b) => compareVersions(b.version, a.version));

  const roots: PluginRequirement[] = [
    ...input.installedPlugins
      .filter((plugin) => plugin.activation?.mode === 'global')
      .map((plugin) => ({ id: plugin.plugin_id, version: plugin.version })),
    ...(input.packageRequirements ?? [])
  ];

  function addRequirement(
    requirements: Map<string, PluginRequirement[]>,
    requirement: PluginRequirement
  ): boolean {
    const list = requirements.get(requirement.id) ?? [];
    if (list.some((item) => item.version === requirement.version)) return false;
    list.push(requirement);
    requirements.set(requirement.id, list);
    return true;
  }

  function choose(
    requirements: Map<string, PluginRequirement[]>,
    id: string
  ): PluginManifest | undefined {
    const constraints = requirements.get(id) ?? [];
    return byId
      .get(id)
      ?.find((plugin) =>
        constraints.every((constraint) => satisfies(plugin.version, constraint.version))
      );
  }

  function sameSelection(
    left: Map<string, PluginManifest>,
    right: Map<string, PluginManifest>
  ): boolean {
    if (left.size !== right.size) return false;
    for (const [id, plugin] of left) {
      if (right.get(id)?.version !== plugin.version) return false;
    }
    return true;
  }

  // Resolve constraints to a fixed point. Requirements can be introduced by
  // transitive dependencies, so a single depth-first pass can select a version
  // before a later branch contributes a tighter constraint. Re-running from
  // the roots removes requirements from superseded versions and converges to a
  // selection whose dependency graph is internally consistent.
  let previousSelection = new Map<string, PluginManifest>();
  let selected = new Map<string, PluginManifest>();
  const maxPasses = Math.max(8, input.installedPlugins.length * 4 + roots.length * 2);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const requirements = new Map<string, PluginRequirement[]>();
    for (const root of roots) addRequirement(requirements, root);

    const queue = roots.map((root) => root.id);
    const queued = new Set(queue);
    const processed = new Set<string>();
    const passSelection = new Map<string, PluginManifest>();

    while (queue.length > 0) {
      const id = queue.shift()!;
      queued.delete(id);
      const plugin = choose(requirements, id);
      if (!plugin) continue;

      const previous = passSelection.get(id);
      if (previous?.version === plugin.version && processed.has(id)) continue;
      passSelection.set(id, plugin);
      processed.add(id);

      for (const dependency of plugin.requires_plugins ?? []) {
        const added = addRequirement(requirements, dependency);
        if (added || !processed.has(dependency.id)) {
          if (!queued.has(dependency.id)) {
            queue.push(dependency.id);
            queued.add(dependency.id);
          }
        }
      }
    }

    selected = passSelection;
    if (sameSelection(previousSelection, selected)) break;
    previousSelection = selected;
  }

  const issues: PluginResolution['issues'] = [];
  const issueKeys = new Set<string>();
  const addIssue = (requirement: PluginRequirement): void => {
    const candidates = byId.get(requirement.id) ?? [];
    const reason = disabled.has(requirement.id)
      ? 'disabled'
      : candidates.length > 0
        ? 'incompatible'
        : 'missing';
    const key = `${requirement.id}\u0000${requirement.version}\u0000${reason}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push({
      requirement,
      availableVersions: candidates.map((plugin) => plugin.version),
      reason
    });
  };

  // Rebuild the final requirement closure from the stabilized selection. This
  // is also the authoritative validation pass for dependency constraints.
  const validationRequirements = new Map<string, PluginRequirement[]>();
  const validationQueue = roots.map((root) => root.id);
  const validationQueued = new Set(validationQueue);
  for (const root of roots) addRequirement(validationRequirements, root);
  while (validationQueue.length > 0) {
    const id = validationQueue.shift()!;
    validationQueued.delete(id);
    const plugin = selected.get(id);
    for (const requirement of validationRequirements.get(id) ?? []) {
      if (
        disabled.has(requirement.id) ||
        !selected.get(requirement.id) ||
        !satisfies(selected.get(requirement.id)!.version, requirement.version)
      ) {
        addIssue(requirement);
      }
    }
    if (!plugin) continue;
    for (const dependency of plugin.requires_plugins ?? []) {
      const added = addRequirement(validationRequirements, dependency);
      if (added && !validationQueued.has(dependency.id)) {
        validationQueue.push(dependency.id);
        validationQueued.add(dependency.id);
      }
    }
  }

  // Keep the dependency-first order and report cycles against the selected
  // graph. A cycle is a graph property, not a version-resolution failure.
  const cycles: string[][] = [];
  const loadOrder: string[] = [];
  const visiting: string[] = [];
  const visited = new Set<string>();
  function visit(id: string): void {
    const cycleIndex = visiting.indexOf(id);
    if (cycleIndex >= 0) {
      cycles.push([...visiting.slice(cycleIndex), id]);
      return;
    }
    if (visited.has(id)) return;
    const plugin = selected.get(id);
    if (!plugin || disabled.has(id)) return;

    visiting.push(id);
    for (const dependency of plugin.requires_plugins ?? []) {
      const dependencyPlugin = selected.get(dependency.id);
      if (dependencyPlugin && satisfies(dependencyPlugin.version, dependency.version)) {
        visit(dependency.id);
      }
    }
    visiting.pop();
    visited.add(id);
    loadOrder.push(id);
  }

  for (const root of roots) visit(root.id);
  const active = loadOrder
    .map((id) => selected.get(id))
    .filter((plugin): plugin is PluginManifest => Boolean(plugin));
  return {
    loadOrder,
    active,
    issues,
    cycles,
    readOnly: issues.length > 0 || cycles.length > 0
  };
}

export { satisfies as satisfiesPluginVersion };
