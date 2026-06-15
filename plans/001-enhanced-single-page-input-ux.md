# Plan 001: Implement enhanced single-page input UX

> **Executor instructions**: Work only in
> `memo-generator-input-ux-experiment`. Publication was later approved for the
> isolated branch `codex/input-ux-experiment` and a separate Cloudflare Pages
> project. Do not modify or deploy from `main`.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction, correctness, UX, tests
- **Planned at**: source commit `2059fc8`, June 14, 2026
- **Status**: DONE, verified locally June 14, 2026

## Goal

Add local draft recovery, autosave feedback, input guidance, local suggestions,
reusable quick fill, clone controls, smart defaults, inline validation, and
completion navigation without changing preview or DOCX behavior.

## Architecture

Keep `MemoDraft` as the single source of truth. Add a browser-only preference
module for suggestions/profile and reusable UI primitives for guided inputs.
Leave pagination, preview rendering, and DOCX generation untouched.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| E2E | `npx playwright test` | all tests pass |
| Build | `npm run build` | static build succeeds |
| Local | `npm run dev:experiment` | localhost:3010 responds |

## Scope

### Create

- `src/input-ux/localInputPreferences.ts`
- `src/components/GuidedField.tsx`
- `src/components/InputSuggestionList.tsx`
- `src/components/FormCompletionBar.tsx`
- `docs/input-ux-manual-test-checklist.md`

### Modify

- `package.json`
- `src/store/useMemoDraftStore.ts`
- `src/features/memo-builder/MemoBuilderApp.tsx`
- `src/components/RecipientList.tsx`
- `src/components/SectionTitle.tsx`
- `src/editor/RichTextEditor.tsx`
- `src/app/globals.css`
- `e2e/memo-builder.spec.ts`
- `README.md`
- `plans/README.md`

### Explicitly Out Of Scope

- `src/types/memo.ts`
- `src/pagination/paginate.ts`
- `src/preview/**`
- `src/docx/**`
- validation-page behavior or template files
- collaboration protocol and public networking

## Steps

### 1. Establish Isolation

- Add `dev:experiment` with `next dev -p 3010`.
- Update README with local-only commands and warnings.
- Keep changes isolated from the original dirty worktree.

### 2. Add Characterization Tests

Extend `e2e/memo-builder.spec.ts` before implementation:

- stored draft restores after reload
- invalid stored JSON opens a blank draft and shows no crash
- autosave status reaches `Tersimpan`
- email and URL errors appear inline
- first-incomplete navigation focuses the target
- suggestion history survives reload
- reusable profile applies fresh collection rows
- cloning preserves values and creates an additional row
- new activity inherits schedule and previous PIC
- generated preview text and DOCX XML remain unchanged

Run targeted tests and confirm they fail for the missing behavior.

### 3. Repair Draft Persistence

In `src/store/useMemoDraftStore.ts`:

- extend status with `saving`
- parse `STORAGE_KEY` in `loadFromLocal`
- normalize with `normalizeMemoDraft`
- preserve `lastSavedAt`
- expose a lightweight action to mark saving
- clear corrupt values and fall back to `createInitialMemoDraft`
- make reset clear the stored draft

In `MemoBuilderApp`, replace the three-second interval with a 700 ms debounce
keyed by `draft.updatedAt`. Do not autosave while initial load is incomplete.

### 4. Add Local Preferences

Create `localInputPreferences.ts` with:

- versioned storage key
- typed suggestion categories
- maximum 12 case-insensitive unique recent values per category
- read/write functions guarded for SSR and invalid JSON
- one optional reusable profile
- profile serialization without source row IDs

No rich-text content is stored in suggestions.

### 5. Add Guided Field Primitives

Create:

- `GuidedField`: visible label, required mark, helper, inline error,
  `aria-invalid`, and `aria-describedby`
- `InputSuggestionList`: accessible datalist-backed suggestions and optional
  native manual input
- `FormCompletionBar`: autosave status, completed/total count, first issue,
  and jump action

Update `SectionTitle` to render its existing `description` prop.
Update `RichTextEditor` to accept a placeholder and expose it through
`data-placeholder`; add empty-editor placeholder CSS without a new dependency.

### 6. Integrate Validation

Enhance `ValidationIssue` with a recovery message. Keep all existing mandatory
rules and add:

- non-empty contact email must match a conservative email format
- enabled access link must parse as `http:` or `https:` after adding `https://`
  to host-like values for validation only

Track touched field IDs and recompute issues on blur. Reveal all issues after
Generate DOCX. Field wrappers and `RecipientList` receive issue lookup state.

### 7. Add Guidance And Suggestions

Apply examples/helpers to every input family. At minimum:

- project name
- recipient/tembusan position and name
- development item/description
- schedule and activity fields
- reference and attachment lists
- access URL
- contacts
- signers
- initials
- appendix section/scenario/result/PIC

Wire local suggestion categories to plain-text fields. Native manual input must
always remain available.

### 8. Add Quick Fill And Smart Defaults

Add a local quick-fill panel near the form top:

- save current routing profile
- apply saved profile

Applying a profile records one undo checkpoint and fresh IDs.

When adding:

- activity: inherit schedule dates and preceding owner
- appendix date group: inherit schedule dates

### 9. Add Clone Controls

Clone Kepada, Tembusan, Development, Activity, Contact, Signer, and Scenario
rows. Use template factory functions so every cloned row gets a new ID.
Scenario clones keep their date/section group IDs.

### 10. Verify Output Invariants

- Run all existing Playwright tests plus new UX tests.
- Generate a representative DOCX and compare its extracted `document.xml`
  values against the same draft before UX controls are used.
- Confirm no files under `src/docx`, `src/preview`, or `src/pagination` changed.
- Run lint, typecheck, full E2E, and build.
- Run browser QA only at `http://localhost:3010`.

## Done Criteria

- [x] Experiment was isolated during implementation and later initialized for
  the approved staging branch.
- [x] Original project status and HEAD match the recorded baseline.
- [x] Draft restores automatically after reload.
- [x] Autosave is debounced and reports saving/saved/error.
- [x] Every input family has clear placeholder or helper guidance.
- [x] Suggestions and reusable profile are local-only and bounded.
- [x] All repeated collections have clone behavior with fresh IDs.
- [x] Required, email, and URL errors render inline.
- [x] Completion count and jump action work.
- [x] Existing preview and DOCX regression tests pass.
- [x] No DOCX, preview, pagination, or type-schema files changed.
- [x] Lint, typecheck, full Playwright, and build pass.
- [x] Manual checklist exists.

## Stop Conditions

- Stop if implementation requires changing `MemoDraft`, preview, pagination, or
  DOCX code.
- Stop if a feature requires network access or an external directory.
- Stop if the original project hash changes.
- Stop if existing DOCX regression tests fail after two focused fixes.
