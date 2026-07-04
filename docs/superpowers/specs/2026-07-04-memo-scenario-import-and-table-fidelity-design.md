# Memo Scenario Import and Table Fidelity Design

## Objective

Allow users to append scenario data exported by the legacy MOM generator into only the memo's `Lampiran Skenario`, restore reversible salutation selection, prevent click-only scenario reordering, and make generated DOCX/PDF table grids consistently use a single 1 pt stroke.

## Scope and data ownership

The MOM import is deliberately appendix-only. It may read `lampiranState` from a MOM JSON file and append mapped rows to `draft.appendixScenarios`, but it must not read, replace, or derive memo metadata, recipients, development rows, activities, attachments, contacts, signers, CC recipients, initials, review data, or any other memo field.

Existing appendix scenarios remain in their current order. Imported date groups are appended after them in source order. Each imported date, feature, and scenario receives fresh stable memo IDs so imported groups cannot merge accidentally with existing groups or with one another.

## MOM mapping contract

The supported source shape is `lampiranState[] -> features[] -> scenarios[]`.

- `lampiranState[].date` maps to the scenario date group. Both `DD-MM-YYYY` and `DD-MM-YYYY - DD-MM-YYYY` are converted to the memo's internal ISO date values.
- `features[].title` maps to the appendix section title.
- `scenarios[].activity` maps to the rich-text `scenario` field.
- `scenarios[].result` maps to the rich-text `expectedResult` field.
- `pic` is always initialized as an empty string because the MOM source has no PIC value.
- `notes` is initialized as empty rich text.
- Source `flags` and unrelated root properties are ignored.

The parser returns scenario rows only. It never constructs or normalizes a complete `MemoDraft` for this workflow.

## Import interaction

A dedicated **Import Skenario** button appears immediately to the left of **Collapse All / Expand All** in the `Lampiran Skenario` header. It uses a separate hidden JSON file input from the global **Load** action.

On a valid file, mapped rows are appended atomically and the newly imported hierarchy is available in the editor. PIC remains mandatory, so DOCX generation continues to block until every imported PIC is filled.

On malformed JSON, an unsupported `lampiranState` shape, or a file with no importable scenarios, the existing memo and appendix remain unchanged. A concise recovery message is shown within the `Lampiran Skenario` panel and announced through an accessible alert region. Selecting the same file again remains possible after either success or failure.

## Salutation behavior

Every salutation dropdown continues to offer `Sapaan`, `Bapak`, `Ibu`, and `Tim`. The empty `Sapaan` option is selectable after another value has been chosen, allowing users to clear the salutation without deleting the recipient row. Existing mandatory rules remain unchanged: required recipient salutations still fail validation when cleared, while optional CC salutations may remain empty.

## Drag-and-drop behavior

Pointer sorting requires deliberate pointer movement before activation. A normal click or tap on a drag handle must not call reorder logic or move an item to the bottom. Date, section, and scenario dragging continue to work across the supported hierarchy, and the existing keyboard sensor remains available for accessible reordering.

## Table border contract

All visible data tables in generated DOCX use one canonical table-level border grid:

- `top`, `left`, `bottom`, `right`, `insideH`, and `insideV` use a black single line with OOXML size `8`, equal to 1 pt;
- visible cell-level borders are not emitted, preventing coincident table and cell strokes;
- the right-border normalization step inherits the same 1 pt size and must not introduce a second visible border source;
- section divider rules are unchanged;
- browser preview tables retain their existing collapsed 1 px border grid.

The DOCX is converted to PDF during verification so rasterized table intersections, outside edges, merged rows, and appendix group rows can be inspected rather than inferred from XML alone.

## Testing and verification

Regression coverage is written before implementation and proves:

- a selected salutation can be changed back to `Sapaan` in required and optional recipient lists;
- clicking a scenario drag handle leaves the order unchanged, while actual drag reordering still succeeds;
- the supplied MOM fixture appends only mapped appendix rows, preserves all other memo fields, retains source order, converts dates, and leaves PIC empty;
- malformed or empty MOM input leaves state unchanged and shows an appendix-local error;
- imported empty PIC values remain part of mandatory export validation;
- DOCX tables use exactly one table-level `w:sz="8"` grid and no visible cell-level border grid.

The release gate runs ESLint, the production Next.js build, relevant Playwright regressions, and the full Playwright suite. A representative DOCX is generated, structurally inspected, rendered page-by-page to PNG, converted to PDF, and every page is visually inspected at 100% for doubled borders, clipping, overlap, and inconsistent table edges. After verification, the completed change is integrated into and pushed to `main`, then the Cloudflare production deployment and live workflow are checked.

## Baseline note

Before implementation, ESLint and the production build passed. The existing Playwright baseline passed 86 tests and timed out in two unrelated collaboration WebSocket lifecycle tests, including when those two tests were rerun in isolation. This pre-existing baseline must be kept separate from the scenario-import and document-fidelity regression results.
