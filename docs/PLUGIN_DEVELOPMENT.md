# LearnLab Plugin Development (Experimental)

> Status: experimental/internal. This document records the behavior that is
> already implemented. It is not the final plugin SDK specification.
>
> The permission capability names, plugin host protocol, UI registration
> descriptors, execution supervisor, and developer mode are not frozen yet.
> Do not build a production plugin against those unfinished parts.

## Current implementation boundary

LearnLab currently implements plugin manifest parsing, a local installed-plugin
registry, dependency resolution, and two renderer-facing query APIs. It also
includes minimal experimental context types and a pure-logic permission resolver.

It does not yet load or execute plugin code. The context types and permission
resolver are not runtime authorization mechanisms and are not a stable SDK.

`packages/plugin-sdk` is intentionally only a package placeholder at this
stage. A plugin must not assume that `window.learnlab` is available inside a
plugin process or that a plugin can call Electron, Node.js, or arbitrary host
APIs.

## Plugin directory and manifest

The current desktop registry scans one directory per plugin and looks for:

```text
<plugin-directory>/<plugin-directory-name>/manifest.yaml
```

The parser accepts this shape:

```yaml
plugin_id: org.example.tool
version: 1.0.0
author: Example Author
signature: local-development-signature
api_version: 1
activation:
  mode: package # global or package
provides:
  - example.tool
requires_plugins:
  - id: org.example.base
    version: ^1.0.0
permissions:
  read:
    - example.resource.read # Non-normative example
  write:
    - example.resource.write # Non-normative example
  execute:
    - example.resource.execute # Non-normative example
breaking_change: false
```

### Field behavior currently enforced

- `plugin_id` and `version` are required non-empty strings.
- `author` and `signature` are accepted as non-empty strings when present.
- `api_version` must be a non-negative integer when present.
- `activation.mode`, when present, must be `global` or `package`.
- `provides` must be an array of non-empty strings when present.
- `requires_plugins` must be an array of `{ id, version }` objects when
  present.
- `permissions.read`, `permissions.write`, and `permissions.execute` must be
  arrays of non-empty strings when present.
- `breaking_change` must be a boolean when present.

The current parser does not require `author`, `signature`, `api_version`,
`activation`, or `permissions`. Their eventual requiredness and exact
semantics remain design decisions. A manifest that parses successfully is not
proof that the plugin is trusted or executable.

## Loading and dependency resolution

The resolver computes a package-specific result from installed manifests and
the current package's `required_plugins` list.

1. Installed plugins with `activation.mode: global` are included for every
   package.
2. Package plugins are included only when the current package declares them,
   directly or through a plugin dependency chain.
3. Plugin dependencies are resolved recursively and loaded before their
   dependants.
4. One active version is selected for each plugin ID. Parallel versions of the
   same plugin ID are not supported by the current resolver.
5. An unrelated package plugin is not loaded merely because it is installed.
6. A missing, disabled, incompatible, or cyclic dependency produces a
   resolution issue and sets `readOnly: true` for the affected result.

The resolver supports exact versions, `*`, `latest`, `^`, `~`, and simple
space-separated comparison clauses such as `>=1.0.0 <2.0.0`. It is a small
MVP-compatible subset, not a full package-manager version grammar.

Reading Markdown remains possible when the result is read-only. The current
implementation does not start a plugin process, run an experiment, or expose
an automatic permission grant when a dependency is missing.

## Host-side query API currently exposed by preload

The following APIs are exposed to the LearnLab renderer as
`window.learnlab`. They are host application APIs, not the public plugin SDK.
They are listed here because they are currently implemented and may be useful
when testing plugin loading integration.

### Plugin queries

```ts
window.learnlab.plugins.list(): Promise<PluginManifest[]>
window.learnlab.plugins.resolveForPackage(
  packageDir: string
): Promise<PluginResolution>
```

`plugins.list()` reads valid manifests from the configured installed-plugin
directory. Invalid manifests are skipped by the current registry scan.

`plugins.resolveForPackage(packageDir)` validates that the package is inside
the trusted LearnLab package scope, loads its manifest, reads disabled plugin
settings, and returns the resolver result. It does not execute plugin code.

The relevant result types are currently:

```ts
interface PluginResolution {
  loadOrder: string[]
  active: PluginManifest[]
  issues: PluginResolutionIssue[]
  cycles: string[][]
  readOnly: boolean
}

interface PluginResolutionIssue {
  requirement: { id: string; version: string }
  availableVersions?: string[]
  reason: 'missing' | 'incompatible' | 'disabled'
}
```

### Other current host APIs

The renderer preload also exposes the following application APIs. They are
documented here for integration visibility only; they are not currently
callable by plugin code:

```ts
window.learnlab.getExamplePackageDir()
window.learnlab.loadPackage(packageDir)
window.learnlab.readChapter(packageDir, chapterFile)

window.learnlab.package.search(packageDir, options)
window.learnlab.package.searchWorkspace(workspaceDir, options)
window.learnlab.package.listChapters(packageDir)

window.learnlab.workspace.getDefaultDir()
window.learnlab.workspace.init(workspaceDir)
window.learnlab.workspace.registerPackage(workspaceDir, packageDir)
window.learnlab.workspace.unregisterPackage(workspaceDir, packageId)
window.learnlab.workspace.listPackages(workspaceDir)
window.learnlab.workspace.getPackage(workspaceDir, packageId)

window.learnlab.database.getReadingProgress(packageDir, chapterId)
window.learnlab.database.saveReadingProgress(packageDir, chapterId, contentHash, update?)
window.learnlab.database.getAllProgress(packageDir)
window.learnlab.database.recordExperimentAttempt(packageDir, attempt)
window.learnlab.database.getExperimentAttempts(packageDir, labId)

window.learnlab.config.read()
window.learnlab.config.write(config)
window.learnlab.config.exportJson(config)
window.learnlab.config.importJson(rawJson, currentConfig)
window.learnlab.config.backupInstructions()

window.learnlab.dependencies.importBundled(workspaceDir, packageId, dependencyId)
window.learnlab.dependencies.list(workspaceDir)
window.learnlab.dependencies.prerequisites(workspaceDir)
```

These APIs are protected by Electron context isolation and main-process
validation. They should not be copied into a plugin API contract. In
particular, a future plugin host must expose a smaller allowlist derived from
the plugin's effective permissions and current context.

## Permissions and scope: current boundary

The project direction uses `read`, `write`, and `execute` permission families,
and the repository now contains an experimental pure-logic
`resolvePermissions` helper. It intersects plugin declarations, the current
package request, user grants, and host capabilities; a missing package request
produces no effective permissions. This helper is not wired into a plugin host
and does not grant runtime access. Capability IDs, merge/revocation behavior,
and persistence are still not frozen. 当前 ResolvedPermissions 的 ReadonlySet 是 TypeScript 类型层只读视图，不是运行时授权隔离；真正宿主接线前必须重新设计运行时不可变/受控句柄，不要把它当成安全边界。

Until the runtime contract is frozen:

- do not treat manifest permission strings as grants;
- do not use a permission string to access arbitrary filesystem paths;
- do not assume network, process, clipboard, or external-file APIs exist;
- do not write to another package, the workspace database, or LearnLab config
  from a plugin;
- do not claim that a plugin is OS-sandboxed.

The intended default boundary is LearnLab itself plus the current experiment
package. Global activation does not grant access to every package. Developer
mode, if implemented, will be an explicit risk switch rather than a security
guarantee.

## Compatibility guidance

- Keep plugin IDs stable and use semantic-looking versions.
- Declare direct plugin requirements in the experiment package manifest.
- Declare transitive plugin requirements in the plugin manifest instead of
  duplicating them in every package.
- Mark a breaking plugin update explicitly with `breaking_change: true`.
- Treat `api_version` as a compatibility hint only; the final compatibility
  policy has not been frozen.
- Expect the current APIs and manifest details to change before the first
  stable plugin SDK release.

## Planned but not yet available

The following must not be implemented by guessing at an API from this
document:

- plugin process startup and lifecycle;
- permission prompts, grants, revocation, and persistence;
- full read/write/execute capability ID catalogues;
- full AppContext, WorkspaceContext, and PackageContext runtime objects (only the minimal readonly type boundaries have been established in core-types);
- commands, panels, context menus, status-bar contributions, and icons;
- package experiment execution and external process supervision;
- crash isolation and developer mode;
- a stable `@learnlab/plugin-sdk` entry point.

When any of these are frozen and implemented, update this document together
with the relevant design document and tests.
