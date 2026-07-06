# Excel Scenario Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import hierarchical XLSX scenario sheets and support optional three-level scenario headings in the manual editor, preview, and DOCX.

**Architecture:** Add a backward-compatible `headingPath` to scenario rows, centralize tree/numbering helpers, and parse XLSX files in a browser-only utility using JSZip. Keep the main editor focused by moving worksheet selection and import preview into a small dialog component, while recursive hierarchy rendering remains in the appendix feature.

**Tech Stack:** Next.js 16 client components, React 19, TypeScript, JSZip, dnd-kit, Playwright, docx.

---

### Task 1: Define hierarchy behavior

**Files:**
- Modify: `src/types/memo.ts`
- Create: `src/utils/scenarioHierarchy.ts`
- Modify: `src/templates/bcaMemoTemplate.ts`
- Test: `e2e/memo-builder.spec.ts`

- [ ] **Step 1: Write failing compatibility and manual hierarchy tests** that import legacy rows, add Subbagian/Sub-subbagian through contextual buttons, and assert labels `A`, `A.1`, and `A.1.1` appear.
- [ ] **Step 2: Run the focused Playwright tests** with `npx playwright test e2e/memo-builder.spec.ts --grep "optional scenario hierarchy"`; expect failure because hierarchy controls do not exist.
- [ ] **Step 3: Add `ScenarioHeading`, `headingPath`, path normalization, tree building, flattening, and automatic sibling labels** while retaining legacy `section` fields.
- [ ] **Step 4: Run the focused tests again** and expect all hierarchy assertions to pass.

### Task 2: Parse and preview XLSX imports

**Files:**
- Create: `src/utils/importScenarioWorkbook.ts`
- Create: `src/features/memo-builder/ScenarioImportDialog.tsx`
- Modify: `src/features/memo-builder/MemoBuilderApp.tsx`
- Test: `e2e/memo-builder.spec.ts`

- [ ] **Step 1: Write a failing XLSX import test** using a JSZip-built workbook with a hidden sheet, active visible sheet, repeated headers, merged dates, and `A`, `A.1`, `A.1.1` headings.
- [ ] **Step 2: Run the focused test** with `npx playwright test e2e/memo-builder.spec.ts --grep "XLSX scenario import"`; expect failure because `.xlsx` is not accepted.
- [ ] **Step 3: Implement workbook relationship/shared-string/style/merge parsing and automatic header mapping**, returning visible-sheet summaries and scenario rows without mutating the draft.
- [ ] **Step 4: Add the compact preview dialog** with automatic active-sheet selection, sheet selector, counts, Cancel, and Import actions.
- [ ] **Step 5: Run the focused import tests** and expect placeholder replacement, append behavior, hierarchy recognition, and sheet selection to pass.

### Task 3: Render and reorder every hierarchy level

**Files:**
- Modify: `src/features/memo-builder/MemoBuilderApp.tsx`
- Modify: `src/pagination/paginate.ts`
- Modify: `src/preview/MemoPreview.tsx`
- Modify: `src/docx/generateDocx.ts`
- Test: `e2e/memo-builder.spec.ts`

- [ ] **Step 1: Write failing preview/DOCX tests** asserting hierarchical heading rows and automatic labels before their scenario rows.
- [ ] **Step 2: Run the focused tests** with `npx playwright test e2e/memo-builder.spec.ts --grep "hierarchical scenario output"`; expect missing nested headings.
- [ ] **Step 3: Render recursive editor nodes with compact contextual actions and existing accessible drag handles**, updating all descendant row paths on moves.
- [ ] **Step 4: Emit `headingRows` metadata during pagination and render each row in preview and DOCX**, resetting scenario numbering within the immediate parent.
- [ ] **Step 5: Run focused and existing appendix tests** and repair compatibility regressions without changing unrelated layouts.

### Task 4: Verify and publish

**Files:**
- Modify only files from Tasks 1-3 plus the two design documents.

- [ ] **Step 1: Run `npm run lint`** and require exit code 0.
- [ ] **Step 2: Run `npm run build`** and require exit code 0.
- [ ] **Step 3: Run `npm run test:e2e`** and require zero failures.
- [ ] **Step 4: Inspect `git diff --check` and `git status --short`**, excluding unrelated pre-existing untracked files.
- [ ] **Step 5: Commit only intended files, push `main`, wait for Cloudflare Pages, and smoke-test `https://generate-memo.pages.dev/`**, including the new import and manual hierarchy controls.

