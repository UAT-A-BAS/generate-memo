# Memo Preview, DOCX, and Scenario UX Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the memo form, preview, DOCX, and PDF conversion visually consistent while improving validation, preview navigation, range dates, and scenario hierarchy editing.

**Architecture:** Keep `paginateMemoDraft` as the shared page contract and add small shared helpers for field navigation, rich-text normalization, and stable scenario grouping. Preview and DOCX use the same wording and layout constants; the editor owns only interaction state and stable hierarchy reordering.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Tailwind CSS 4, Zustand, TipTap, docx 9, dnd-kit, Playwright.

---

### Task 1: Lock document formatting regressions

**Files:**
- Modify: `e2e/memo-builder.spec.ts`
- Modify: `src/utils/formatRecipient.ts`
- Modify: `src/components/RecipientList.tsx`
- Modify: `src/preview/MemoPreview.tsx`
- Modify: `src/docx/generateDocx.ts`
- Modify: `src/documentLayout.ts`

- [ ] **Step 1: Write failing tests** asserting that the salutation options exclude `Yth.`, recipient output still starts with `Yth.`, Lingkup wording contains `projectName` without implementation prefixes, schedule dates use a non-wrapping wrapper/XML no-break spaces, merged narrative cells stay left aligned, and every table border serializes as `w:sz="4"`.
- [ ] **Step 2: Run the focused tests** with `npx playwright test e2e/memo-builder.spec.ts --grep "recipient|Lingkup|schedule|merged|border"`; expected result is failure on the new assertions.
- [ ] **Step 3: Implement the minimal formatting changes** by centralizing the 0.5 pt border constant, formatting recipient attention as `Yth. ${salutation} ${name}`, using `projectName` in Lingkup introductions, applying `white-space: nowrap`/non-breaking spaces to date labels, and removing merge-dependent centering from narrative columns.
- [ ] **Step 4: Re-run the focused tests**; expected result is all selected tests passing.

### Task 2: Normalize rich text and closing/attachment rules

**Files:**
- Modify: `e2e/memo-builder.spec.ts`
- Modify: `src/utils/richText.ts`
- Modify: `src/docx/richTextToDocx.ts`
- Modify: `src/preview/MemoPreview.tsx`
- Modify: `src/docx/generateDocx.ts`

- [ ] **Step 1: Write failing tests** with a rich-text document ending in an empty paragraph after a bullet/numbered list; assert preview and DOCX contain no trailing blank line while preserving internal breaks. Assert attachment body starts at the shared body boundary and the closing rule uses the standard content width and stroke.
- [ ] **Step 2: Run the focused tests** with `npx playwright test e2e/memo-builder.spec.ts --grep "rich text|attachment|closing"`; expected result is failure on trailing-space and rule assertions.
- [ ] **Step 3: Add `trimTrailingEmptyRichTextNodes(doc)`** and call it from HTML and DOCX conversion without mutating store data. Render the closing block through the same section/body grid and border constant used by other rules.
- [ ] **Step 4: Re-run the focused tests**; expected result is all selected tests passing.

### Task 3: Recalibrate pagination and heading spacing

**Files:**
- Modify: `e2e/memo-builder.spec.ts`
- Modify: `src/pagination/paginate.ts`
- Modify: `src/preview/MemoPreview.tsx`
- Modify: `src/docx/generateDocx.ts`

- [ ] **Step 1: Write failing tests** that measure the final rendered block against the footer reserve, assert no premature continuation when another block fits, and inspect DOCX paragraph spacing for exactly one blank-line equivalent after Perihal and before the first wording.
- [ ] **Step 2: Run the focused tests** with `npx playwright test e2e/memo-builder.spec.ts --grep "pagination|Perihal|one-line spacing"`; expected result is failure on the new utilization bounds.
- [ ] **Step 3: Tune block estimates and page limits** to use the A4 body through the footer-safe boundary, and align preview/DOCX heading bottom spacing to one 11 pt line.
- [ ] **Step 4: Re-run the focused tests**; expected result is all selected tests passing.

### Task 4: Stabilize range dates and independent scenario groups

**Files:**
- Modify: `e2e/memo-builder.spec.ts`
- Modify: `src/components/DateRangePicker.tsx`
- Modify: `src/features/memo-builder/MemoBuilderApp.tsx`
- Modify: `src/pagination/paginate.ts`

- [ ] **Step 1: Write failing tests** that select a range in every calendar context, create two scenario date groups with the same range, edit the second group, and assert the first group is unchanged and both date headers remain.
- [ ] **Step 2: Run the focused tests** with `npx playwright test e2e/memo-builder.spec.ts --grep "calendar|duplicate date"`; expected result is failure because equal dates collapse into one group.
- [ ] **Step 3: Key scenario groups by `dateGroupId`** and preserve that ID through updates/import normalization. Add accessible labels to range-picker triggers and ensure all date fields use `DateRangePicker`.
- [ ] **Step 4: Re-run the focused tests**; expected result is all selected tests passing.

### Task 5: Add compact hierarchy drag-and-drop

**Files:**
- Modify: `e2e/memo-builder.spec.ts`
- Modify: `src/features/memo-builder/MemoBuilderApp.tsx`
- Modify: `src/components/DragDropList.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing tests** that add two dates and two sections, reorder date groups and sections, and assert each moved parent retains all child rows. Add assertions for compact summaries, expand/collapse state, visible focus, and 44 px action targets.
- [ ] **Step 2: Run the focused tests** with `npx playwright test e2e/memo-builder.spec.ts --grep "appendix hierarchy|drag"`; expected result is failure because date and section groups are not sortable.
- [ ] **Step 3: Wrap date groups and section groups in `DragDropList`** using flatten/reinsert helpers that move complete row slices. Add collapsible card headers and keep add/delete controls outside drag handles.
- [ ] **Step 4: Re-run the focused tests**; expected result is all selected tests passing.

### Task 6: Unify validation and preview-to-field navigation

**Files:**
- Modify: `e2e/memo-builder.spec.ts`
- Create: `src/utils/fieldNavigation.ts`
- Modify: `src/features/memo-builder/MemoBuilderApp.tsx`
- Modify: `src/preview/MemoPreview.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing tests** that click representative preview metadata, section, table, schedule, contact, and appendix cells; assert smooth navigation reaches the correct `data-field-id`, focus moves to its editable control, and a yellow highlight appears then clears. Assert mandatory export invokes the same behavior.
- [ ] **Step 2: Run the focused tests** with `npx playwright test e2e/memo-builder.spec.ts --grep "preview field|mandatory"`; expected result is failure because preview blocks are not interactive and the validation highlight is red/persistent.
- [ ] **Step 3: Add `focusEditorField(fieldId)`** with timer replacement, smooth scrolling, focus management, and a 2.4 second yellow highlight. Add stable `data-preview-field-id`, keyboard activation, and accessible hints to preview blocks, then route both preview clicks and validation through the helper.
- [ ] **Step 4: Re-run the focused tests**; expected result is all selected tests passing.

### Task 7: Match the review-comments reference

**Files:**
- Modify: `e2e/memo-builder.spec.ts`
- Modify: `src/features/memo-builder/MemoBuilderApp.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing tests** that open the review popup and assert its desktop width extends left from the right anchor, the header/count/close arrangement matches the reference, Add Comment and filter share one row, thread cards have a blue status rail, and action buttons meet the 44 px target.
- [ ] **Step 2: Run the focused tests** with `npx playwright test e2e/memo-builder.spec.ts --grep "review comments layout"`; expected result is failure on width and visual-contract assertions.
- [ ] **Step 3: Refine the existing popup markup and styles** without changing collaboration state, comment mutations, filters, audit entries, or field-focus callbacks.
- [ ] **Step 4: Re-run the focused tests**; expected result is all selected tests passing.

### Task 8: Full verification, GitHub update, and Cloudflare deployment

**Files:**
- Modify: `README.md` only if deployment commands differ from the repository's documented workflow.

- [ ] **Step 1: Run static verification** with `npm run lint` and `npm run build`; expected result is exit code 0 for both.
- [ ] **Step 2: Run the full regression suite** with `npm run test:e2e`; expected result is zero failed tests.
- [ ] **Step 3: Generate and inspect a representative DOCX** through the browser test, unpack `word/document.xml`, and confirm thin borders, page breaks, non-breaking dates, spacing, and left/center merge alignment assertions pass.
- [ ] **Step 4: Commit only scoped files** with `git add` paths listed above and `git commit -m "fix: align memo preview docx and scenario editing"`.
- [ ] **Step 5: Push the feature branch and fast-forward `origin/main`** after confirming it contains the verified commit.
- [ ] **Step 6: Deploy with the repository's Cloudflare Pages workflow**, then smoke-test `https://generate-memo.pages.dev/` for the updated dropdown, scenario grouping, validation jump, preview click, and successful DOCX download.
