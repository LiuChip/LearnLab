# LearnLab UI Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separately runnable, interactive LearnLab Workbench UI prototype with mock data and no desktop runtime coupling.

**Architecture:** A standalone Preact/Vite workspace app renders the Workbench. Pure model functions and a reducer own interaction state; focused view components render the shell and mock feature views. CSS variables implement the VS Code-inspired visual system without copying product assets.

**Tech Stack:** TypeScript, Preact, Vite, Vitest, CSS.

---

### Task 1: Standalone application and state model

**Files:**
- Create: `apps/ui-prototype/package.json`
- Create: `apps/ui-prototype/tsconfig.json`
- Create: `apps/ui-prototype/vite.config.ts`
- Create: `apps/ui-prototype/index.html`
- Create: `apps/ui-prototype/src/model/workbench.ts`
- Test: `apps/ui-prototype/src/model/workbench.test.ts`

- [x] Write tests for tab deduplication, chapter activation, panel toggling, search behavior and notifications.
- [x] Run the tests and confirm they initially fail because the model is absent.
- [x] Implement typed mock-domain models, initial state and reducer actions.
- [x] Run the focused tests and confirm they pass.

### Task 2: Workbench shell and feature views

**Files:**
- Create: `apps/ui-prototype/src/data/mockData.ts`
- Create: `apps/ui-prototype/src/components/Icon.tsx`
- Create: `apps/ui-prototype/src/components/ActivityBar.tsx`
- Create: `apps/ui-prototype/src/components/PrimarySidebar.tsx`
- Create: `apps/ui-prototype/src/components/EditorArea.tsx`
- Create: `apps/ui-prototype/src/components/AuxiliarySidebar.tsx`
- Create: `apps/ui-prototype/src/components/BottomPanel.tsx`
- Create: `apps/ui-prototype/src/components/NotificationHost.tsx`
- Create: `apps/ui-prototype/src/components/Workbench.tsx`
- Create: `apps/ui-prototype/src/App.tsx`
- Create: `apps/ui-prototype/src/main.tsx`

- [x] Add mock data for all seven activity views and two editor content types.
- [x] Build the fixed Workbench regions and wire all controls to reducer actions.
- [x] Implement chapter selection/tree expansion, search options/results, experiment tabs/runs, plugin/dependency/workspace/file lists, auxiliary tabs, bottom tabs and notifications.

### Task 3: Visual system and responsive behavior

**Files:**
- Create: `apps/ui-prototype/src/styles/reset.css`
- Create: `apps/ui-prototype/src/styles/theme.css`
- Create: `apps/ui-prototype/src/styles/workbench.css`
- Create: `apps/ui-prototype/README.md`

- [x] Define dark/light theme variables, dimensions, typography and state colors.
- [x] Style dense Workbench layout, Markdown reader, code blocks, cards, terminal and notifications.
- [x] Add width/height breakpoints that hide optional regions before damaging the main reader.
- [x] Document standalone commands and prototype boundaries.

### Task 4: Verification and visual comparison

- [x] Run prototype tests, typecheck and production build.
- [x] Start the local prototype and capture a local preview screenshot.
- [x] Compare against VS Code for proportions, density, hierarchy, whitespace and interaction feedback.
- [x] Correct visible problems and repeat tests/build/screenshot.
- [x] Keep the prototype separate until the user approves merging it into `apps/desktop`.


## Verification notes

- `pnpm typecheck` passes for the workspace.
- `pnpm --filter @learnlab/ui-prototype test` passes with 7 tests.
- `pnpm --filter @learnlab/ui-prototype build` passes.
- Manual preview checks covered chapter expansion, search and replace options, experiment tab deduplication, experiment running/completion, bottom history panel, auxiliary sidebar toggle, theme toggle, and notification dismissal.
- The prototype remains mock-data-only and is intentionally not merged into `apps/desktop` until the visual direction is approved.
