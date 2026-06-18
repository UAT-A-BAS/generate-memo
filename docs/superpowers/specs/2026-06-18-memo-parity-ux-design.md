# Memo Preview, DOCX, and Scenario UX Parity Design

## Objective

Make the memo editor, browser preview, generated DOCX, and Word-to-PDF rendering agree on content, spacing, rules, alignment, grouping, and pagination while making large scenario appendices easier to edit.

## Formatting contract

- `Yth.` is always emitted by recipient formatting and is removed from salutation dropdowns. The dropdown keeps `Bapak`, `Ibu`, and `Tim`.
- The memo heading is followed by exactly one blank-line equivalent before the first section in preview and DOCX.
- `Lingkup Pengembangan` introductory wording uses only `metadata.projectName`; it never repeats `Pilot Implementasi` or `Implementasi`.
- Schedule dates render as one non-breaking unit so the day range and month/year wrap together.
- Attachment content begins at the same body-column boundary in preview and DOCX.
- The closing sentence uses the same content-column rule width and stroke as other section rules.
- Table borders use a 0.5 pt Word stroke to stay visually stable after PDF conversion.
- Rich-text table values remove only trailing empty paragraphs; intentional internal paragraph breaks and list items remain.
- Vertically merged cells retain each column's default horizontal alignment: narrative columns left, PIC/date/number columns centered.

## Pagination

The existing deterministic block paginator remains the source of page grouping for preview and DOCX. Height estimates and continuation reserves are recalibrated against the rendered A4 boundaries so content can use the area immediately above the footer without overlapping it. Preview and DOCX consume the same `PreviewPage` sequence.

## Dates and scenario hierarchy

All memo date controls use the shared range picker with explicit `Clear`, `Hari ini`, and `Done` actions. Scenario date groups are keyed only by stable `dateGroupId`, never by the date text, so two equal dates remain independent.

The appendix hierarchy is `date group -> section -> scenario`. Dragging a date moves all descendant sections and scenarios. Dragging a section moves all of its scenarios within its date group. Scenario drag-and-drop remains available. Keyboard move controls remain available through the existing sortable abstraction.

## Scenario editor UX

Date groups and sections use compact cards with persistent summaries and collapsible bodies. The currently edited group remains expanded. Add actions stay at the hierarchy level they affect. Delete actions remain explicit and do not share the drag handle. Touch targets are at least 44 px and focus rings remain visible.

## Review comments

The review-comments popup follows the supplied reference: it expands farther to the left while remaining anchored to the right edge, uses a compact title/count header, places the primary Add Comment action and status filter on one row, and renders each thread as a bordered card with a blue status rail. Reply metadata, comment logs, field links, and icon actions remain visible and keyboard accessible without changing collaboration behavior.

## Validation and preview navigation

Every preview block exposes a stable target field ID. Clicking preview content calls one shared navigation function that smooth-scrolls to the matching editor field, focuses the first editable control, and applies a yellow highlight that removes itself after 2.4 seconds. Mandatory validation uses the same function and blocks DOCX generation until all issues are resolved.

## Verification

Playwright tests cover recipient formatting, section wording and spacing, closing rules, border XML, non-breaking dates, list trimming, merge alignment, page utilization, duplicate date independence, hierarchy drag-and-drop, mandatory validation, and preview-to-field navigation. The final gate runs ESLint, the production Next.js build, the full Playwright suite, a generated DOCX XML inspection, and a production smoke test after deployment.
