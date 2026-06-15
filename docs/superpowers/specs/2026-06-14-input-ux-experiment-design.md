# Memo Generator Input UX Experiment Design

## Status

Approved by the user on June 14, 2026. Selected direction: **A. Enhanced Single Page**.

## Objective

Improve the existing Memo Generator form so users can complete a memo faster,
understand every field, recover from mistakes, and avoid invalid input while
preserving the existing `MemoDraft` data contract and document output.

The experiment is local-only. It lives in
`memo-generator-input-ux-experiment`, which has no `.git` directory or remote.

## Non-Negotiable Boundaries

- Do not modify the original `memo-builder-fresh` folder.
- Do not connect the app to a public deployment or external data service.
- Do not change the `MemoDraft` schema.
- Do not change DOCX structure, document wording, pagination, or validation page.
- Do not remove collaboration, comments, JSON save/load, undo, preview, or DOCX export.
- Store draft recovery, history, and reusable presets only in browser local storage.

## Experience Model

Keep the existing single-page form and sticky document preview. Add a
productivity layer:

1. A compact completion bar shows required-field progress, autosave status, and
   a button to jump to the next incomplete field.
2. Sections retain the existing order but gain concise helper descriptions.
3. Every text field receives an example-oriented placeholder and helper text
   where the expected format is not obvious.
4. Required fields show inline errors after blur or after an export attempt.
5. Repeated rows support duplicate/clone with new stable IDs.
6. Inputs with repeatable organizational data expose suggestions learned from
   browser-local history.
7. A reusable local profile can quick-fill recipients, contacts, signers,
   tembusan, initials, and bureau.
8. New activities and appendix date groups default to the memo schedule when
   available.

## Local Persistence

Use two independent local-storage records:

- Draft record: the existing `memo-builder-fresh:blank-draft-v2` key, now
  correctly read during startup and written with a 700 ms debounce after a
  draft change.
- UX preferences record: a new versioned key containing bounded suggestion
  arrays and one optional reusable profile.

Draft lifecycle:

1. On initial client load, parse and normalize the stored draft.
2. If storage is absent or invalid, open a blank normalized draft.
3. On change, show `Menyimpan...`, then write after the debounce.
4. On success show `Tersimpan HH:mm`; on failure show a visible recovery error.
5. Reset clears the stored draft and then persists the new blank draft.

## Suggestions And Quick Fill

Suggestions are non-authoritative. Selecting one writes the same plain string
that manual input would write. No suggestion is added to the DOCX directly.

History categories:

- project names
- recipient and tembusan positions
- recipient names
- activity owners
- contact names and emails
- signer names and titles
- appendix section names and PIC values
- access links

Each category keeps at most 12 unique recent values. Empty strings and rich-text
content are not recorded.

Reusable profile fields:

- bureau and initials bureau
- recipients
- contacts
- signers
- tembusan
- initials

Applying a profile generates fresh IDs for every collection row.

## Validation

The existing required-field rules remain the source of truth and are extended
with:

- email format for PIC contacts
- URL format when access link is enabled

Validation visibility:

- A field becomes eligible for inline feedback after it loses focus.
- An export attempt reveals all remaining issues.
- Correcting a value removes its inline error immediately.
- Error styling includes text and an icon/outline, never color alone.
- The completion bar counts required fields from the same validation model.
- `Jump ke field berikutnya` scrolls and focuses the first visible issue.

## Repeated Input Controls

Add duplicate controls to:

- Kepada and Tembusan rows
- Lingkup Pengembangan rows
- Aktivitas rows
- PIC contact rows
- Signature rows
- appendix scenarios

Cloning copies user-entered values but always assigns a new row ID. Appendix
scenario clones remain in the same date and section group.

## Smart Defaults

- Initial memo type remains `Pilot`.
- Initial Bureau and UAT remain `A`.
- New activity rows inherit the memo schedule and the preceding activity PIC.
- New appendix date groups inherit the memo schedule.
- Existing default Perihal generation remains unchanged.

## Layout And Accessibility

- Keep visible labels; placeholders never replace labels.
- Input heights remain at least 40 px, with 44 px targets for actions.
- Add `aria-invalid`, `aria-describedby`, and live save/error status.
- Preserve keyboard navigation, native autocomplete, and Ctrl+Z behavior.
- Avoid collapsing sections; the selected direction intentionally preserves
  simultaneous comparison and the existing spatial model.

## Testing Strategy

Add Playwright coverage for:

- draft autosave and automatic restore after reload
- invalid storage fallback
- autosave status
- inline required, email, and URL validation
- jump to next incomplete field
- local suggestions
- save/apply/delete reusable profile
- clone behavior and fresh IDs
- schedule-derived defaults
- unchanged preview values and generated DOCX XML

Run existing regression tests unchanged in addition to new tests.

