# LearnLab Foundation and Non-UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复当前工程与安全问题，并完成 Plan.md 中低耦合、非 UI 的基础能力，使后续 UI 和高耦合模块可以建立在可测试的核心之上。

**Architecture:** 保持 `packages/core-types` 为无运行时依赖的契约层，`packages/markdown` 负责 Markdown 解析，`packages/core` 负责纯逻辑和实验包只读加载，Electron 主进程只做 IPC 适配。所有文件路径统一经过核心的目录归属检查；插件执行、数据库、网络下载和真实实验环境不在本次范围内。

**Tech Stack:** TypeScript, pnpm workspace, Vitest, ESLint 9, Electron/Vite existing scaffold, unified/remark, YAML.

---

### Task 1: Repair workspace and type-check/lint gates

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `eslint.config.mjs`
- Modify: `tsconfig.base.json`
- Create: `apps/desktop/tsconfig.json`
- Modify: `packages/core-types/tsconfig.json`
- Modify: `packages/markdown/tsconfig.json`
- Modify: `packages/core/tsconfig.json`

- [ ] Add the missing `typescript-eslint` dependency and a root `typecheck` script.
- [ ] Include `plugins/*` and `tools/*` in the workspace.
- [ ] Remove the malformed build-approval text and retain one valid build policy.
- [ ] Make project references either valid composite projects or remove them; use the simpler valid configuration for this MVP.
- [ ] Add a desktop TypeScript configuration covering main, preload, and renderer sources.
- [ ] Run `pnpm install --lockfile-only`, `pnpm typecheck`, and `pnpm lint`.

### Task 2: Add failing regression tests for safe paths and malformed front matter

**Files:**
- Modify: `tests/package-loader.test.ts`
- Modify: `tests/markdown.test.ts`
- Create: `tests/package-loader.integration.test.ts`

- [ ] Test the sibling-prefix bypass (`../chapters-evil/secret.md`).
- [ ] Test absolute paths, dot paths, and platform-independent relative containment.
- [ ] Test that symlinked chapters outside the package are rejected.
- [ ] Test malformed YAML front matter returns a structured error rather than silently discarding metadata.
- [ ] Run the focused tests and verify the new tests fail before implementation.

### Task 3: Implement robust package path resolution and package loading

**Files:**
- Modify: `packages/core/src/package-paths.ts`
- Modify: `packages/core/src/package-loader.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`

- [ ] Replace string-prefix containment with `path.relative` boundary checks.
- [ ] Resolve package/chapter paths consistently from one core helper.
- [ ] Reject symlink escapes for package chapter files.
- [ ] Make IPC reject unsafe chapter paths and avoid bypassing core checks.
- [ ] Keep IPC responses structured and avoid exposing arbitrary package paths where possible within the current MVP.
- [ ] Add actual `loadPackage` and chapter-read tests.

### Task 4: Strengthen manifest validation and Markdown error/heading handling

**Files:**
- Modify: `packages/core-types/src/validator.ts`
- Modify: `packages/core-types/src/manifest.ts`
- Modify: `packages/markdown/src/types.ts`
- Modify: `packages/markdown/src/frontmatter.ts`
- Modify: `packages/markdown/src/engine.ts`
- Modify: `tests/manifest-validator.test.ts`
- Modify: `tests/markdown.test.ts`

- [ ] Validate nested plugin, managed dependency, and external prerequisite entries.
- [ ] Reject invalid enum values and empty required strings.
- [ ] Return structured Front Matter parse errors.
- [ ] Extract headings from Markdown AST rather than a regex that sees fenced code as headings.
- [ ] Generate stable unique heading IDs, including Unicode headings.
- [ ] Preserve existing XSS sanitization behavior.

### Task 5: Implement pure plugin dependency resolution

**Files:**
- Create: `packages/core/src/version-range.ts`
- Modify: `packages/core/src/dependency-graph.ts`
- Modify: `packages/core/src/plugin-resolver.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `tests/plugin-resolver.test.ts`
- Create: `tests/version-range.test.ts`
- Create: `tests/dependency-graph.test.ts`

- [ ] Implement the minimal version constraints needed by the design (`*`, exact, `>=`, `^`, `~`, and simple space-separated bounds).
- [ ] Compute global plugins plus package direct and transitive dependencies.
- [ ] Report missing, disabled, incompatible, blocked, conflict, and cycle states.
- [ ] Keep the resolver pure and independent from Electron, filesystem, database, and process execution.
- [ ] Export the resolver only after tests define its behavior.

### Task 6: Implement dependency identity and settings JSON primitives

**Files:**
- Modify: `packages/core-types/src/adapter.ts`
- Modify: `packages/core-types/src/config.ts`
- Create: `packages/core/src/dependency-fingerprint.ts`
- Create: `packages/core/src/dependency-paths.ts`
- Create: `packages/core/src/config-store.ts`
- Modify: `packages/core/src/index.ts`
- Create: `tests/dependency-fingerprint.test.ts`
- Create: `tests/dependency-paths.test.ts`
- Create: `tests/config-store.test.ts`

- [ ] Define stable dependency identity from ID, version, platform, arch, and SHA-256.
- [ ] Generate the workspace `dependencies/` path without network or installation side effects.
- [ ] Support atomic JSON writes, default values, and malformed-config errors.
- [ ] Keep plugin settings under a namespaced configuration object.

### Task 7: Implement LabKit read-only validation/preview primitives

**Files:**
- Modify: `tools/labkit/package.json`
- Modify: `tools/labkit/tsconfig.json`
- Modify: `tools/labkit/src/manifest.ts`
- Modify: `tools/labkit/src/validator.ts`
- Modify: `tools/labkit/src/preview.ts`
- Modify: `tools/labkit/src/index.ts`
- Create: `tests/labkit.test.ts`

- [ ] Make LabKit inspect/validate a thin wrapper around core manifest/package loading.
- [ ] Preview package metadata and chapter summaries without running experiments.
- [ ] Keep pack/network/signing operations out of this change.

### Task 8: Verify and update the local plan

**Files:**
- Modify: `Plan.md` (ignored local file)

- [ ] Run the full verification commands: `pnpm typecheck`, `pnpm lint`, `pnpm test:run`, `pnpm build`.
- [ ] Re-check all security regression tests.
- [ ] Mark only actually completed tasks in Plan.md.
- [ ] Record remaining UI, plugin host, database, execution, and network work as pending.
