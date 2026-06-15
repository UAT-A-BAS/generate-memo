# Input UX Manual Test Checklist

Test target: `http://localhost:3010`

## Draft And Navigation

- [x] Edit Nama Project, wait for `Tersimpan`, reload, and confirm the value returns.
- [x] Corrupt local draft data falls back to a blank draft without crashing.
- [x] Reset clears the active draft and its stored local copy.
- [x] Completion bar shows completed/required fields.
- [x] `Ke field berikutnya` scrolls to and focuses the first issue.

## Guidance And Validation

- [x] Plain inputs show relevant examples or helper text.
- [x] Empty rich-text editors show a contextual placeholder.
- [x] Invalid email displays inline recovery text after blur.
- [x] Invalid enabled URL displays inline recovery text after blur.
- [x] Generate DOCX reveals all remaining mandatory issues.

## Reuse And Repeated Rows

- [x] Project, recipient, PIC, contact, signer, URL, and initials suggestions are browser-local.
- [x] Suggestions survive reload and retain at most 12 unique recent values.
- [x] Routing profile can be recorded and reapplied with fresh row IDs.
- [x] Kepada and Tembusan rows can be duplicated.
- [x] Development, Activity, Contact, Signer, and Scenario rows can be duplicated.
- [x] New Activity inherits the pilot schedule and previous PIC.
- [x] New appendix date group inherits the pilot schedule.

## Editing And Output

- [x] Ctrl+Z restores deleted or duplicated rows.
- [x] Ctrl+Z restores prior values after leaving standard fields.
- [x] Native undo remains available while typing in inputs and rich text.
- [x] Bold, italic, underline, bullet, and numbering work with mouse and keyboard.
- [x] Existing preview pagination tests pass.
- [x] Existing DOCX XML and download tests pass.
- [x] Validation page behavior remains unchanged.

## Final Verification

- [x] `npm run lint`
- [x] `npx tsc --noEmit`
- [x] `npx playwright test e2e/memo-builder.spec.ts` - 52/52 passed.
- [x] `npm run build`
- [x] Browser QA at 1280 px viewport shows no console warnings or errors.
- [x] Staging branch is isolated from `main`; the existing production workflow
  remains unchanged and only listens to `main`.
- [x] Original project HEAD and dirty-file list match the recorded baseline.
